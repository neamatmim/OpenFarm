import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, isNull } from "@OpenFarm/db/operators";
import type {
  SIGNED_OFFER_KINDS,
  SIGNING_CHANNELS,
} from "@OpenFarm/db/schema/venture";
import { signingCode, signingProof } from "@OpenFarm/db/schema/venture";
import { maskedDigits, mobileNumberOf } from "@OpenFarm/domain";
import type { Language } from "@OpenFarm/i18n";
import { resolveLanguage, translate } from "@OpenFarm/i18n";
import { ORPCError } from "@orpc/server";

import type { Acting } from "./agreeing-in-app";
import { refused } from "./agreeing-in-app";
import {
  CODE_ATTEMPTS,
  SIGNING_SENDS,
  countFailure,
  forgetFailures,
  lockedOut,
} from "./attempts";
import type { Tx } from "./audit";
import type { Context } from "./context";
import { maskedEmail } from "./investor-email";
import { hashOfCodeAsTyped } from "./membership";
import { consentInForce } from "./portal-consent";

// A paper agreed in the app is sealed by a one-time code (ADR 0022): the farm sends one by text to the Investor's phone
// and another to their confirmed email, and entering either seals it. The farm keeps its proof with the paper, and
// tells them once the Owner has approved it.

/** What a Signing Code seals. */
export type SignedOfferKind = (typeof SIGNED_OFFER_KINDS)[number];

/** The way a code came. */
export type SigningChannel = (typeof SIGNING_CHANNELS)[number];

/** How long a Signing Code may be entered: long enough to read the paper once more, short enough to be this sitting's. */
export const SIGNING_CODE_LIFETIME_MS = 10 * 60_000;

/** How soon after one pair of codes another may be sent for the same paper. */
const ONE_SEND_EVERY_MS = 60_000;

/** Digits in a code: six, as the email's. */
const CODE_DIGITS = 6;

/** How much of a paper's fingerprint is its number, as the Agreement's stamp line and the confirmation carry it. */
const NUMBER_LENGTH = 12;

/** A paper's number: the first of its fingerprint, enough to find it by. */
export const paperNumberOf = (paperHash: string): string =>
  paperHash.slice(0, NUMBER_LENGTH).toUpperCase();

/** Bangla digits as a Bangla keyboard types them. */
const BANGLA_DIGIT = /[০-৯]/gu;
const BANGLA_DIGITS = "০১২৩৪৫৬৭৮৯";
const NOT_A_DIGIT = /\D/gu;

/** A code as typed: Bangla digits read as theirs, and anything not a digit — a space, a dash — left out. */
const codeAsTyped = (typed: string): string =>
  typed
    .replaceAll(BANGLA_DIGIT, (one) => String(BANGLA_DIGITS.indexOf(one)))
    .replaceAll(NOT_A_DIGIT, "");

/** A fresh code. */
const newCode = (): string =>
  Array.from(crypto.getRandomValues(new Uint32Array(CODE_DIGITS)), (one) =>
    String(one % 10)
  ).join("");

/** The kind of paper, in a language, as a text or an email names it. */
const paperSaid = (kind: SignedOfferKind, language: Language) =>
  translate(language, `signing.paper.${kind}`);

type Asking = Acting & Pick<Context, "sms" | "email" | "db">;

/** Who is agreeing, and the ways the farm can reach them with a code. */
const theirWays = async (context: Asking, investorId: string) => {
  const [them, account] = await Promise.all([
    context.db.query.investor.findFirst({
      where: { id: investorId, farmId: context.farm.id },
      columns: { phone: true, email: true, emailConfirmedAt: true },
    }),
    context.db.query.user.findFirst({
      where: { id: context.actor.id },
      columns: { language: true },
    }),
  ]);
  const phone = them ? mobileNumberOf(them.phone) : null;
  return {
    sms: context.sms.sends && phone ? phone : null,
    /** The number as the farm wrote it down, which is how it is shown back, mostly hidden. */
    written: them?.phone ?? "",
    email:
      context.email.sends && them?.email && them.emailConfirmedAt
        ? them.email
        : null,
    language: resolveLanguage(account),
  };
};

/**
 * Whether one Investor can agree in the app at all, as their record and the farm stand: a consent carrying the signing
 * clause, and a way to send them a code — a text gateway, or an email sender and an email they confirmed.
 */
export const signingReadiness = async (
  context: Pick<Context, "sms" | "email" | "db"> & {
    farm: NonNullable<Context["farm"]>;
  },
  investorId: string
) => {
  const [consent, them] = await Promise.all([
    consentInForce(context.db, context.farm.id, investorId),
    context.db.query.investor.findFirst({
      where: { id: investorId, farmId: context.farm.id },
      columns: { email: true, emailConfirmedAt: true },
    }),
  ]);
  return {
    signingClause: consent?.signsInApp === true,
    bySms: context.sms.sends,
    byEmail:
      context.email.sends && !!them?.email && them.emailConfirmedAt !== null,
  };
};

/**
 * Sends an Investor the codes that seal one paper offered to them: by text, and to their email where they confirmed it.
 * The paper is the caller's to have found theirs and open to agree. Refused for a consent without the signing clause,
 * with no way to reach them, more often than once a minute for one paper or five times an hour in all, and when
 * neither went. Answers where each went, mostly hidden.
 */
export const sendSigningCode = async (
  context: Asking,
  investorId: string,
  offer: { kind: SignedOfferKind; id: string }
) => {
  const ready = await signingReadiness(context, investorId);
  if (!ready.signingClause) {
    throw refused(
      "Your Portal Consent has no signing clause: sign the new one at the farm first",
      "no_signing_clause"
    );
  }
  const ways = await theirWays(context, investorId);
  if (!(ways.sms || ways.email)) {
    throw refused(
      "The farm has no way to send you a code",
      "no_way_to_send_a_code"
    );
  }
  const now = context.clock.now();
  const sends = `signing-send:${investorId}`;
  const last = await context.db.query.signingCode.findFirst({
    where: { investorId, offerKind: offer.kind, offerId: offer.id },
    columns: { sentAt: true },
  });
  if (
    lockedOut(sends, now, SIGNING_SENDS) ||
    (last && now.getTime() - last.sentAt.getTime() < ONE_SEND_EVERY_MS)
  ) {
    throw new ORPCError("TOO_MANY_REQUESTS", {
      message: "A code was sent just now — wait a minute",
      data: { refusal: "code_sent_just_now" },
    });
  }
  countFailure(sends, now, SIGNING_SENDS);
  const minutes = SIGNING_CODE_LIFETIME_MS / 60_000;
  const byText = newCode();
  // Another for the email, so the one entered says which way it came.
  let byEmail = newCode();
  while (byEmail === byText) {
    byEmail = newCode();
  }
  const farmName = context.farm.name;
  const [texted, emailed] = await Promise.all([
    ways.sms
      ? context.sms.send(ways.sms, {
          text: translate(ways.language, "signing.code.sms", {
            farm: farmName,
            paper: paperSaid(offer.kind, ways.language),
            code: byText,
            minutes,
          }),
          lang: ways.language,
        })
      : { delivered: false },
    ways.email
      ? context.email.send(ways.email, {
          subject: `${farmName}: ${translate("bn", "signing.code.subject")} · ${translate("en", "signing.code.subject")}`,
          text: (["bn", "en"] as const)
            .map((language) =>
              translate(language, "signing.code.email", {
                farm: farmName,
                paper: paperSaid(offer.kind, language),
                code: byEmail,
                minutes,
              })
            )
            .join("\n\n—\n\n"),
        })
      : { delivered: false },
  ]);
  if (!(texted.delivered || emailed.delivered)) {
    throw refused(
      "The code did not go — try again in a minute",
      "code_not_sent"
    );
  }
  const row = {
    farmId: context.farm.id,
    investorId,
    offerKind: offer.kind,
    offerId: offer.id,
    smsCodeHash:
      texted.delivered && ways.sms ? await hashOfCodeAsTyped(byText) : null,
    smsTo: texted.delivered && ways.sms ? maskedDigits(ways.written) : null,
    emailCodeHash:
      emailed.delivered && ways.email ? await hashOfCodeAsTyped(byEmail) : null,
    emailTo: emailed.delivered && ways.email ? maskedEmail(ways.email) : null,
    sentAt: now,
    expiresAt: new Date(now.getTime() + SIGNING_CODE_LIFETIME_MS),
    usedAt: null,
  };
  await context.db
    .insert(signingCode)
    .values({ id: uuidv7(now), ...row })
    .onConflictDoUpdate({
      target: [
        signingCode.investorId,
        signingCode.offerKind,
        signingCode.offerId,
      ],
      set: row,
    });
  return { bySms: row.smsTo, byEmail: row.emailTo, minutes };
};

/** A code that seals a paper: which way it came, where it went, and when. */
export interface Sealed {
  codeId: string;
  channel: SigningChannel;
  sentTo: string;
  sentAt: Date;
}

/**
 * The code an Investor entered for one paper, checked: one of the two last sent for it, unexpired and unused. Every try
 * is counted against them before it is checked, ten wrong in a quarter hour stopping them; the right one forgets the
 * count. Refused by name — wrong, run out, or used already.
 */
export const checkSigningCode = async (
  context: Acting,
  investorId: string,
  offer: { kind: SignedOfferKind; id: string },
  typed: string
): Promise<Sealed> => {
  const now = context.clock.now();
  const guesses = `signing-code:${investorId}`;
  if (lockedOut(guesses, now, CODE_ATTEMPTS)) {
    throw new ORPCError("TOO_MANY_REQUESTS", {
      message: "Too many wrong codes — wait fifteen minutes",
      data: { refusal: "too_many_codes" },
    });
  }
  // Counted now, with nothing awaited since the check, as every code the farm takes is.
  countFailure(guesses, now, CODE_ATTEMPTS);
  const sent = await context.db.query.signingCode.findFirst({
    where: {
      farmId: context.farm.id,
      investorId,
      offerKind: offer.kind,
      offerId: offer.id,
    },
  });
  const hash = await hashOfCodeAsTyped(codeAsTyped(typed));
  const channel: SigningChannel | null =
    (sent?.smsCodeHash === hash && "sms") ||
    (sent?.emailCodeHash === hash && "email") ||
    null;
  if (!(sent && channel)) {
    throw refused("That is not the code we sent", "wrong_code");
  }
  if (sent.usedAt) {
    throw refused("That code was used already", "code_used");
  }
  if (sent.expiresAt <= now) {
    throw refused("That code has run out — ask for another", "code_expired");
  }
  forgetFailures(guesses);
  return {
    codeId: sent.id,
    channel,
    sentTo: (channel === "sms" ? sent.smsTo : sent.emailTo) ?? "",
    sentAt: sent.sentAt,
  };
};

/**
 * Keeps the proof of an agreement sealed by a code, in the transaction that records the agreement: the code marked used
 * — refused if it was used meanwhile — and who agreed, when, by which way and where it went, from what address and
 * browser, to which paper.
 */
export const keepProof = async (
  tx: Tx,
  context: Acting & Pick<Context, "callerAddress" | "callerAgent">,
  investorId: string,
  offer: { kind: SignedOfferKind; id: string; paperHash: string },
  sealed: Sealed
) => {
  const now = context.clock.now();
  const [used] = await tx
    .update(signingCode)
    .set({ usedAt: now })
    .where(and(eq(signingCode.id, sealed.codeId), isNull(signingCode.usedAt)))
    .returning({ id: signingCode.id });
  if (!used) {
    throw refused("That code was used already", "code_used");
  }
  await tx.insert(signingProof).values({
    id: uuidv7(now),
    farmId: context.farm.id,
    investorId,
    offerKind: offer.kind,
    offerId: offer.id,
    agreedBy: context.actor.id,
    agreedAt: now,
    paperHash: offer.paperHash,
    channel: sealed.channel,
    sentTo: sealed.sentTo,
    codeSentAt: sealed.sentAt,
    callerAddress: context.callerAddress,
    callerAgent: context.callerAgent,
  });
};

/** The proof kept for each Investor who agreed to one paper, as the Owner and the Data Copy read it. */
export const proofsOf = (
  db: Pick<Tx, "query">,
  farmId: string,
  offer: { kind: SignedOfferKind; id: string }
) =>
  db.query.signingProof.findMany({
    where: { farmId, offerKind: offer.kind, offerId: offer.id },
    orderBy: { agreedAt: "asc", id: "asc" },
  });

/** A proof as a screen shows it: nothing a screen has no use for. */
export const proofSaid = (
  proof: Awaited<ReturnType<typeof proofsOf>>[number]
) => ({
  investorId: proof.investorId,
  agreedAt: proof.agreedAt,
  channel: proof.channel,
  sentTo: proof.sentTo,
  codeSentAt: proof.codeSentAt,
  callerAddress: proof.callerAddress,
  callerAgent: proof.callerAgent,
  paperHash: proof.paperHash,
  confirmedAt: proof.confirmedAt,
  confirmedBySms: proof.confirmedBySms,
  confirmedByEmail: proof.confirmedByEmail,
});

/**
 * Tells each Investor who agreed to a paper in the app that the Owner approved it, by text and by confirmed email — with
 * the paper's number and its Venture — and records on their proof that it went, and which ways. Sent after the
 * approval is written, as every message is: a slow gateway must hold no lock. A message that did not go leaves the
 * approval standing; the proof says it did not.
 */
export const confirmApproval = async (
  context: Pick<Context, "sms" | "email" | "db" | "clock"> & {
    farm: NonNullable<Context["farm"]>;
  },
  offer: {
    kind: SignedOfferKind;
    id: string;
    paperHash: string;
    ventureName: string;
  }
) => {
  const proofs = await proofsOf(context.db, context.farm.id, offer);
  const number = paperNumberOf(offer.paperHash);
  for (const proof of proofs) {
    // oxlint-disable-next-line no-await-in-loop -- one Investor at a time, each a message or two
    const [them, account] = await Promise.all([
      context.db.query.investor.findFirst({
        where: { id: proof.investorId, farmId: context.farm.id },
        columns: { phone: true, email: true, emailConfirmedAt: true },
      }),
      context.db.query.user.findFirst({
        where: { id: proof.agreedBy },
        columns: { language: true },
      }),
    ]);
    const language = resolveLanguage(account);
    const phone = them ? mobileNumberOf(them.phone) : null;
    const said = (words: Language) => ({
      farm: context.farm.name,
      paper: paperSaid(offer.kind, words),
      number,
      venture: offer.ventureName,
    });
    // oxlint-disable-next-line no-await-in-loop -- as above
    const [texted, emailed] = await Promise.all([
      context.sms.sends && phone
        ? context.sms.send(phone, {
            text: translate(language, "signing.approved.sms", said(language)),
            lang: language,
          })
        : { delivered: false },
      context.email.sends && them?.email && them.emailConfirmedAt
        ? context.email.send(them.email, {
            subject: `${context.farm.name}: ${translate("bn", "signing.approved.subject")} · ${translate("en", "signing.approved.subject")}`,
            text: (["bn", "en"] as const)
              .map((words) =>
                translate(words, "signing.approved.email", said(words))
              )
              .join("\n\n—\n\n"),
          })
        : { delivered: false },
    ]);
    // oxlint-disable-next-line no-await-in-loop -- as above
    await context.db
      .update(signingProof)
      .set({
        confirmedAt: context.clock.now(),
        confirmedBySms: texted.delivered,
        confirmedByEmail: emailed.delivered,
      })
      .where(eq(signingProof.id, proof.id));
  }
};
