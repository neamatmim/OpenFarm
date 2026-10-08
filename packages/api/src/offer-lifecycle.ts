import { and, eq, isNotNull, isNull } from "@OpenFarm/db/operators";
import {
  agreementOffer,
  amendmentOffer,
  nominationOffer,
} from "@OpenFarm/db/schema/venture";
import type { ORPCError } from "@orpc/server";

import type { Acting } from "./agreeing-in-app";
import { refused } from "./agreeing-in-app";
import type { AuditedWrite, SnapshotValue, Tx } from "./audit";
import { audited, readSnapshot } from "./audit";
import type { Context } from "./context";
import type { SignedOfferKind } from "./signing-code";
import { checkSigningCode, keepProof, proofWithdrawn } from "./signing-code";
import { lockTheFarm } from "./venture-store";
import { seenWhenDone } from "./writes-seen";

// The one life every paper offered in the app leads — an Agreement Offer, an Amendment, a মনোনয়নপত্র (ADR 0022): the
// Owner offers it, the Investor agrees with a Signing Code and may withdraw that, the Owner may withdraw the offer, and
// the Owner approves it. The steps, their locks, their proofs, their refusals and the table work on each paper's own row
// are said here once, so the three cannot drift apart; each store says only what its paper is, and an Amendment — whose
// agreement is each Investor's answer — how that is kept. A new kind of paper is added to `OFFER_TABLES` here.

/** The table each kind of paper offered in the app is kept in. */
const OFFER_TABLES = {
  agreement_offer: agreementOffer,
  amendment_offer: amendmentOffer,
  nomination_offer: nominationOffer,
} as const;

/** The tables of the papers one Investor agrees to alone, whose own row says whether they have: not an Amendment's,
 *  whose agreement is each Investor's answer. */
const AGREED_ALONE_TABLES = {
  agreement_offer: agreementOffer,
  nomination_offer: nominationOffer,
} as const;

/** A paper one Investor agrees to alone. */
export type AgreedAlone = keyof typeof AGREED_ALONE_TABLES;

/** One paper offered in the app, as a step acts on it: its kind — which is its name in the trail — the Farm's id and
 *  its own, and how the trail reads it either side of the step. */
export interface OfferInApp<Kind extends SignedOfferKind = SignedOfferKind> {
  kind: Kind;
  farmId: string;
  id: string;
  read: (tx: Tx) => Promise<SnapshotValue>;
}

/** One of this Farm's papers offered in the app, for the shared steps, read for the trail by its store's own reader. */
export const offerForSteps = <Kind extends SignedOfferKind>(
  kind: Kind,
  farmId: string,
  id: string,
  read: (
    tx: Pick<Tx, "query">,
    farmId: string,
    id: string
  ) => Promise<SnapshotValue>
): OfferInApp<Kind> => ({
  kind,
  farmId,
  id,
  read: (tx) => read(tx, farmId, id),
});

/** The trail of one step on an offer: its row as it stood either side. */
export const offerTrail = (offer: OfferInApp): AuditedWrite => ({
  entity: offer.kind,
  entityId: offer.id,
  action: "update",
  before: offer.read,
  after: offer.read,
});

/** Where this Farm's offer stands, read again inside a step: approved or withdrawn meanwhile, or neither. */
export const closedMeanwhile = async (
  tx: Tx,
  offer: OfferInApp
): Promise<"approved" | "withdrawn" | null> => {
  const table = OFFER_TABLES[offer.kind];
  const [row] = await tx
    .select({ approvedAt: table.approvedAt, withdrawnAt: table.withdrawnAt })
    .from(table)
    .where(and(eq(table.id, offer.id), eq(table.farmId, offer.farmId)));
  if (row?.approvedAt) {
    return "approved";
  }
  return row?.withdrawnAt ? "withdrawn" : null;
};

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

/** How an agreement is kept: the trail of it, and the mark that records it, saying whether it did. */
export interface SealedHow {
  trail: (now: Date) => AuditedWrite;
  mark: (tx: Tx, now: Date) => Promise<boolean>;
}

/** How an agreement to a paper agreed alone is kept: its own row marked agreed, while neither withdrawn nor agreed. */
const agreedAloneHow = (
  offer: OfferInApp<AgreedAlone>,
  by: string
): SealedHow => {
  const table = AGREED_ALONE_TABLES[offer.kind];
  return {
    trail: () => offerTrail(offer),
    mark: async (tx, now) => {
      const [agreeing] = await tx
        .update(table)
        .set({ agreedAt: now, agreedBy: by })
        .where(
          and(
            eq(table.id, offer.id),
            isNull(table.withdrawnAt),
            isNull(table.agreedAt)
          )
        )
        .returning({ id: table.id });
      return agreeing !== undefined;
    },
  };
};

/**
 * An Investor's agreement to a paper offered in the app, sealed by a Signing Code (ADR 0022): the code checked first —
 * counted against them, refused by name — and then, in one locked step, the agreement marked (`how.mark`, which says
 * whether it marked anything: by default the paper's own row, an Amendment its answer) and its proof kept with the code
 * marked used. Withdrawn or agreed meanwhile, nothing is marked, no proof is kept of nothing, and the trail says nothing.
 */
export const sealAgreementBy = async (
  context: Acting & Pick<Context, "callerAddress" | "callerAgent">,
  investorId: string,
  offer: OfferInApp & { paperHash: string },
  code: string,
  how: SealedHow
): Promise<void> => {
  const signed = { kind: offer.kind, id: offer.id } as const;
  const sealed = await checkSigningCode(context, investorId, signed, code);
  await lockedStep(context, how.trail, async (tx, now) => {
    if (!(await how.mark(tx, now))) {
      return false;
    }
    await keepProof(tx, context, investorId, offer, sealed);
    return true;
  });
};

/** An Investor's agreement to a paper they agree to alone, sealed by a Signing Code: its own row marked agreed. */
export const sealAgreement = (
  context: Acting & Pick<Context, "callerAddress" | "callerAgent">,
  investorId: string,
  offer: OfferInApp<AgreedAlone> & { paperHash: string },
  code: string
): Promise<void> =>
  sealAgreementBy(
    context,
    investorId,
    offer,
    code,
    agreedAloneHow(offer, context.actor.id)
  );

/** How a paper stood when the Investor came to withdraw their agreement, as the store found it. */
export type AgreementFound =
  | "withdrawn_now"
  | "approved"
  | "withdrawn"
  | "not_agreed";

/** How an agreement is withdrawn: the trail of it, and the step that takes it back, saying how it found the paper. */
export interface WithdrawnHow {
  trail: (now: Date) => AuditedWrite;
  withdraw: (tx: Tx, now: Date) => Promise<AgreementFound>;
}

/** How an agreement to a paper agreed alone is withdrawn: its own row marked not agreed, and when, while it is still
 *  agreed and neither approved nor withdrawn — or, finding it otherwise, how it stood. */
const withdrawnAloneHow = (offer: OfferInApp<AgreedAlone>): WithdrawnHow => {
  const table = AGREED_ALONE_TABLES[offer.kind];
  return {
    trail: () => offerTrail(offer),
    withdraw: async (tx, now) => {
      const [withdrawing] = await tx
        .update(table)
        .set({ agreedAt: null, agreedBy: null, agreementWithdrawnAt: now })
        .where(
          and(
            eq(table.id, offer.id),
            isNull(table.approvedAt),
            isNull(table.withdrawnAt),
            isNotNull(table.agreedAt)
          )
        )
        .returning({ id: table.id });
      if (withdrawing) {
        return "withdrawn_now";
      }
      return (await closedMeanwhile(tx, offer)) ?? "not_agreed";
    },
  };
};

/**
 * An Investor withdraws their agreement to a paper before the Owner approves it — with the Owner's approval last,
 * their agreement is their offer (AAOIFI SS 38 5/3; ADR 0022). In one locked step it is withdrawn (`how.withdraw`: by
 * default the paper's own row, an Amendment its answer), saying how it found the paper: approved or withdrawn by the
 * Owner meanwhile, refused in the paper's words; withdrawn by another try a moment before, refused, so the trail keeps
 * one withdrawal. The proof of their agreement is kept, marked withdrawn at the same moment the trail says.
 */
export const withdrawTheAgreementBy = async (
  context: Acting,
  investorId: string,
  offer: OfferInApp,
  words: OfferWords,
  how: WithdrawnHow
): Promise<void> => {
  await lockedStep(
    context,
    (now) => ({
      ...how.trail(now),
      reason: "The Investor withdrew their agreement before it was approved",
    }),
    async (tx, now) => {
      const found = await how.withdraw(tx, now);
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

/** An Investor withdraws their agreement to a paper they agree to alone: its own row marked not agreed. */
export const withdrawTheAgreement = (
  context: Acting,
  investorId: string,
  offer: OfferInApp<AgreedAlone>,
  words: OfferWords
): Promise<void> =>
  withdrawTheAgreementBy(
    context,
    investorId,
    offer,
    words,
    withdrawnAloneHow(offer)
  );

/**
 * The Owner withdraws an offer, agreed or not, until it is approved: in one locked step its row is marked withdrawn
 * while it is neither approved nor withdrawn — every paper's the same. Approved meanwhile, it is refused in the paper's
 * words rather than said to be withdrawn; withdrawn already, nothing changes and the trail says nothing.
 */
export const withdrawTheOffer = async (
  context: Acting,
  offer: OfferInApp,
  words: OfferWords
): Promise<void> => {
  const table = OFFER_TABLES[offer.kind];
  await lockedStep(
    context,
    () => offerTrail(offer),
    async (tx, now) => {
      const [withdrawing] = await tx
        .update(table)
        .set({ withdrawnAt: now })
        .where(
          and(
            eq(table.id, offer.id),
            isNull(table.approvedAt),
            isNull(table.withdrawnAt)
          )
        )
        .returning({ id: table.id });
      if (withdrawing) {
        return true;
      }
      if ((await closedMeanwhile(tx, offer)) === "approved") {
        throw words.approved();
      }
      return false;
    }
  );
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
