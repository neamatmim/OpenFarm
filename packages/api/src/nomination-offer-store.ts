import { uuidv7 } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import {
  nomination,
  nominationOffer,
  nominee,
} from "@OpenFarm/db/schema/venture";
import type { Nominee, PaperDocument } from "@OpenFarm/domain";
import { farmDayOf, namesAMinor } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Acting } from "./agreeing-in-app";
import {
  assertInThePortal,
  assertSwitchedOn,
  refused,
} from "./agreeing-in-app";
import type { Tx } from "./audit";
import { audited } from "./audit";
import type { Context } from "./context";
import { assertRegistered } from "./export-store";
import { assertReadAsKept, keepPaper } from "./kept-paper";
import { nominationInForce } from "./nomination-store";
import {
  assertNamable,
  nominatingInvestor,
  nominationLaidOut,
  nomineeRows,
  readNominees,
} from "./nominations";
import type { OfferWords } from "./offer-lifecycle";
import {
  approvedAlready,
  offerForSteps,
  sealAgreement,
  standingOf,
  stillAgreed,
  withdrawTheAgreement,
  withdrawTheOffer,
  withdrawnAlready,
} from "./offer-lifecycle";
import { confirmApproval, proofSaid } from "./signing-code";
import { currentWording, giveStandardTemplates } from "./template-store";
import { lockTheFarm } from "./venture-store";

// A মনোনয়নপত্র agreed within the app, instead of signed in front of the Owner (ADR 0022): the Owner offers it, the
// Investor agrees to the paper in the portal with a Signing Code, and the Owner approves it — and only then is it the
// list in force, a Nomination made in the app whose kept paper is the proof. One naming a minor stays on paper: no
// institution in Bangladesh takes a Receiver's consent without one (docs/research/nomination-without-paper.md).

/** The offer as the trail records it either side of a change. */
const readOffer = async (tx: Pick<Tx, "query">, farmId: string, id: string) =>
  (await tx.query.nominationOffer.findFirst({
    where: { id, farmId },
    columns: { paper: false },
  })) ?? null;

/** This offer as the shared steps act on it (`offer-lifecycle.ts`). */
const inApp = (context: { farm: { id: string } }, id: string) =>
  offerForSteps("nomination_offer", context.farm.id, id, readOffer);

/** This Farm's offer, or nothing anybody may act on. */
const theOffer = async (
  db: Pick<Tx, "query">,
  farmId: string,
  offerId: string
) => {
  const offer = await db.query.nominationOffer.findFirst({
    where: { id: offerId, farmId },
  });
  if (!offer) {
    throw new ORPCError("NOT_FOUND", { message: "No such offer" });
  }
  return offer;
};

/** A মনোনয়নপত্র's refusals, in its own words. */
const WORDS: OfferWords = {
  approved: approvedAlready(
    "This মনোনয়নপত্র is approved: it is the list in force now"
  ),
  withdrawn: withdrawnAlready("This মনোনয়নপত্র was withdrawn"),
};

/** Refuses a list naming a minor: their Receiver signs on paper, in front of the Owner. */
const assertNoMinor = (nominees: readonly Nominee[], onDay: string) => {
  if (namesAMinor(nominees, onDay)) {
    throw refused(
      "A মনোনয়নপত্র naming a minor is signed on paper, with their Receiver",
      "minor_signs_on_paper"
    );
  }
};

/**
 * The Owner offers one Investor a মনোনয়নপত্র to agree to in the app: the paper laid out now, as it would be printed to
 * sign, kept as it is with its fingerprint. Nothing reads it until the Owner approves it after the Investor has agreed.
 * Refused while the farm's switch is off, for an Organization, to an Investor who cannot reach the portal, for a list
 * naming a minor, and while another stands.
 */
export const offerNomination = async (
  context: Acting,
  input: { investorId: string; nominees: readonly Nominee[] }
): Promise<{ id: string; paperHash: string }> => {
  assertSwitchedOn(context.farm);
  assertRegistered(context.farm, "a মনোনয়নপত্র");
  const them = await nominatingInvestor(context, input.investorId);
  await assertInThePortal(context, [them.id]);
  const now = context.clock.now();
  const today = farmDayOf(now);
  assertNamable(input.nominees, today);
  assertNoMinor(input.nominees, today);
  await giveStandardTemplates(context);
  const wording = await currentWording(
    context.db,
    context.farm.id,
    "nomination"
  );
  const kept = keepPaper(
    nominationLaidOut(context, {
      them,
      nominees: input.nominees,
      today,
      wording,
      now,
      inTheApp: true,
    })
  );
  const id = uuidv7(now);
  await audited(context).write(
    {
      entity: "nomination_offer",
      entityId: id,
      action: "create",
      after: (tx) => readOffer(tx, context.farm.id, id),
    },
    async (tx) => {
      // Asked behind the Farm lock, so two offered at once are judged one after the other: the second is refused by
      // name, not left to the index to refuse.
      await lockTheFarm(tx, context.farm.id);
      const standing = await tx.query.nominationOffer.findFirst({
        where: {
          farmId: context.farm.id,
          investorId: them.id,
          withdrawnAt: { isNull: true },
          approvedAt: { isNull: true },
        },
        columns: { id: true },
      });
      if (standing) {
        throw refused(
          "A মনোনয়নপত্র is offered to them already; withdraw it first",
          "nomination_offer_standing"
        );
      }
      await tx.insert(nominationOffer).values({
        id,
        farmId: context.farm.id,
        investorId: them.id,
        nominees: [...input.nominees],
        templateVersionId: wording.versionId,
        ...kept,
        offeredBy: context.actor.id,
        offeredAt: now,
      });
    }
  );
  return { id, paperHash: kept.paperHash };
};

/** Every মনোনয়নপত্র offered to one Investor, newest first, with where each stands and the proof of their agreement. */
export const nominationOffersOf = async (
  context: Acting,
  investorId: string
) => {
  const rows = await context.db.query.nominationOffer.findMany({
    where: { farmId: context.farm.id, investorId },
    columns: { paper: false },
    orderBy: { offeredAt: "desc", id: "desc" },
  });
  const proofs = await context.db.query.signingProof.findMany({
    where: {
      farmId: context.farm.id,
      offerKind: "nomination_offer",
      offerId: { in: rows.map((one) => one.id) },
      withdrawnAt: { isNull: true },
    },
  });
  const proofOf = new Map(proofs.map((one) => [one.offerId, proofSaid(one)]));
  return rows.map((one) => ({
    id: one.id,
    standing: standingOf(one),
    nominees: one.nominees as Nominee[],
    offeredAt: one.offeredAt,
    agreedAt: one.agreedAt,
    agreementWithdrawnAt: one.agreementWithdrawnAt,
    withdrawnAt: one.withdrawnAt,
    approvedAt: one.approvedAt,
    nominationId: one.nominationId,
    paperHash: one.paperHash,
    proof: proofOf.get(one.id) ?? null,
  }));
};

/** The Owner takes an offer back, agreed or not, until it is approved. */
export const withdrawNominationOffer = async (
  context: Acting,
  offerId: string
): Promise<void> => {
  const offer = await theOffer(context.db, context.farm.id, offerId);
  if (offer.approvedAt) {
    throw WORDS.approved();
  }
  if (offer.withdrawnAt) {
    return;
  }
  await withdrawTheOffer(context, inApp(context, offer.id), WORDS);
};

/**
 * The Owner approves a মনোনয়নপত্র the Investor has agreed to: a Nomination is written from it, made in the app and
 * signed on the day they agreed — the list in force from then on, its kept paper the proof. Read again behind the Farm
 * lock, which withdrawing takes too: one withdrawn meanwhile is refused. Refused too where a paper signed later is on
 * file, as recording one is. The Investor is told it is approved, by text and email.
 */
export const approveNominationOffer = async (
  context: Acting & Pick<Context, "sms" | "email">,
  offerId: string
): Promise<{ nominationId: string }> => {
  const offer = await theOffer(context.db, context.farm.id, offerId);
  if (offer.approvedAt) {
    throw WORDS.approved();
  }
  if (offer.withdrawnAt) {
    throw WORDS.withdrawn();
  }
  // Still somebody who may sign: not retired since it was offered, for a retired Investor signs nothing new.
  await nominatingInvestor(context, offer.investorId);
  const now = context.clock.now();
  const nominationId = uuidv7(now);
  const farmId = context.farm.id;
  const auditing = audited(context);
  await auditing.write(
    {
      entity: "nomination",
      entityId: offer.investorId,
      action: "create",
      before: (tx) => readNominees(tx, farmId, offer.investorId),
      after: (tx) => readNominees(tx, farmId, offer.investorId),
    },
    async (tx) => {
      await lockTheFarm(tx, farmId);
      const standing = await readOffer(tx, farmId, offer.id);
      const signedOn = farmDayOf(stillAgreed(standing, WORDS));
      const inForce = await nominationInForce(tx, farmId, offer.investorId);
      if (inForce && signedOn < inForce.signedOn) {
        throw refused(
          "A মনোনয়নপত্র signed later is on file already",
          "signed_before_in_force"
        );
      }
      await tx.insert(nomination).values({
        id: nominationId,
        farmId,
        investorId: offer.investorId,
        signedOn,
        how: "in_app",
        templateVersionId: offer.templateVersionId,
        recordedBy: context.actor.id,
        recordedAt: now,
      });
      const rows = nomineeRows(
        nominationId,
        offer.nominees as Nominee[],
        signedOn
      );
      if (rows.length > 0) {
        await tx.insert(nominee).values(rows);
      }
      await tx
        .update(nominationOffer)
        .set({ approvedAt: now, approvedBy: context.actor.id, nominationId })
        .where(eq(nominationOffer.id, offer.id));
      // The offer's own trail says it was approved, by whom, and into which Nomination.
      await auditing.recordEvent(
        tx,
        { entity: "nomination_offer", entityId: offer.id, action: "update" },
        { before: standing, after: await readOffer(tx, farmId, offer.id) }
      );
    }
  );
  await confirmApproval(context, {
    kind: "nomination_offer",
    id: offer.id,
    paperHash: offer.paperHash,
    ventureName: null,
  });
  return { nominationId };
};

/**
 * The মনোনয়নপত্র offered to them and waiting — on them or on the Owner — with the paper kept, for them to read and
 * agree to. While the farm's switch is off, only one they agreed to before it was turned off, for them to withdraw.
 */
export const theirNominationOffers = async (
  context: Acting,
  investorId: string
) => {
  const rows = await context.db.query.nominationOffer.findMany({
    where: {
      farmId: context.farm.id,
      investorId,
      withdrawnAt: { isNull: true },
      approvedAt: { isNull: true },
      ...(context.farm.agreementsInApp
        ? {}
        : { agreedAt: { isNotNull: true } }),
    },
    orderBy: { offeredAt: "asc", id: "asc" },
  });
  return rows.map((one) => ({
    id: one.id,
    offeredAt: one.offeredAt,
    agreedAt: one.agreedAt,
    paper: one.paper as PaperDocument,
    paperHash: one.paperHash,
  }));
};

/** The offer an Investor may agree to now: theirs, standing, while the farm's switch is on. */
export const nominationToAgree = async (
  context: Acting,
  investorId: string,
  offerId: string
) => {
  assertSwitchedOn(context.farm);
  const offer = await theOffer(context.db, context.farm.id, offerId);
  if (offer.investorId !== investorId) {
    throw new ORPCError("NOT_FOUND", { message: "No such offer" });
  }
  if (offer.withdrawnAt) {
    throw WORDS.withdrawn();
  }
  if (offer.approvedAt) {
    throw WORDS.approved();
  }
  return offer;
};

/**
 * An Investor agrees, from their own portal sign-in, to the মনোনয়নপত্র offered them — the paper they read, refused when
 * it is not the one kept — sealed by a Signing Code, whose proof is kept with it. Agreeing again changes nothing.
 */
export const agreeToNomination = async (
  context: Acting & Pick<Context, "callerAddress" | "callerAgent">,
  investorId: string,
  input: { offerId: string; paperHash: string; code: string }
): Promise<void> => {
  const offer = await nominationToAgree(context, investorId, input.offerId);
  assertReadAsKept(offer, input.paperHash);
  if (offer.agreedAt) {
    return;
  }
  await sealAgreement(
    context,
    investorId,
    { ...inApp(context, offer.id), paperHash: offer.paperHash },
    input.code
  );
};

/**
 * An Investor withdraws their agreement to a মনোনয়নপত্র before the Owner approves it, as to any paper (ADR 0022): it
 * waits on them again, the proof kept and marked withdrawn. Refused once approved, and once the Owner has taken it back.
 */
export const withdrawAgreementToNomination = async (
  context: Acting,
  investorId: string,
  offerId: string
): Promise<void> => {
  const offer = await theOffer(context.db, context.farm.id, offerId);
  if (offer.investorId !== investorId) {
    throw new ORPCError("NOT_FOUND", { message: "No such offer" });
  }
  if (offer.approvedAt) {
    throw WORDS.approved();
  }
  if (offer.withdrawnAt) {
    throw WORDS.withdrawn();
  }
  if (!offer.agreedAt) {
    return;
  }
  await withdrawTheAgreement(
    context,
    investorId,
    inApp(context, offer.id),
    WORDS
  );
};
