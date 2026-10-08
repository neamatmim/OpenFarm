import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq } from "@OpenFarm/db/operators";
import { emailCode, investor } from "@OpenFarm/db/schema/venture";
import { translate } from "@OpenFarm/i18n";
import { ORPCError } from "@orpc/server";

import { refused } from "./agreeing-in-app";
import {
  CODE_ATTEMPTS,
  EMAIL_SENDS,
  countFailure,
  forgetFailures,
  lockedOut,
} from "./attempts";
import type { Tx } from "./audit";
import { audited } from "./audit";
import type { Context } from "./context";
import { readInvestor } from "./investor-store";
import { hashOfCodeAsTyped } from "./membership";

// An Investor's email, confirmed once (ADR 0022): the farm sends a code to the address the Owner wrote down, and the
// Investor enters it in the portal. Until then no signing code goes there.

/** How long a code sent to confirm an email may be entered. */
export const EMAIL_CODE_LIFETIME_MS = 30 * 60_000;

/** How soon after one code another may be sent: long enough for the first to arrive. */
export const ONE_SEND_EVERY_MS = 60_000;

/** Digits in the code: six, read off a phone and typed in. Ten wrong in a quarter hour stops anybody guessing. */
const CODE_DIGITS = 6;

/** Bangla digits as a Bangla keyboard types them, read as the code's own. */
const BANGLA_DIGIT = /[০-৯]/gu;
const BANGLA_DIGITS = "০১২৩৪৫৬৭৮৯";

/** A code as typed: Bangla digits read as theirs. */
const codeAsTyped = (typed: string): string =>
  typed.replaceAll(BANGLA_DIGIT, (one) => String(BANGLA_DIGITS.indexOf(one)));

/** A fresh code and what the farm keeps of it: only the hash. */
const newEmailCode = async () => {
  const bytes = crypto.getRandomValues(new Uint32Array(CODE_DIGITS));
  const code = Array.from(bytes, (one) => String(one % 10)).join("");
  return { code, codeHash: await hashOfCodeAsTyped(code) };
};

/** An email as the farm keeps it: as typed, trimmed and lowercased, so the same address is never two. */
export const emailAsKept = (typed: string): string =>
  typed.trim().toLowerCase();

/**
 * An email with most of its name hidden, as the portal shows it back: the first two letters, then the domain whole,
 * which says where it goes without saying it to whoever is looking over a shoulder.
 */
export const maskedEmail = (email: string): string => {
  const at = email.lastIndexOf("@");
  if (at < 1) {
    return "•••";
  }
  const name = email.slice(0, at);
  return `${name.slice(0, Math.min(2, name.length - 1))}•••${email.slice(at)}`;
};

/** The words of the email, in Bangla first and English under it: the farm does not know which the reader reads. */
const theEmail = (farmName: string, code: string) => {
  const minutes = EMAIL_CODE_LIFETIME_MS / 60_000;
  const said = (language: "bn" | "en") =>
    translate(language, "email.confirmCode.body", {
      farm: farmName,
      code,
      minutes,
    });
  return {
    subject: `${farmName}: ${translate("bn", "email.confirmCode.subject")} · ${translate("en", "email.confirmCode.subject")}`,
    text: `${said("bn")}\n\n—\n\n${said("en")}`,
  };
};

type Asking = Context & {
  farm: NonNullable<Context["farm"]>;
  investor: { id: string };
};

/** Their email as the farm holds it, and whether it is confirmed. */
const theirEmail = async (context: Asking) => {
  const them = await context.db.query.investor.findFirst({
    where: { id: context.investor.id, farmId: context.farm.id },
    columns: { email: true, emailConfirmedAt: true },
  });
  return { email: them?.email ?? null, confirmed: !!them?.emailConfirmedAt };
};

/**
 * Sends them a code to the email the Owner wrote down. Refused with no email, with it confirmed already, on a farm
 * that sends no email, and more often than once a minute or five times an hour — each email costs the farm, and lands
 * in somebody's inbox. A code sent replaces the one before it; one that does not go is not kept.
 */
export const sendEmailCode = async (context: Asking) => {
  const { email, confirmed } = await theirEmail(context);
  if (!email) {
    throw refused("The farm has no email for you", "no_email");
  }
  if (confirmed) {
    throw refused("Your email is confirmed already", "email_confirmed");
  }
  if (!context.email.sends) {
    throw refused("The farm sends no email yet", "farm_sends_no_email");
  }
  const now = context.clock.now();
  const sends = `email-send:${context.investor.id}`;
  const last = await context.db.query.emailCode.findFirst({
    where: { investorId: context.investor.id },
    columns: { sentAt: true },
  });
  if (
    lockedOut(sends, now, EMAIL_SENDS) ||
    (last && now.getTime() - last.sentAt.getTime() < ONE_SEND_EVERY_MS)
  ) {
    throw new ORPCError("TOO_MANY_REQUESTS", {
      message: "A code was sent just now — wait a minute",
      data: { refusal: "email_sent_just_now" },
    });
  }
  countFailure(sends, now, EMAIL_SENDS);
  const { code, codeHash } = await newEmailCode();
  const row = {
    farmId: context.farm.id,
    investorId: context.investor.id,
    email,
    codeHash,
    sentAt: now,
    expiresAt: new Date(now.getTime() + EMAIL_CODE_LIFETIME_MS),
  };
  await context.db
    .insert(emailCode)
    .values({ id: uuidv7(now), ...row })
    .onConflictDoUpdate({ target: emailCode.investorId, set: row });
  const answer = await context.email.send(
    email,
    theEmail(context.farm.name, code)
  );
  if (!answer.delivered) {
    await context.db
      .delete(emailCode)
      .where(eq(emailCode.investorId, context.investor.id));
    throw refused(
      "The email did not go — try again in a minute",
      "email_not_sent"
    );
  }
  return { sentTo: maskedEmail(email) };
};

/**
 * Their email confirmed by the code the farm sent it: right, unexpired, and sent to the email the farm holds now — a
 * code sent before the Owner changed it confirms nothing. Every try is counted against them before it is checked, ten
 * wrong in a quarter hour stopping them; the right one forgets the count. The trail keeps it as a change to their
 * record, made by them.
 */
export const confirmEmail = async (context: Asking, typed: string) => {
  const now = context.clock.now();
  const guesses = `email-code:${context.investor.id}`;
  if (lockedOut(guesses, now, CODE_ATTEMPTS)) {
    throw new ORPCError("TOO_MANY_REQUESTS", {
      message: "Too many wrong codes — wait fifteen minutes",
      data: { refusal: "too_many_codes" },
    });
  }
  // Counted now, with nothing awaited since the check, as the invitation's are: tries sent at once each find the ones
  // before them counted.
  countFailure(guesses, now, CODE_ATTEMPTS);
  const { email, confirmed } = await theirEmail(context);
  if (confirmed) {
    forgetFailures(guesses);
    return { confirmed: true };
  }
  const codeHash = await hashOfCodeAsTyped(codeAsTyped(typed));
  const sent = await context.db.query.emailCode.findFirst({
    where: { investorId: context.investor.id, farmId: context.farm.id },
  });
  if (
    !(email && sent) ||
    sent.email !== email ||
    sent.codeHash !== codeHash ||
    sent.expiresAt <= now
  ) {
    throw refused("That is not the code we sent", "wrong_code");
  }
  forgetFailures(guesses);
  await audited(context).write(
    {
      entity: "investor",
      entityId: context.investor.id,
      action: "update",
      before: (tx: Tx) =>
        readInvestor(tx, context.farm.id, context.investor.id),
      after: (tx: Tx) => readInvestor(tx, context.farm.id, context.investor.id),
    },
    async (tx) => {
      await tx
        .update(investor)
        .set({ emailConfirmedAt: now })
        .where(
          and(
            eq(investor.id, context.investor.id),
            eq(investor.farmId, context.farm.id)
          )
        );
      await tx
        .delete(emailCode)
        .where(eq(emailCode.investorId, context.investor.id));
    }
  );
  return { confirmed: true };
};

/** Forgets a code sent to the email on their record, which no longer stands. */
export const forgetEmailCode = async (tx: Tx, investorId: string) => {
  await tx.delete(emailCode).where(eq(emailCode.investorId, investorId));
};

/**
 * What a change to their record does to their email: a new address is not confirmed, and a code sent to the old one is
 * gone. The same address, however it was typed, stays as it was.
 */
export const emailChanged = async (
  tx: Tx,
  farmId: string,
  id: string,
  email: string | null
): Promise<{ email: string | null; emailConfirmedAt?: null }> => {
  const before = await tx.query.investor.findFirst({
    where: { id, farmId },
    columns: { email: true },
  });
  if (before && before.email === email) {
    return { email };
  }
  await forgetEmailCode(tx, id);
  return { email, emailConfirmedAt: null };
};
