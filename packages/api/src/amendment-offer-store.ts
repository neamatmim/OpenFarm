import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, isNull } from "@OpenFarm/db/operators";
import {
  amendmentOffer,
  amendmentOfferAnswer,
} from "@OpenFarm/db/schema/venture";
import type { PaperDocument } from "@OpenFarm/domain";
import { farmDayOf, othersNamedOnly } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Acting } from "./agreeing-in-app";
import {
  assertInThePortal,
  assertSwitchedOn,
  refused,
} from "./agreeing-in-app";
import { amendmentLaidOut } from "./agreement-paper";
import type { AmendmentTerms } from "./agreement-paper";
import { writeAmendment } from "./agreement-write";
import type { Tx } from "./audit";
import { audited } from "./audit";
import { assertRegistered } from "./export-store";
import { assertReadAsKept, keepPaper } from "./kept-paper";
import { producedAt } from "./paper-values";
import { languageOf } from "./reader-language";
import { currentWording, giveStandardTemplates } from "./template-store";
import { lockTheFarm, termsAcrossOn } from "./venture-store";

// An Amendment agreed within the app, instead of on a paper every Investor signs: the Owner offers it, every Investor on
// the Venture agrees to the paper in the portal, and the Owner approves it — and only then is the Venture amended,
// signed on the day approved. Behind the same switch as an Agreement agreed in the app.

type OfferRow = typeof amendmentOffer.$inferSelect;

/** Where an Amendment offer stands. */
export type AmendmentStanding = "offered" | "approved" | "withdrawn";

const standingOf = (offer: OfferRow): AmendmentStanding => {
  if (offer.approvedAt) {
    return "approved";
  }
  return offer.withdrawnAt ? "withdrawn" : "offered";
};

/** The offer as the trail records it either side of a change. */
const readOffer = async (tx: Pick<Tx, "query">, farmId: string, id: string) =>
  (await tx.query.amendmentOffer.findFirst({
    where: { id, farmId },
    columns: { paper: false },
  })) ?? null;

/** This Farm's Amendment offer, or nothing anybody may act on. */
const theOffer = async (
  db: Pick<Tx, "query">,
  farmId: string,
  id: string
): Promise<OfferRow> => {
  const offer = await db.query.amendmentOffer.findFirst({
    where: { id, farmId },
  });
  if (!offer) {
    throw new ORPCError("NOT_FOUND", { message: "No such offer" });
  }
  return offer;
};

/** Refuses a Target Window whose days are not in order. */
const assertInOrder = (terms: AmendmentTerms) => {
  if (terms.targetWindowStart > terms.targetWindowEnd) {
    throw refused(
      "A Target Window needs its days in order",
      "window_out_of_order"
    );
  }
};

/** Refuses an Amendment on a Venture whose Settlement is approved: those figures are what everybody was paid on. */
const assertNotSettled = async (context: Acting, ventureId: string) => {
  const approved = await context.db.query.ventureSettlement.findFirst({
    where: { farmId: context.farm.id, ventureId },
    columns: { id: true },
  });
  if (approved) {
    throw refused(
      "This Venture's Settlement has been approved",
      "already_approved"
    );
  }
};

/** Refuses a second Amendment offered on a Venture while one stands. */
const assertNoneStanding = async (context: Acting, ventureId: string) => {
  const standing = await context.db.query.amendmentOffer.findFirst({
    where: {
      farmId: context.farm.id,
      ventureId,
      withdrawnAt: { isNull: true },
      approvedAt: { isNull: true },
    },
    columns: { id: true },
  });
  if (standing) {
    throw refused(
      "An Amendment is offered on this Venture already; withdraw it first",
      "amendment_already_proposed"
    );
  }
};

/**
 * The Owner offers every Investor on a Venture an Amendment to agree to in the app: the paper laid out now, naming them
 * all, kept as it is with its fingerprint. Nothing reads it until each has agreed and the Owner approves it. Refused
 * while the farm's switch is off, where any Investor on the Venture cannot reach the portal, once its Settlement is
 * approved, and while another stands.
 */
export const proposeAmendmentInApp = async (
  context: Acting,
  input: AmendmentTerms & { ventureId: string }
): Promise<{ id: string; paperHash: string }> => {
  assertSwitchedOn(context.farm);
  assertRegistered(context.farm, "an Amendment");
  assertInOrder(input);
  await assertNotSettled(context, input.ventureId);
  // Every Investor agrees in the portal; the Farm's own Units move with them, and agree nothing with the Farm.
  const signed = await context.db.query.investmentAgreement.findMany({
    where: {
      farmId: context.farm.id,
      ventureId: input.ventureId,
      stampKind: { ne: "farm_own" },
    },
    columns: { investorId: true },
  });
  await assertInThePortal(
    context,
    signed.map((one) => one.investorId)
  );
  await assertNoneStanding(context, input.ventureId);
  await giveStandardTemplates(context);
  const wording = await currentWording(
    context.db,
    context.farm.id,
    "agreement_amendment"
  );
  const now = context.clock.now();
  const { document: paper, run } = await amendmentLaidOut(context.db, {
    farm: context.farm,
    ownerName: context.actor.name,
    ventureId: input.ventureId,
    terms: input,
    wording: wording.content,
    today: farmDayOf(now),
    producedAt: producedAt(now, await languageOf(context.db, context.actor.id)),
  });
  const kept = keepPaper(paper);
  const id = uuidv7(now);
  await audited(context).write(
    {
      entity: "amendment_offer",
      entityId: id,
      action: "create",
      after: (tx) => readOffer(tx, context.farm.id, id),
    },
    async (tx) => {
      await tx.insert(amendmentOffer).values({
        id,
        farmId: context.farm.id,
        ventureId: run.id,
        investorsPercent: input.investorsPercent,
        targetWindowStart: input.targetWindowStart,
        targetWindowEnd: input.targetWindowEnd,
        reason: input.reason,
        templateVersionId: wording.versionId,
        ...kept,
        offeredBy: context.actor.id,
        offeredAt: now,
      });
    }
  );
  return { id, paperHash: kept.paperHash };
};

/** The Owner takes an Amendment offer back, agreed by some or all, until it is approved. */
export const withdrawAmendment = async (
  context: Acting,
  offerId: string
): Promise<void> => {
  const offer = await theOffer(context.db, context.farm.id, offerId);
  if (offer.approvedAt) {
    throw refused(
      "This Amendment is approved: the Venture is amended",
      "offer_already_approved"
    );
  }
  if (offer.withdrawnAt) {
    return;
  }
  await audited(context).write(
    {
      entity: "amendment_offer",
      entityId: offer.id,
      action: "update",
      before: (tx) => readOffer(tx, context.farm.id, offer.id),
      after: (tx) => readOffer(tx, context.farm.id, offer.id),
    },
    async (tx) => {
      await tx
        .update(amendmentOffer)
        .set({ withdrawnAt: context.clock.now() })
        .where(
          and(
            eq(amendmentOffer.id, offer.id),
            isNull(amendmentOffer.approvedAt)
          )
        );
    }
  );
};

/** Refuses approving an offer withdrawn or approved already. */
const assertStanding = (offer: OfferRow) => {
  if (offer.withdrawnAt) {
    throw refused("This offer was withdrawn", "offer_withdrawn");
  }
  if (offer.approvedAt) {
    throw refused(
      "This Amendment is approved: the Venture is amended",
      "offer_already_approved"
    );
  }
};

/** Refuses an Amendment some Agreement on the Venture has not agreed to — one signed since it was offered among them. */
const assertEveryoneAgreed = async (tx: Tx, offer: OfferRow) => {
  const [signed, answers] = await Promise.all([
    tx.query.investmentAgreement.findMany({
      where: {
        farmId: offer.farmId,
        ventureId: offer.ventureId,
        stampKind: { ne: "farm_own" },
      },
      columns: { id: true },
    }),
    tx.query.amendmentOfferAnswer.findMany({
      where: { farmId: offer.farmId, offerId: offer.id },
      columns: { agreementId: true },
    }),
  ]);
  const agreed = new Set(answers.map((one) => one.agreementId));
  if (!signed.every((one) => agreed.has(one.id))) {
    throw refused(
      "Not every Investor on this Venture has agreed to this Amendment",
      "amendment_not_agreed"
    );
  }
};

/**
 * The Owner approves an Amendment every Investor on the Venture has agreed to: it is written against every Agreement
 * on it — by the same write as one signed on paper — signed on the day approved, with no photograph. Approved even
 * with the switch since turned off: it was agreed while it was on.
 */
export const approveAmendment = async (
  context: Acting,
  offerId: string
): Promise<{ id: string; agreements: number }> => {
  const offer = await theOffer(context.db, context.farm.id, offerId);
  assertStanding(offer);
  const now = context.clock.now();
  const signedOn = farmDayOf(now);
  const amendedId = uuidv7(now);
  const auditing = audited(context);
  const amended = await auditing.write(
    {
      entity: "venture",
      entityId: offer.ventureId,
      action: "update",
      reason: offer.reason,
      before: (tx) =>
        termsAcrossOn(tx, context.farm.id, offer.ventureId, signedOn),
      after: (tx) =>
        termsAcrossOn(tx, context.farm.id, offer.ventureId, signedOn),
    },
    async (tx) => {
      await lockTheFarm(tx, context.farm.id);
      await assertEveryoneAgreed(tx, offer);
      const before = await readOffer(tx, context.farm.id, offer.id);
      const written = await writeAmendment(
        tx,
        context.farm.id,
        { id: context.actor.id, now },
        {
          ventureId: offer.ventureId,
          amendedId,
          signedOn,
          investorsPercent: offer.investorsPercent,
          targetWindowStart: offer.targetWindowStart,
          targetWindowEnd: offer.targetWindowEnd,
          reason: offer.reason,
          templateVersionId: offer.templateVersionId ?? "",
        }
      );
      // Marked approved only while it still stands, in the same transaction: one withdrawn meanwhile leaves no
      // Amendment behind.
      const [approving] = await tx
        .update(amendmentOffer)
        .set({ approvedAt: now, approvedBy: context.actor.id, amendedId })
        .where(
          and(
            eq(amendmentOffer.id, offer.id),
            isNull(amendmentOffer.approvedAt),
            isNull(amendmentOffer.withdrawnAt)
          )
        )
        .returning({ id: amendmentOffer.id });
      if (!approving) {
        throw refused(
          "This offer was withdrawn or approved meanwhile",
          "offer_withdrawn"
        );
      }
      await auditing.recordEvent(
        tx,
        { entity: "amendment_offer", entityId: offer.id, action: "update" },
        { before, after: await readOffer(tx, context.farm.id, offer.id) }
      );
      return written.length;
    }
  );
  return { id: amendedId, agreements: amended };
};

/** Every Amendment offered on a Venture, oldest first: its terms, where it stands, and how many of its Agreements have
 *  agreed of how many there are. */
export const amendmentOffersOn = async (context: Acting, ventureId: string) => {
  const [rows, signed] = await Promise.all([
    context.db.query.amendmentOffer.findMany({
      where: { farmId: context.farm.id, ventureId },
      orderBy: { offeredAt: "asc", id: "asc" },
      columns: { paper: false },
    }),
    context.db.query.investmentAgreement.findMany({
      where: {
        farmId: context.farm.id,
        ventureId,
        stampKind: { ne: "farm_own" },
      },
      columns: { id: true },
    }),
  ]);
  const answers = await context.db.query.amendmentOfferAnswer.findMany({
    where: {
      farmId: context.farm.id,
      offerId: { in: rows.map((one) => one.id) },
    },
    columns: { offerId: true, agreementId: true },
  });
  const onTheVenture = new Set(signed.map((one) => one.id));
  return rows.map((one) => ({
    id: one.id,
    investorsPercent: one.investorsPercent,
    targetWindowStart: one.targetWindowStart,
    targetWindowEnd: one.targetWindowEnd,
    reason: one.reason,
    standing: standingOf({ ...one, paper: null }),
    offeredAt: one.offeredAt,
    approvedAt: one.approvedAt,
    /** Of the Agreements on the Venture now, how many have agreed. */
    agreed: answers.filter(
      (answer) =>
        answer.offerId === one.id && onTheVenture.has(answer.agreementId)
    ).length,
    of: signed.length,
  }));
};

/** Their Agreement on the Venture an Amendment is offered on, signed by the time it was offered: the one it names. */
const theirAgreementOn = async (
  db: Pick<Tx, "query">,
  offer: OfferRow,
  investorId: string
) => {
  const theirs = await db.query.investmentAgreement.findFirst({
    where: {
      farmId: offer.farmId,
      ventureId: offer.ventureId,
      investorId,
      createdAt: { lte: offer.offeredAt },
    },
    columns: { id: true },
  });
  return theirs ?? null;
};

/**
 * The Amendments offered on the Ventures they are in — neither withdrawn nor approved, and naming them — with the
 * Venture's name, the paper kept and whether they have agreed, for them to read and agree to.
 */
export const theirAmendmentOffers = async (
  context: Acting,
  investorId: string
) => {
  // Nothing is agreed in the app while the farm's switch is off.
  if (!context.farm.agreementsInApp) {
    return [];
  }
  const theirs = await context.db.query.investmentAgreement.findMany({
    where: { farmId: context.farm.id, investorId },
    columns: { id: true, ventureId: true, createdAt: true },
  });
  const rows = await context.db.query.amendmentOffer.findMany({
    where: {
      farmId: context.farm.id,
      ventureId: { in: theirs.map((one) => one.ventureId) },
      withdrawnAt: { isNull: true },
      approvedAt: { isNull: true },
    },
    orderBy: { offeredAt: "asc", id: "asc" },
  });
  // Nor on a Venture whose Settlement is approved: those figures are what everybody was paid on, and an Amendment on
  // it is never approved.
  const settled = await context.db.query.ventureSettlement.findMany({
    where: {
      farmId: context.farm.id,
      ventureId: { in: rows.map((one) => one.ventureId) },
    },
    columns: { ventureId: true },
  });
  const closed = new Set(settled.map((one) => one.ventureId));
  const named = rows.filter(
    (one) =>
      !closed.has(one.ventureId) &&
      theirs.some(
        (mine) =>
          mine.ventureId === one.ventureId && mine.createdAt <= one.offeredAt
      )
  );
  const [runs, answers] = await Promise.all([
    context.db.query.venture.findMany({
      where: {
        farmId: context.farm.id,
        id: { in: named.map((one) => one.ventureId) },
      },
      columns: { id: true, name: true },
    }),
    context.db.query.amendmentOfferAnswer.findMany({
      where: {
        farmId: context.farm.id,
        offerId: { in: named.map((one) => one.id) },
        agreementId: { in: theirs.map((one) => one.id) },
      },
      columns: { offerId: true, agreedAt: true },
    }),
  ]);
  const nameOf = new Map(runs.map((one) => [one.id, one.name]));
  const reader = await context.db.query.investor.findFirst({
    where: { id: investorId, farmId: context.farm.id },
    columns: { name: true, phone: true },
  });
  return named.map((one) => ({
    id: one.id,
    ventureName: nameOf.get(one.ventureId) ?? "",
    investorsPercent: one.investorsPercent,
    targetWindowStart: one.targetWindowStart,
    targetWindowEnd: one.targetWindowEnd,
    reason: one.reason,
    offeredAt: one.offeredAt,
    agreedAt:
      answers.find((answer) => answer.offerId === one.id)?.agreedAt ?? null,
    // The other Investors by name alone. What they agree to is the paper kept, by its fingerprint, all the same.
    paper: othersNamedOnly(
      one.paper as PaperDocument,
      reader ?? { name: "", phone: "" }
    ),
    paperHash: one.paperHash,
  }));
};

/**
 * An Investor agrees, from their own portal sign-in, to an Amendment offered on a Venture they are in — to the paper
 * they read, whose fingerprint they send back: refused when it is not the one kept. Refused for one not naming them,
 * one withdrawn, one on a Venture settled since, and while the farm's switch is off. Agreeing again changes nothing.
 */
export const agreeToAmendment = async (
  context: Acting,
  investorId: string,
  input: { offerId: string; paperHash: string }
): Promise<void> => {
  assertSwitchedOn(context.farm);
  const offer = await theOffer(context.db, context.farm.id, input.offerId);
  const theirs = await theirAgreementOn(context.db, offer, investorId);
  if (!theirs) {
    throw new ORPCError("NOT_FOUND", { message: "No such offer" });
  }
  if (offer.withdrawnAt) {
    throw refused("This offer was withdrawn", "offer_withdrawn");
  }
  // Its Settlement approved since: an Amendment agreed now could never be approved.
  await assertNotSettled(context, offer.ventureId);
  assertReadAsKept(offer, input.paperHash);
  const already = await context.db.query.amendmentOfferAnswer.findFirst({
    where: {
      farmId: context.farm.id,
      offerId: offer.id,
      agreementId: theirs.id,
    },
    columns: { id: true },
  });
  if (already || offer.approvedAt) {
    return;
  }
  const now = context.clock.now();
  const id = uuidv7(now);
  await audited(context).write(
    {
      entity: "amendment_offer",
      entityId: offer.id,
      action: "update",
      after: { agreementId: theirs.id, agreedAt: now.toISOString() },
    },
    async (tx) => {
      await tx
        .insert(amendmentOfferAnswer)
        .values({
          id,
          farmId: context.farm.id,
          offerId: offer.id,
          agreementId: theirs.id,
          agreedBy: context.actor.id,
          agreedAt: now,
        })
        .onConflictDoNothing();
    }
  );
};
