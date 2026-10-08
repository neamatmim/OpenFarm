import { eq } from "@OpenFarm/db/operators";
import { investor } from "@OpenFarm/db/schema/venture";
import { FakeClock, scratchDb } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import type { EmailMessage, EmailTransport } from "../email";
import type { SmsTransport } from "../sms";
import { createTestClient } from "../test/client";
import {
  invitedWithConsent,
  invitingInvestors,
  textsKept,
  textsTo,
} from "../test/portal-client";
import { appRouter } from "./index";

// A new code sent to an Investor already invited in person — a forgotten password, a code run out — by text to the
// phone they sign in with, and by email only to an address they confirmed. The Owner never sees it, and the first code
// is still handed over in person.

const suffix = `${Date.now()}`.slice(-6);
const JANUARY = "2097-01-01T04:00:00.000Z";
const A_MINUTE_LATER = "2097-01-01T04:01:00.000Z";
const NEW_PASSWORD = "notun-pasword-2097";

const invited = invitingInvestors({ prefix: "018", run: suffix }, JANUARY);

/** A mail account that keeps what it was given. */
const anOutbox = () => {
  const sent: { to: string; message: EmailMessage }[] = [];
  const transport: EmailTransport = {
    sends: true,
    send: (to, message) => {
      sent.push({ to, message });
      return Promise.resolve({ delivered: true });
    },
  };
  return { sent, transport };
};

/** The Owner, texting through the tests' own outbox and mailing through the one given. */
const owner = async (
  at = JANUARY,
  {
    sms = textsKept,
    email,
  }: { sms?: SmsTransport; email?: EmailTransport } = {}
) => {
  const { client } = await createTestClient(appRouter, {
    as: "owner",
    clock: new FakeClock(at),
    sms,
    email,
  });
  return client;
};

const refusalOf = async (act: Promise<unknown>) => {
  try {
    await act;
  } catch (error) {
    return (error as { data?: { refusal?: string } }).data?.refusal;
  }
  throw new Error("expected a refusal");
};

/** The portal code in a message: eight of the code's own letters and digits. */
const codeIn = (text: string) => {
  const code = text.match(/\b[A-HJ-NP-Z2-9]{8}\b/u)?.[0];
  if (!code) {
    throw new Error(`expected a code in: ${text}`);
  }
  return code;
};

/** Takes a code up as the join page does: their phone, the code, and a password of their own. */
const join = async (phone: string, code: string, at = A_MINUTE_LATER) => {
  const { client: nobody } = await createTestClient(appRouter, {
    as: null,
    clock: new FakeClock(at),
  });
  const { loginEmail } = await nobody.portal.join({
    phone,
    code,
    password: NEW_PASSWORD,
  });
  return loginEmail;
};

/** A new code sent by the Owner at a moment, through the ways given. */
const sendAs = async (
  id: string,
  at = JANUARY,
  ways: { sms?: SmsTransport; email?: EmailTransport } = {}
) => {
  const boss = await owner(at, ways);
  return boss.investors.sendNewCode({ id });
};

/** Their row on the Owner's list of Investors. */
const rowOf = async (id: string) => {
  const boss = await owner();
  const { people } = await boss.investors.list();
  return people.find((one) => one.id === id);
};

beforeAll(async () => {
  const boss = await owner();
  await boss.investors.setPortalOpen({ open: true });
});

const confirmEmail = (id: string, email: string) =>
  scratchDb()
    .update(investor)
    .set({ email, emailConfirmedAt: new Date(JANUARY) })
    .where(eq(investor.id, id));

describe("a new code sent to somebody already invited", () => {
  it("goes by text to the phone they sign in with, takes them in with a new password, and is never shown to the Owner", async () => {
    const them = await invited("ভুলে যাওয়া");
    const before = textsTo(them.phone).length;

    const sent = await sendAs(them.id);

    const texts = textsTo(them.phone);
    expect(texts).toHaveLength(before + 1);
    const code = codeIn(texts.at(-1)?.text ?? "");
    expect(JSON.stringify(sent)).not.toContain(code);
    expect(sent.bySms).toMatch(/\d{2}$/u);
    expect(sent.bySms).not.toBe(them.phone);
    expect(sent.byEmail).toBeNull();
    expect(texts.at(-1)?.text).toContain("/portal/join");
    const taken = await join(them.phone, code);
    expect(taken).toBe(them.loginEmail);
  });

  it("is emailed only to an address they confirmed, never to one merely written down", async () => {
    const them = await invited("ইমেইল");
    const db = scratchDb();
    await db
      .update(investor)
      .set({ email: `kept-${suffix}@example.com`, emailConfirmedAt: null })
      .where(eq(investor.id, them.id));
    const unconfirmed = anOutbox();

    const first = await sendAs(them.id, JANUARY, {
      email: unconfirmed.transport,
    });

    expect(first.byEmail).toBeNull();
    expect(unconfirmed.sent).toHaveLength(0);

    await confirmEmail(them.id, `kept-${suffix}@example.com`);
    const confirmed = anOutbox();
    const second = await sendAs(them.id, A_MINUTE_LATER, {
      email: confirmed.transport,
    });

    expect(second.byEmail).not.toBeNull();
    expect(second.byEmail).not.toBe(`kept-${suffix}@example.com`);
    expect(confirmed.sent.map((one) => one.to)).toEqual([
      `kept-${suffix}@example.com`,
    ]);
    // The same code by both ways, and it takes them in.
    const mailed = codeIn(confirmed.sent[0]?.message.text ?? "");
    expect(codeIn(textsTo(them.phone).at(-1)?.text ?? "")).toBe(mailed);
    expect(await join(them.phone, mailed)).toBe(them.loginEmail);
  });

  it("is said on their row, where it went and when, until a code is handed over in person", async () => {
    const them = await invited("সারিতে");

    await sendAs(them.id);

    const row = await rowOf(them.id);
    expect(row?.portalCodeSent?.bySms).toMatch(/\d{2}$/u);
    expect(new Date(row?.portalCodeSent?.at ?? 0).toISOString()).toBe(JANUARY);

    const later = await owner(A_MINUTE_LATER);
    await later.investors.inviteToPortal({ id: them.id });
    const after = await rowOf(them.id);
    expect(after?.portalCodeSent).toBeNull();
  });
});

describe("a new code is not sent", () => {
  it("for the first code, which is handed over in person with the Welcome Letter", async () => {
    const boss = await owner();
    const fresh = await boss.investors.record({
      name: `নতুন ${suffix}`,
      phone: `01899${suffix}`,
    });
    await boss.investors.recordConsent({ id: fresh.id });

    expect(await refusalOf(boss.investors.sendNewCode({ id: fresh.id }))).toBe(
      "first_code_in_person"
    );
    expect(textsTo(`01899${suffix}`)).toHaveLength(0);
  });

  it("to somebody whose access was taken away, who is given it back in person", async () => {
    const them = await invited("তুলে নেওয়া");
    const boss = await owner();
    await boss.investors.takePortalAway({
      id: them.id,
      why: { reason: "lost_phone" },
    });
    const before = textsTo(them.phone).length;

    expect(await refusalOf(boss.investors.sendNewCode({ id: them.id }))).toBe(
      "access_taken_away"
    );
    expect(textsTo(them.phone)).toHaveLength(before);
  });

  it("twice in a minute", async () => {
    const them = await invited("দুবার");
    await sendAs(them.id);

    expect(await refusalOf(sendAs(them.id, "2097-01-01T04:00:30.000Z"))).toBe(
      "code_sent_just_now"
    );
    await sendAs(them.id, A_MINUTE_LATER);
  });

  it("where the farm has no way to reach them: no texts, and no email they confirmed", async () => {
    const them = await invited("উপায় নেই");
    const noTexts: SmsTransport = {
      sends: false,
      send: () => Promise.resolve({ delivered: false }),
    };

    expect(await refusalOf(sendAs(them.id, JANUARY, { sms: noTexts }))).toBe(
      "no_way_to_send_a_code"
    );
  });

  it("in place of the code they hold, when nothing went", async () => {
    const them = await invited("যায়নি");
    const boss = await owner();
    // A code handed over in person, not yet taken up.
    const { code: handed } = await invitedWithConsent(boss, them.id);
    const failing: SmsTransport = {
      sends: true,
      send: () => Promise.resolve({ delivered: false }),
    };

    expect(await refusalOf(sendAs(them.id, JANUARY, { sms: failing }))).toBe(
      "code_not_sent"
    );
    expect(await join(them.phone, handed)).toBe(them.loginEmail);
  });
});
