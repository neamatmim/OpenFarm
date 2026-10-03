import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, isNull } from "@OpenFarm/db/operators";
import { agreementOffer } from "@OpenFarm/db/schema/venture";
import type { Nominee, PaperDocument } from "@OpenFarm/domain";
import { farmDayOf } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Acting } from "./agreeing-in-app";
import {
  assertInThePortal,
  assertSwitchedOn,
  refused,
} from "./agreeing-in-app";
import { agreementLaidOut } from "./agreement-paper";
import type { AgreementTerms } from "./agreement-paper";
import { writeAgreement } from "./agreement-write";
import type { Tx } from "./audit";
import { audited } from "./audit";
import { assertRegistered } from "./export-store";
import { readAgreement, unitsTaken } from "./investor-store";
import { assertReadAsKept, keepPaper, stillAsKept } from "./kept-paper";
import { assertNamable, nomineesToSign } from "./nominations";
import { producedAt } from "./paper-values";
import { languageOf } from "./reader-language";
import { currentWording, giveStandardTemplates } from "./template-store";

// An Investment Agreement agreed within the app, instead of on stamped paper: the Owner offers it, the Investor agrees
// to the paper in the portal, and the Owner approves it — and only then is it an Agreement. Behind the farm's switch,
// which is off until the lawyer and the Shariah scholar have confirmed the farm may rely on an Agreement with no stamp.

/** How much of the paper's fingerprint the Agreement's stamp line carries as its number: enough to find the paper by. */
const NUMBER_LENGTH = 12;

/** Where an offer stands. */
export type OfferStanding = "offered" | "agreed" | "approved" | "withdrawn";

type OfferRow = typeof agreementOffer.$inferSelect;

const standingOf = (offer: OfferRow): OfferStanding => {
  if (offer.approvedAt) {
    return "approved";
  }
  if (offer.withdrawnAt) {
    return "withdrawn";
  }
  return offer.agreedAt ? "agreed" : "offered";
};

/** The offer as the trail records it either side of a change. */
const readOffer = async (tx: Pick<Tx, "query">, farmId: string, id: string) =>
  (await tx.query.agreementOffer.findFirst({
    where: { id, farmId },
    columns: { paper: false },
  })) ?? null;

/** This Farm's offer, or nothing anybody may act on. */
const theOffer = async (
  db: Pick<Tx, "query">,
  farmId: string,
  id: string
): Promise<OfferRow> => {
  const offer = await db.query.agreementOffer.findFirst({
    where: { id, farmId },
  });
  if (!offer) {
    throw new ORPCError("NOT_FOUND", { message: "No such offer" });
  }
  return offer;
};

/** The Venture an Agreement is offered or approved on: this Farm's, and still taking signatures. */
const openVenture = async (context: Acting, ventureId: string) => {
  const run = await context.db.query.venture.findFirst({
    where: { id: ventureId, farmId: context.farm.id },
  });
  if (!run) {
    throw new ORPCError("NOT_FOUND", { message: "No such Venture" });
  }
  if (run.state !== "open") {
    throw refused(
      "A Venture takes signatures only while it is open",
      "venture_wrong_state"
    );
  }
  return run;
};

/** Refuses a second offer to them on a Venture while one stands, or once they have signed for it. */
const assertNothingStanding = async (
  context: Acting,
  ventureId: string,
  investorId: string
) => {
  const [signed, standing] = await Promise.all([
    context.db.query.investmentAgreement.findFirst({
      where: { farmId: context.farm.id, ventureId, investorId },
      columns: { id: true },
    }),
    context.db.query.agreementOffer.findFirst({
      where: {
        farmId: context.farm.id,
        ventureId,
        investorId,
        withdrawnAt: { isNull: true },
        approvedAt: { isNull: true },
      },
      columns: { id: true },
    }),
  ]);
  if (signed) {
    throw refused(
      "This Investor has signed for this Venture already",
      "investor_already_signed"
    );
  }
  if (standing) {
    throw refused(
      "An offer to them on this Venture is standing already; withdraw it first",
      "offer_already_made"
    );
  }
};

/**
 * The Owner offers one Investor an Investment Agreement to agree to in the app: the paper laid out now, as it would be
 * printed to sign, kept as it is with its fingerprint. Nothing counts it — no Units are held, no Investor is counted —
 * until the Owner approves it after the Investor has agreed. Refused while the farm's switch is off, to an Investor who
 * cannot reach the portal, and on a Venture no longer open.
 */
export const offerInApp = async (
  context: Acting,
  input: AgreementTerms & {
    ventureId: string;
    investorId: string;
    requestId?: string;
    nominees?: readonly Nominee[];
  }
): Promise<{ id: string; paperHash: string }> => {
  assertSwitchedOn(context.farm);
  assertRegistered(context.farm, "an Investment Agreement");
  const run = await openVenture(context, input.ventureId);
  const him = await context.db.query.investor.findFirst({
    where: { id: input.investorId, farmId: context.farm.id },
  });
  if (!him) {
    throw new ORPCError("NOT_FOUND", { message: "No such Investor" });
  }
  if (him.retiredAt) {
    throw refused(
      "This Investor is retired; restore them before signing them for a Venture",
      "investor_retired"
    );
  }
  await assertInThePortal(context, [him.id]);
  await assertNothingStanding(context, run.id, him.id);
  const taken = await unitsTaken(context.db, context.farm.id, run.id);
  if (taken + input.units > run.units) {
    throw refused(
      `Only ${run.units - taken} Units of this Venture are left`,
      "venture_units_gone"
    );
  }
  const now = context.clock.now();
  const today = farmDayOf(now);
  const nominees = await nomineesToSign(
    context.db,
    context.farm.id,
    him.id,
    input.nominees
  );
  assertNamable(nominees, today);
  await giveStandardTemplates(context);
  const wording = await currentWording(
    context.db,
    context.farm.id,
    "investment_agreement"
  );
  const paper = agreementLaidOut({
    farm: context.farm,
    ownerName: context.actor.name,
    run,
    him,
    nominees,
    terms: input,
    wording: wording.content,
    today,
    producedAt: producedAt(now, await languageOf(context.db, context.actor.id)),
  });
  const kept = keepPaper(paper);
  const id = uuidv7(now);
  await audited(context).write(
    {
      entity: "agreement_offer",
      entityId: id,
      action: "create",
      after: (tx) => readOffer(tx, context.farm.id, id),
    },
    async (tx) => {
      await tx.insert(agreementOffer).values({
        id,
        farmId: context.farm.id,
        ventureId: run.id,
        investorId: him.id,
        units: input.units,
        investorsPercent: input.investorsPercent,
        arbitrator: input.arbitrator,
        nominees: [...nominees],
        requestId: input.requestId ?? null,
        templateVersionId: wording.versionId,
        ...kept,
        offeredBy: context.actor.id,
        offeredAt: now,
      });
    }
  );
  return { id, paperHash: kept.paperHash };
};

/** The Owner takes an offer back, agreed or not, until it is approved. */
export const withdrawOffer = async (
  context: Acting,
  offerId: string
): Promise<void> => {
  const offer = await theOffer(context.db, context.farm.id, offerId);
  if (offer.approvedAt) {
    throw refused(
      "This offer is approved: it is an Agreement now",
      "offer_already_approved"
    );
  }
  if (offer.withdrawnAt) {
    return;
  }
  await audited(context).write(
    {
      entity: "agreement_offer",
      entityId: offer.id,
      action: "update",
      before: (tx) => readOffer(tx, context.farm.id, offer.id),
      after: (tx) => readOffer(tx, context.farm.id, offer.id),
    },
    async (tx) => {
      await tx
        .update(agreementOffer)
        .set({ withdrawnAt: context.clock.now() })
        .where(
          and(
            eq(agreementOffer.id, offer.id),
            isNull(agreementOffer.approvedAt)
          )
        );
    }
  );
};

/** Refuses approving an offer that is not waiting on the Owner: withdrawn, approved already, or not yet agreed. */
const assertApprovable = (offer: OfferRow) => {
  if (offer.withdrawnAt) {
    throw refused("This offer was withdrawn", "offer_withdrawn");
  }
  if (offer.approvedAt) {
    throw refused(
      "This offer is approved: it is an Agreement now",
      "offer_already_approved"
    );
  }
  if (!offer.agreedAt) {
    throw refused(
      "The Investor has not agreed to this offer yet",
      "offer_not_agreed"
    );
  }
};

/**
 * The Owner approves an offer the Investor has agreed to: the Investment Agreement is written from it — by the same
 * write a paper signed on stamp is, asking again everything signing asks — with its stamp line saying it was agreed in
 * the app, the day approved and the agreed paper's number, and no taka. Approved even with the switch since turned
 * off: it was agreed while it was on.
 */
export const approveOffer = async (
  context: Acting,
  offerId: string
): Promise<{ agreementId: string; payInCode: string }> => {
  const offer = await theOffer(context.db, context.farm.id, offerId);
  assertApprovable(offer);
  const run = await openVenture(context, offer.ventureId);
  const now = context.clock.now();
  const agreementId = uuidv7(now);
  const auditing = audited(context);
  const payInCode = await auditing.write(
    {
      entity: "investment_agreement",
      entityId: agreementId,
      action: "create",
      after: (tx) => readAgreement(tx, context.farm.id, agreementId),
    },
    async (tx) => {
      const before = await readOffer(tx, context.farm.id, offer.id);
      const given = await writeAgreement(
        tx,
        auditing.recordEvent,
        context.farm,
        { id: context.actor.id, now },
        {
          id: agreementId,
          venture: run,
          investorId: offer.investorId,
          units: offer.units,
          investorsPercent: offer.investorsPercent,
          arbitrator: offer.arbitrator,
          stamp: {
            kind: "in_app",
            valueMoney: 0,
            on: farmDayOf(now),
            serial: offer.paperHash.slice(0, NUMBER_LENGTH).toUpperCase(),
          },
          templateVersionId: offer.templateVersionId ?? "",
          requestId: offer.requestId ?? undefined,
          nominees: (offer.nominees ?? []) as Nominee[],
        }
      );
      // Marked approved only while it is still neither withdrawn nor approved, in the same transaction: an offer
      // withdrawn meanwhile leaves no Agreement behind.
      const [approving] = await tx
        .update(agreementOffer)
        .set({ approvedAt: now, approvedBy: context.actor.id, agreementId })
        .where(
          and(
            eq(agreementOffer.id, offer.id),
            isNull(agreementOffer.approvedAt),
            isNull(agreementOffer.withdrawnAt)
          )
        )
        .returning({ id: agreementOffer.id });
      if (!approving) {
        throw refused(
          "This offer was withdrawn or approved meanwhile",
          "offer_withdrawn"
        );
      }
      await auditing.recordEvent(
        tx,
        { entity: "agreement_offer", entityId: offer.id, action: "update" },
        { before, after: await readOffer(tx, context.farm.id, offer.id) }
      );
      return given;
    }
  );
  return { agreementId, payInCode };
};

/** One offer as the Owner reads it on the Venture: to whom, on what terms, and where it stands. */
const offerSaid = (offer: OfferRow) => ({
  id: offer.id,
  investorId: offer.investorId,
  units: offer.units,
  investorsPercent: offer.investorsPercent,
  arbitrator: offer.arbitrator,
  standing: standingOf(offer),
  offeredAt: offer.offeredAt,
  agreedAt: offer.agreedAt,
  approvedAt: offer.approvedAt,
  withdrawnAt: offer.withdrawnAt,
  agreementId: offer.agreementId,
});

/** Every offer made on a Venture, oldest first. */
export const offersOn = async (context: Acting, ventureId: string) => {
  const rows = await context.db.query.agreementOffer.findMany({
    where: { farmId: context.farm.id, ventureId },
    orderBy: { offeredAt: "asc", id: "asc" },
  });
  return rows.map(offerSaid);
};

/**
 * The offers waiting on one Investor or on the Owner — neither withdrawn nor approved — with the Venture's name and the
 * paper kept, for them to read and agree to.
 */
export const theirOffers = async (context: Acting, investorId: string) => {
  const rows = await context.db.query.agreementOffer.findMany({
    where: {
      farmId: context.farm.id,
      investorId,
      withdrawnAt: { isNull: true },
      approvedAt: { isNull: true },
    },
    orderBy: { offeredAt: "asc", id: "asc" },
  });
  const runs = await context.db.query.venture.findMany({
    where: {
      farmId: context.farm.id,
      id: { in: rows.map((one) => one.ventureId) },
    },
    columns: { id: true, name: true },
  });
  const nameOf = new Map(runs.map((one) => [one.id, one.name]));
  return rows.map((one) => ({
    id: one.id,
    ventureName: nameOf.get(one.ventureId) ?? "",
    units: one.units,
    investorsPercent: one.investorsPercent,
    offeredAt: one.offeredAt,
    agreedAt: one.agreedAt,
    paper: one.paper as PaperDocument,
    paperHash: one.paperHash,
  }));
};

/**
 * An Investor agrees, from their own portal sign-in, to the paper offered to them — the paper they read, whose
 * fingerprint they send back: refused when it is not the one kept. Refused for an offer not theirs, one withdrawn, and
 * while the farm's switch is off. Agreeing again changes nothing.
 */
export const agreeToOffer = async (
  context: Acting,
  investorId: string,
  input: { offerId: string; paperHash: string }
): Promise<void> => {
  assertSwitchedOn(context.farm);
  const offer = await theOffer(context.db, context.farm.id, input.offerId);
  if (offer.investorId !== investorId) {
    throw new ORPCError("NOT_FOUND", { message: "No such offer" });
  }
  if (offer.withdrawnAt) {
    throw refused("This offer was withdrawn", "offer_withdrawn");
  }
  assertReadAsKept(offer, input.paperHash);
  if (offer.agreedAt) {
    return;
  }
  await audited(context).write(
    {
      entity: "agreement_offer",
      entityId: offer.id,
      action: "update",
      before: (tx) => readOffer(tx, context.farm.id, offer.id),
      after: (tx) => readOffer(tx, context.farm.id, offer.id),
    },
    async (tx) => {
      await tx
        .update(agreementOffer)
        .set({ agreedAt: context.clock.now(), agreedBy: context.actor.id })
        .where(
          and(
            eq(agreementOffer.id, offer.id),
            isNull(agreementOffer.withdrawnAt),
            isNull(agreementOffer.agreedAt)
          )
        );
    }
  );
};

/**
 * The paper an Agreement approved from an offer was agreed on, as it was kept — what a copy of it prints — or nothing
 * for an Agreement signed on stamp. Never a paper that is not still as kept: one changed since is no copy of anything.
 */
export const agreedPaperOf = async (
  db: Pick<Tx, "query">,
  farmId: string,
  agreementId: string
): Promise<PaperDocument | null> => {
  const offer = await db.query.agreementOffer.findFirst({
    where: { farmId, agreementId },
    columns: { paper: true, paperHash: true },
  });
  if (!offer) {
    return null;
  }
  if (!stillAsKept(offer)) {
    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message: "The paper this Agreement was agreed on is not as it was kept",
    });
  }
  return offer.paper as PaperDocument;
};
