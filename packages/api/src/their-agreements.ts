import type { Tx } from "./audit";
import { theFarmsShare } from "./investor-store";
import { termsInForceOn } from "./venture-store";

/** One line of an Investor's money, as the Owner reads it on their page: capital that came in or went back on one
 *  of their Agreements, or a payout of what a Settlement owed them. */
export interface TheirMovement {
  id: string;
  agreementId: string;
  ventureId: string;
  kind: "capital_in" | "refund" | "payout";
  amountBdt: number;
  movedOn: string;
  reference: string | null;
}

/** What an approved Settlement owes on one paper, the day it was paid if it has been, and whether they said they
 *  had it; null before a Settlement is approved. */
const settlementOn = (
  share:
    | {
        capitalBdt: number;
        shareBdt: number;
        payoutBdt: number;
        paidMovementId: string | null;
        acknowledgedAt: Date | null;
      }
    | undefined,
  paidBy: Map<string, { movedOn: string }>
) => {
  if (!share) {
    return null;
  }
  const out = share.paidMovementId ? paidBy.get(share.paidMovementId) : null;
  return {
    capitalBdt: share.capitalBdt,
    shareBdt: share.shareBdt,
    payoutBdt: share.payoutBdt,
    paidOn: out?.movedOn ?? null,
    acknowledgedAt: share.acknowledgedAt,
  };
};

/**
 * Everything one Investor signed, read from their side rather than a Venture's: each **Investment Agreement** with
 * its Venture, the terms in force today, the stamp and whether its photo is kept, the capital the Farm holds on it,
 * and what an approved Settlement owes on it and whether it was paid and acknowledged — with every taka of theirs
 * that moved, capital in, back and paid out, the latest first.
 *
 * Narrowed to the one person in every read, as the Investor Statements are: nothing here names anybody else.
 */
export const theirAgreements = async (
  db: Pick<Tx, "query">,
  farmId: string,
  investorId: string,
  today: string
) => {
  const signed = await db.query.investmentAgreement.findMany({
    where: { farmId, investorId },
    orderBy: { createdAt: "desc", id: "desc" },
  });
  if (signed.length === 0) {
    return { agreements: [], movements: [] as TheirMovement[] };
  }
  const agreementIds = signed.map((one) => one.id);
  const [ventures, papers, moved, shares, terms] = await Promise.all([
    db.query.venture.findMany({
      where: { farmId, id: { in: signed.map((one) => one.ventureId) } },
      columns: { id: true, name: true, state: true, unitPriceBdt: true },
    }),
    db.query.agreementPaper.findMany({
      where: { farmId, agreementId: { in: agreementIds } },
      columns: { agreementId: true },
    }),
    db.query.ventureMovement.findMany({
      where: {
        farmId,
        agreementId: { in: agreementIds },
        kind: { in: ["capital_in", "refund"] },
      },
      columns: {
        id: true,
        agreementId: true,
        ventureId: true,
        kind: true,
        amountBdt: true,
        movedOn: true,
        reference: true,
      },
    }),
    db.query.ventureSettlementShare.findMany({
      where: { farmId, agreementId: { in: agreementIds } },
      columns: {
        agreementId: true,
        capitalBdt: true,
        shareBdt: true,
        payoutBdt: true,
        paidMovementId: true,
        acknowledgedAt: true,
      },
    }),
    Promise.all(signed.map((one) => termsInForceOn(db, farmId, one.id, today))),
  ]);
  // A payout names no Agreement on its movement — the share it settled does — so it is read through the share.
  const paidIds = shares
    .map((one) => one.paidMovementId)
    .filter((id): id is string => id !== null);
  const paid =
    paidIds.length === 0
      ? []
      : await db.query.ventureMovement.findMany({
          where: { farmId, id: { in: paidIds } },
          columns: {
            id: true,
            ventureId: true,
            amountBdt: true,
            movedOn: true,
            reference: true,
          },
        });
  const paidBy = new Map(paid.map((one) => [one.id, one]));
  const ventureOf = new Map(ventures.map((one) => [one.id, one]));
  const kept = new Set(papers.map((one) => one.agreementId));
  const shareOf = new Map(shares.map((one) => [one.agreementId, one]));

  const movements: TheirMovement[] = [];
  const heldOn = new Map<string, number>();
  for (const one of moved) {
    if (one.agreementId === null) {
      continue;
    }
    const kind = one.kind === "refund" ? "refund" : "capital_in";
    const sign = kind === "refund" ? -1 : 1;
    heldOn.set(
      one.agreementId,
      (heldOn.get(one.agreementId) ?? 0) + sign * one.amountBdt
    );
    movements.push({
      id: one.id,
      agreementId: one.agreementId,
      ventureId: one.ventureId,
      kind,
      amountBdt: one.amountBdt,
      movedOn: one.movedOn,
      reference: one.reference,
    });
  }
  for (const share of shares) {
    const out = share.paidMovementId ? paidBy.get(share.paidMovementId) : null;
    if (out) {
      movements.push({
        id: out.id,
        agreementId: share.agreementId,
        ventureId: out.ventureId,
        kind: "payout",
        amountBdt: out.amountBdt,
        movedOn: out.movedOn,
        reference: out.reference,
      });
    }
  }
  // The latest first, and `id` behind the day so two movements on one day read the same way every time.
  movements.sort(
    (a, b) => b.movedOn.localeCompare(a.movedOn) || b.id.localeCompare(a.id)
  );

  const agreements = signed.map((one, index) => {
    const run = ventureOf.get(one.ventureId);
    const inForce = terms[index];
    const investorsPercent = inForce?.investorsPercent ?? one.investorsPercent;
    return {
      id: one.id,
      venture: {
        id: one.ventureId,
        name: run?.name ?? "",
        state: run?.state ?? "open",
      },
      units: one.units,
      /** What the Units are worth at the Venture's price: the capital this paper promised. */
      promisedBdt: one.units * (run?.unitPriceBdt ?? 0),
      investorsPercent,
      farmPercent: theFarmsShare(investorsPercent),
      targetWindow: {
        start: inForce?.targetWindowStart ?? one.targetWindowStart,
        end: inForce?.targetWindowEnd ?? one.targetWindowEnd,
      },
      amendedOn: inForce?.amendedOn ?? null,
      signedAt: one.createdAt,
      arbitrator: one.arbitrator,
      stamp: {
        kind: one.stampKind,
        valueBdt: one.stampValueBdt,
        on: one.stampedOn,
        serial: one.stampSerial,
      },
      hasPaper: kept.has(one.id),
      /** Capital the Farm holds on this paper: what came in, less what went back. */
      capitalHeldBdt: heldOn.get(one.id) ?? 0,
      /** What an approved Settlement owes on this paper, and what became of it; null before one is approved. */
      settlement: settlementOn(shareOf.get(one.id), paidBy),
    };
  });
  return { agreements, movements };
};
