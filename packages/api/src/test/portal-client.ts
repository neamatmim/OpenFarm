import { session as sessionTable } from "@OpenFarm/db/schema/auth";
import { mobileNumberOf } from "@OpenFarm/domain";
import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import type { RouterClient } from "@orpc/server";
import { createRouterClient } from "@orpc/server";

import { buildContext } from "../context";
import type { EmailTransport } from "../email";
import { appRouter } from "../routers";
import type { SmsMessage, SmsTransport } from "../sms";
import { createTestClient } from "./client";

// The Investor's side of the portal, for tests that drive it: an Investor written down, invited and joined, and the
// API as they reach it signed in. Each test file's own Farm, as every other test client's.

type Client = RouterClient<typeof appRouter>;

/** The password every Investor these tests invite chooses: not a common one, which joining would refuse. */
const PASSWORD = "gorur-khamar-2026";

/** How long a test's sign-in lasts: a day, longer than any test runs. */
const A_DAY_MS = 24 * 60 * 60 * 1000;

/** Every text a portal client in the tests sent, by the number it went to — the world's way of writing it — latest last. */
const texts = new Map<string, SmsMessage[]>();

/** A text gateway that takes every message and keeps it, as the tests' portal clients send through by default. */
export const textsKept: SmsTransport = {
  sends: true,
  send: (to, message) => {
    texts.set(to, [...(texts.get(to) ?? []), message]);
    return Promise.resolve({ delivered: true });
  },
};

/** The texts sent to a phone, however it was typed, latest last. */
export const textsTo = (phone: string): SmsMessage[] =>
  texts.get(mobileNumberOf(phone) ?? phone) ?? [];

/** The six-digit code in the latest text to a phone. */
export const codeTextedTo = (phone: string): string => {
  const code = textsTo(phone)
    .at(-1)
    ?.text.match(/\b\d{6}\b/u)?.[0];
  if (!code) {
    throw new Error(`expected a code texted to ${phone}`);
  }
  return code;
};

/** The Signing Code an Investor asks for to agree to one paper, as the farm texts it to them. */
export const aSigningCode = async (
  them: { client: Client; phone: string },
  kind: "agreement_offer" | "amendment_offer",
  offerId: string
): Promise<string> => {
  await them.client.portal.sendSigningCode({ kind, offerId });
  return codeTextedTo(them.phone);
};

/** The API as the account an invitation opened reaches it, signed in at the moment given. */
export const signedInAs = async (
  loginEmail: string,
  at: string,
  {
    email,
    sms = textsKept,
  }: {
    /** Where an email goes. Omitted, nowhere, as on a farm with no mail account. */
    email?: EmailTransport;
    /** Where a text goes. Omitted, into the tests' own outbox (`textsTo`). */
    sms?: SmsTransport;
  } = {}
): Promise<Client> => {
  const db = scratchDb();
  const person = await db.query.user.findFirst({
    where: { email: loginEmail },
  });
  if (!person) {
    throw new Error("expected the Investor's account");
  }
  const clock = new FakeClock(at);
  const start = clock.now();
  const id = `portal-session-${person.id}-${at}`;
  await db
    .insert(sessionTable)
    .values({
      id,
      token: `portal-token-${person.id}-${at}`,
      userId: person.id,
      expiresAt: new Date(start.getTime() + A_DAY_MS),
      createdAt: start,
      updatedAt: start,
    })
    .onConflictDoNothing();
  const session = await db.query.session.findFirst({ where: { id } });
  if (!session) {
    throw new Error("expected the session");
  }
  const context = await buildContext({
    session: { user: person, session },
    device: null,
    deviceStatus: "none",
    callerAddress: null,
    clock,
    db,
    email,
    sms,
    farmId: theFarm().id,
  });
  return createRouterClient(appRouter, { context });
};

/** The word a refusal gives, or nothing. */
const wordOf = (error: unknown): string | null => {
  const data = (error as { data?: { refusal?: unknown } } | null)?.data;
  return typeof data?.refusal === "string" ? data.refusal : null;
};

/**
 * An Owner's invitation as the farm gives one: the Portal Consent signed in front of them first — unless one is in
 * force already, as for a second code — and then the code.
 */
export const invitedWithConsent = async (owner: Client, id: string) => {
  try {
    await owner.investors.recordConsent({ id });
  } catch (error) {
    // Signed already, as for a second code: the consent in force stands.
    if (wordOf(error) !== "consent_in_force") {
      throw error;
    }
  }
  return owner.investors.inviteToPortal({ id });
};

/** An Investor already written down, invited now and joined with their phone: the account the invitation opened. */
const joined = async (investorId: string, phone: string, at: string) => {
  const { client: owner } = await createTestClient(appRouter, {
    as: "owner",
    clock: new FakeClock(at),
  });
  const { code } = await invitedWithConsent(owner, investorId);
  const { client: nobody } = await createTestClient(appRouter, {
    as: null,
    clock: new FakeClock(at),
  });
  const { loginEmail } = await nobody.portal.join({
    phone,
    code,
    password: PASSWORD,
  });
  return loginEmail;
};

/** An Investor the Owner wrote down already — signed on a Venture, say — invited and joined, and the API as they
 *  reach it at the moment given. */
export const theyJoin = async (investorId: string, phone: string, at: string) =>
  await signedInAs(await joined(investorId, phone, at), at);

/**
 * An Investor the Owner wrote down and invited, who took the invitation up with their phone: their id, the account
 * they sign in as, and the API as they reach it at the moment given.
 */
export const anInvitedInvestor = async (
  { name, phone }: { name: string; phone: string },
  at: string
) => {
  const { client: owner } = await createTestClient(appRouter, {
    as: "owner",
    clock: new FakeClock(at),
  });
  const them = await owner.investors.record({
    name,
    phone,
    address: "সাভার",
    nid: "1234567890",
    bankAccount: `01234${phone.slice(-5)}`,
  });
  const loginEmail = await joined(them.id, phone, at);
  const account = await scratchDb().query.user.findFirst({
    where: { email: loginEmail },
    columns: { id: true },
  });
  return {
    id: them.id,
    phone,
    userId: account?.id ?? "",
    loginEmail,
    client: await signedInAs(loginEmail, at),
  };
};

/**
 * Invites Investors one after another for a test file, each on a phone of their own: eleven digits, the file's own
 * prefix, a count, and the run's six digits, so no two files and no two runs share a number.
 */
export const invitingInvestors = (
  {
    prefix,
    run,
  }: {
    prefix: "016" | "017" | "018" | "019";
    run: string;
  },
  at: string
) => {
  let invitedSoFar = 0;
  return (name: string) => {
    invitedSoFar += 1;
    const phone = `${prefix}${String(invitedSoFar).padStart(2, "0")}${run.slice(-6)}`;
    return anInvitedInvestor({ name: `${name} ${run}`, phone }, at);
  };
};
