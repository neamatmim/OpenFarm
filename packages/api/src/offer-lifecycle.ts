import type { ORPCError } from "@orpc/server";

import type { Acting } from "./agreeing-in-app";
import { refused } from "./agreeing-in-app";
import type { AuditedWrite, Tx } from "./audit";
import { audited, readSnapshot } from "./audit";
import type { Context } from "./context";
import type { SignedOfferKind } from "./signing-code";
import { checkSigningCode, keepProof, proofWithdrawn } from "./signing-code";
import { lockTheFarm } from "./venture-store";
import { seenWhenDone } from "./writes-seen";

// The one life every paper offered in the app leads — an Agreement Offer, an Amendment, a মনোনয়নপত্র (ADR 0022): the
// Owner offers it, the Investor agrees with a Signing Code and may withdraw that, the Owner may withdraw the offer, and
// the Owner approves it. Each store says what its paper is and how its agreement is kept; the steps, their locks, their
// proofs and their refusals are said here once, so the three cannot drift apart.

/** Where an offer stands. An Amendment's agreement is its answers, so it has no `agreedAt` of its own. */
export type OfferStanding = "offered" | "agreed" | "approved" | "withdrawn";

/** Where an offer stands, from its moments. */
export const standingOf = (offer: {
  approvedAt: Date | null;
  withdrawnAt: Date | null;
  agreedAt?: Date | null;
}): OfferStanding => {
  if (offer.approvedAt) {
    return "approved";
  }
  if (offer.withdrawnAt) {
    return "withdrawn";
  }
  return offer.agreedAt ? "agreed" : "offered";
};

/** The words a paper's refusals take: the same code for every paper, its own message. */
export interface OfferWords {
  /** Approved already: part of what the Investor signed, or the list in force, now. */
  approved: () => ORPCError<string, unknown>;
  /** Withdrawn by the Owner. */
  withdrawn: () => ORPCError<string, unknown>;
}

/** The refusal for an offer approved already, in a paper's own words. */
export const approvedAlready = (message: string) => () =>
  refused(message, "offer_already_approved");

/** The refusal for an offer the Owner has withdrawn, in a paper's own words. */
export const withdrawnAlready = (message: string) => () =>
  refused(message, "offer_withdrawn");

/**
 * One step of an offer's life, written as one audited change behind the Farm lock, which approving takes too — so two
 * steps at once queue rather than deadlock, the second finds the offer as the first left it, and the trail's `before`
 * is read under the lock, never a moment stale. `apply` says whether it changed anything; when it did not, no event is
 * written for a change that never happened.
 */
const lockedStep = async (
  context: Acting,
  event: (now: Date) => AuditedWrite,
  apply: (tx: Tx, now: Date) => Promise<boolean>
): Promise<void> => {
  const now = context.clock.now();
  const trail = event(now);
  const auditing = audited(context);
  await seenWhenDone(
    context.db.transaction(async (tx) => {
      await lockTheFarm(tx, context.farm.id);
      const before = await readSnapshot(tx, trail.before);
      if (!(await apply(tx, now))) {
        return;
      }
      const after = await readSnapshot(tx, trail.after);
      await auditing.recordEvent(tx, trail, { before, after, receivedAt: now });
    })
  );
};

/**
 * An Investor's agreement to a paper offered in the app, sealed by a Signing Code (ADR 0022): the code checked first —
 * counted against them, refused by name — and then, in one locked step, the agreement marked by the store (`mark`, which
 * says whether it marked anything) and its proof kept with the code marked used. Withdrawn or agreed meanwhile, nothing
 * is marked, no proof is kept of nothing, and the trail says nothing.
 */
export const sealAgreement = async (
  context: Acting & Pick<Context, "callerAddress" | "callerAgent">,
  investorId: string,
  offer: { kind: SignedOfferKind; id: string; paperHash: string },
  code: string,
  {
    trail,
    mark,
  }: {
    trail: (now: Date) => AuditedWrite;
    mark: (tx: Tx, now: Date) => Promise<boolean>;
  }
): Promise<void> => {
  const signed = { kind: offer.kind, id: offer.id } as const;
  const sealed = await checkSigningCode(context, investorId, signed, code);
  await lockedStep(context, trail, async (tx, now) => {
    if (!(await mark(tx, now))) {
      return false;
    }
    await keepProof(tx, context, investorId, offer, sealed);
    return true;
  });
};

/** How a paper stood when the Investor came to withdraw their agreement, as the store found it. */
export type AgreementFound =
  | "withdrawn_now"
  | "approved"
  | "withdrawn"
  | "not_agreed";

/**
 * An Investor withdraws their agreement to a paper before the Owner approves it — with the Owner's approval last,
 * their agreement is their offer (AAOIFI SS 38 5/3; ADR 0022). In one locked step the store withdraws it (`withdraw`)
 * and says how it found the paper: approved or withdrawn by the Owner meanwhile, refused in the paper's words; withdrawn
 * by another try a moment before, refused, so the trail keeps one withdrawal. The proof of their agreement is kept,
 * marked withdrawn at the same moment the trail says.
 */
export const withdrawTheAgreement = async (
  context: Acting,
  investorId: string,
  offer: { kind: SignedOfferKind; id: string },
  {
    trail,
    withdraw,
    words,
  }: {
    trail: (now: Date) => AuditedWrite;
    withdraw: (tx: Tx, now: Date) => Promise<AgreementFound>;
    words: OfferWords;
  }
): Promise<void> => {
  await lockedStep(
    context,
    (now) => ({
      ...trail(now),
      reason: "The Investor withdrew their agreement before it was approved",
    }),
    async (tx, now) => {
      const found = await withdraw(tx, now);
      if (found === "approved") {
        throw words.approved();
      }
      if (found === "withdrawn") {
        throw words.withdrawn();
      }
      if (found === "not_agreed") {
        throw refused("Your agreement is withdrawn already", "not_agreed");
      }
      await proofWithdrawn(tx, now, investorId, offer);
      return true;
    }
  );
};

/** How an offer stood when the Owner came to withdraw it, as the store found it. */
export type OfferFound = "withdrawn_now" | "approved" | "withdrawn";

/**
 * The Owner withdraws an offer, agreed or not, until it is approved: in one locked step the store marks it withdrawn
 * (`withdraw`) while it is neither approved nor withdrawn, and says how it found it. Approved meanwhile, it is refused in
 * the paper's words rather than said to be withdrawn; withdrawn already, nothing changes and the trail says nothing.
 */
export const withdrawTheOffer = async (
  context: Acting,
  {
    trail,
    withdraw,
    words,
  }: {
    trail: (now: Date) => AuditedWrite;
    withdraw: (tx: Tx, now: Date) => Promise<OfferFound>;
    words: OfferWords;
  }
): Promise<void> => {
  await lockedStep(context, trail, async (tx, now) => {
    const found = await withdraw(tx, now);
    if (found === "approved") {
      throw words.approved();
    }
    return found === "withdrawn_now";
  });
};

/**
 * An offer as approving finds it behind the Farm lock: still agreed — the day it was, which the paper written from it is
 * dated by — and neither withdrawn nor approved. Refused otherwise, in the paper's words: approved by another try a
 * moment before, withdrawn by the Owner, or no longer agreed because the Investor withdrew their agreement.
 */
export const stillAgreed = (
  offer: {
    agreedAt: Date | null;
    withdrawnAt: Date | null;
    approvedAt: Date | null;
  } | null,
  words: OfferWords
): Date => {
  if (offer?.approvedAt) {
    throw words.approved();
  }
  if (offer?.withdrawnAt) {
    throw words.withdrawn();
  }
  if (!offer?.agreedAt) {
    throw refused(
      "The Investor has not agreed to it, or withdrew their agreement",
      "offer_not_agreed"
    );
  }
  return offer.agreedAt;
};
