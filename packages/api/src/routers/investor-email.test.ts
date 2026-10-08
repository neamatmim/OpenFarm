import { emailCode } from "@OpenFarm/db/schema/venture";
import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import type { EmailMessage, EmailTransport } from "../email";
import { hashOfCodeAsTyped } from "../membership";
import { createTestClient } from "../test/client";
import { anInvitedInvestor, signedInAs } from "../test/portal-client";
import { appRouter } from "./index";

// An Investor's email, confirmed once (ADR 0022): written by the Owner, optional; confirmed by the Investor entering
// in the portal a code the farm sent there. Until then no signing code goes to it.

const suffix = `${Date.now()}`.slice(-6);
const AT = "2080-02-03T04:00:00.000Z";
const A_MINUTE_LATER = "2080-02-03T04:01:00.000Z";
const AN_HOUR_LATER = "2080-02-03T05:00:00.000Z";

const asOwner = async () => {
  const { client } = await createTestClient(appRouter, {
    as: "owner",
    clock: new FakeClock(AT),
  });
  return client;
};

/** A mail account that keeps what it was given, or one whose server will not take it. */
const anOutbox = (takes = true) => {
  const sent: { to: string; message: EmailMessage }[] = [];
  const transport: EmailTransport = {
    sends: true,
    send: (to, message) => {
      sent.push({ to, message });
      return Promise.resolve({ delivered: takes });
    },
  };
  return { sent, transport };
};

/** The code in the latest email. */
const codeIn = (sent: { message: EmailMessage }[]) => {
  const code = sent.at(-1)?.message.text.match(/\b\d{6}\b/u)?.[0];
  if (!code) {
    throw new Error("expected a code in the email");
  }
  return code;
};

/** Their record with this email, as the Owner puts it right: the whole record, as `anInvitedInvestor` wrote it. */
const withEmail = async (
  them: { id: string },
  name: string,
  phone: string,
  email?: string
) => {
  const owner = await asOwner();
  await owner.investors.update({
    id: them.id,
    name,
    phone,
    address: "সাভার",
    nid: "1234567890",
    bankAccount: `01234${phone.slice(-5)}`,
    email,
  });
};

/** Their email as the Owner's list has it. */
const onTheList = async (id: string) => {
  const owner = await asOwner();
  const { people } = await owner.investors.list();
  const them = people.find((one) => one.id === id);
  return { email: them?.email, confirmedAt: them?.emailConfirmedAt };
};

/** When the Owner's list says they confirmed their email. */
const confirmedAtOf = async (id: string) => {
  const listed = await onTheList(id);
  return listed.confirmedAt;
};

/** An invited Investor with an email on their record, and the API as they reach it with a mail account. */
const anInvestorWithEmail = async (count: number, email: string) => {
  const name = `ইমেইল ${count} ${suffix}`;
  const phone = `0177${suffix}${count}`;
  const them = await anInvitedInvestor({ name, phone }, AT);
  await withEmail(them, name, phone, email);
  const outbox = anOutbox();
  return {
    ...them,
    name,
    phone,
    outbox,
    at: (when: string) => signedInAs(them.loginEmail, when, outbox.transport),
  };
};

beforeAll(async () => {
  const owner = await asOwner();
  await owner.farm.setIdentity({
    address: `সাভার, ঢাকা ${suffix}`,
    phone: "+8801711000097",
    registrationNumber: `DLS/SAV/2080/${suffix}`,
    registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর, সাভার",
    registrationExpiresOn: "2082-03-31",
  });
  await owner.investors.setPortalOpen({ open: true });
});

describe("an Investor's email", () => {
  it("is written by the Owner as one address however typed, and is not confirmed until they confirm it", async () => {
    const them = await anInvestorWithEmail(1, "  Rahim.Uddin@Example.COM ");

    expect(await onTheList(them.id)).toEqual({
      email: "rahim.uddin@example.com",
      confirmedAt: null,
    });
    const portal = await them.at(AT);
    const me = await portal.portal.me();
    expect(me.record.email).toEqual({
      shown: "ra•••@example.com",
      confirmed: false,
    });
    expect(me.record.farmSendsEmail).toBe(true);
  });

  it("is confirmed by the code the farm sends it, in both languages, and the trail says they did it", async () => {
    const them = await anInvestorWithEmail(2, "salma@example.com");
    const portal = await them.at(AT);

    const sent = await portal.portal.sendEmailCode();
    expect(sent).toEqual({ sentTo: "sa•••@example.com" });
    expect(them.outbox.sent).toHaveLength(1);
    const [email] = them.outbox.sent;
    expect(email?.to).toBe("salma@example.com");
    expect(email?.message.text).toContain("নিশ্চিত");
    expect(email?.message.text).toContain("confirm your email");
    await portal.portal.confirmEmail({ code: codeIn(them.outbox.sent) });

    const me = await portal.portal.me();
    expect(me.record.email?.confirmed).toBe(true);
    expect(await confirmedAtOf(them.id)).toEqual(new Date(AT));
    const owner = await asOwner();
    const trail = await owner.audit.list({ entity: "investor", limit: 50 });
    const confirmed = trail.find(
      (one) =>
        one.entityId === them.id &&
        (one.after as { emailConfirmedAt?: unknown } | null)
          ?.emailConfirmedAt !== null &&
        (one.before as { emailConfirmedAt?: unknown } | null)
          ?.emailConfirmedAt === null
    );
    expect(confirmed?.actorId).toBe(them.userId);
    // Nothing is left to enter again.
    expect(
      await scratchDb().query.emailCode.findFirst({
        where: { investorId: them.id },
      })
    ).toBeUndefined();
  });

  it("takes the code in Bangla digits too", async () => {
    const them = await anInvestorWithEmail(3, "karim@example.com");
    const portal = await them.at(AT);
    await portal.portal.sendEmailCode();
    const bangla = [...codeIn(them.outbox.sent)]
      .map((digit) => "০১২৩৪৫৬৭৮৯"[Number(digit)])
      .join("");

    await portal.portal.confirmEmail({ code: bangla });

    const me = await portal.portal.me();
    expect(me.record.email?.confirmed).toBe(true);
  });

  it("refuses a wrong code, and stops anybody guessing after ten — the right one too", async () => {
    const them = await anInvestorWithEmail(4, "jamal@example.com");
    const portal = await them.at(AT);
    await portal.portal.sendEmailCode();
    const right = codeIn(them.outbox.sent);
    const wrong = right === "000000" ? "111111" : "000000";

    // One at a time, as a person types them: a limit tested in a burst passes with the rule gone.
    for (let tried = 0; tried < 10; tried += 1) {
      // oxlint-disable-next-line no-await-in-loop
      await expect(
        portal.portal.confirmEmail({ code: wrong })
      ).rejects.toMatchObject({ data: { refusal: "wrong_code" } });
    }
    await expect(
      portal.portal.confirmEmail({ code: right })
    ).rejects.toMatchObject({ data: { refusal: "too_many_codes" } });
    expect(await confirmedAtOf(them.id)).toBeNull();
  });

  it("is unconfirmed by the Owner changing it, and a code sent to the old one confirms nothing", async () => {
    const them = await anInvestorWithEmail(5, "old@example.com");
    const portal = await them.at(AT);
    await portal.portal.sendEmailCode();
    await portal.portal.confirmEmail({ code: codeIn(them.outbox.sent) });

    // The same address, typed otherwise, stays confirmed.
    await withEmail(them, them.name, them.phone, "OLD@example.com");
    expect(await confirmedAtOf(them.id)).toEqual(new Date(AT));

    const later = await them.at(A_MINUTE_LATER);
    await withEmail(them, them.name, them.phone, "new@example.com");
    expect(await onTheList(them.id)).toEqual({
      email: "new@example.com",
      confirmedAt: null,
    });
    await later.portal.sendEmailCode();
    const toTheNew = codeIn(them.outbox.sent);
    await withEmail(them, them.name, them.phone, "newer@example.com");

    await expect(
      later.portal.confirmEmail({ code: toTheNew })
    ).rejects.toMatchObject({ data: { refusal: "wrong_code" } });
    expect(await confirmedAtOf(them.id)).toBeNull();
  });

  it("is not confirmed by a code that went to an address no longer theirs, as one sent while the Owner changed it", async () => {
    const them = await anInvestorWithEmail(0, "raced@example.com");
    // What a send leaves when the Owner changes the email between the farm reading it and keeping the code.
    await scratchDb()
      .insert(emailCode)
      .values({
        id: `raced-${suffix}`,
        farmId: theFarm().id,
        investorId: them.id,
        email: "before@example.com",
        codeHash: await hashOfCodeAsTyped("123456"),
        sentAt: new Date(AT),
        expiresAt: new Date(AN_HOUR_LATER),
      });

    const portal = await them.at(AT);
    await expect(
      portal.portal.confirmEmail({ code: "123456" })
    ).rejects.toMatchObject({ data: { refusal: "wrong_code" } });
    expect(await confirmedAtOf(them.id)).toBeNull();
  });

  it("is sent a code once a minute at most, and five times an hour", async () => {
    const them = await anInvestorWithEmail(6, "often@example.com");
    const portal = await them.at(AT);
    await portal.portal.sendEmailCode();

    await expect(portal.portal.sendEmailCode()).rejects.toMatchObject({
      data: { refusal: "email_sent_just_now" },
    });
    const aMinuteOn = await them.at(A_MINUTE_LATER);
    await aMinuteOn.portal.sendEmailCode();
    for (const minute of ["02", "03", "04"]) {
      // oxlint-disable-next-line no-await-in-loop
      const then = await them.at(`2080-02-03T04:${minute}:00.000Z`);
      // oxlint-disable-next-line no-await-in-loop
      await then.portal.sendEmailCode();
    }
    const sixth = await them.at("2080-02-03T04:05:00.000Z");
    await expect(sixth.portal.sendEmailCode()).rejects.toMatchObject({
      data: { refusal: "email_sent_just_now" },
    });
    expect(them.outbox.sent).toHaveLength(5);
    const anHourOn = await them.at(AN_HOUR_LATER);
    await anHourOn.portal.sendEmailCode();
    expect(them.outbox.sent).toHaveLength(6);
  });

  it("is sent nothing on a farm with no mail account, nor kept a code the mail server would not take", async () => {
    const them = await anInvestorWithEmail(7, "nomail@example.com");
    const silent = await signedInAs(them.loginEmail, AT);
    const silentMe = await silent.portal.me();
    expect(silentMe.record.farmSendsEmail).toBe(false);
    await expect(silent.portal.sendEmailCode()).rejects.toMatchObject({
      data: { refusal: "farm_sends_no_email" },
    });

    const refusing = anOutbox(false);
    const portal = await signedInAs(them.loginEmail, AT, refusing.transport);
    await expect(portal.portal.sendEmailCode()).rejects.toMatchObject({
      data: { refusal: "email_not_sent" },
    });
    expect(
      await scratchDb().query.emailCode.findFirst({
        where: { investorId: them.id },
      })
    ).toBeUndefined();
  });

  it("is asked for nothing of somebody with no email, or one confirmed already", async () => {
    const without = await anInvestorWithEmail(8, "x@example.com");
    await withEmail(without, without.name, without.phone);
    const theirs = await without.at(AT);
    await expect(theirs.portal.sendEmailCode()).rejects.toMatchObject({
      data: { refusal: "no_email" },
    });
    const me = await theirs.portal.me();
    expect(me.record.email).toBeNull();

    const done = await anInvestorWithEmail(9, "done@example.com");
    const portal = await done.at(AT);
    await portal.portal.sendEmailCode();
    await portal.portal.confirmEmail({ code: codeIn(done.outbox.sent) });
    const later = await done.at(AN_HOUR_LATER);
    await expect(later.portal.sendEmailCode()).rejects.toMatchObject({
      data: { refusal: "email_confirmed" },
    });
  });
});
