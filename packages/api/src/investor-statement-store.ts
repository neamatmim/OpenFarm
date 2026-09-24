import type { Database } from "@OpenFarm/db";
import type { AdjustmentOutcome } from "@OpenFarm/db/schema/venture";
import { exitOf, roundTaka } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";
import { farmCosts } from "./cost-store";
import type { ChargeWord } from "./settlement-store";
import { readSettlement, whatItWasCharged } from "./settlement-store";
import type { VentureRow } from "./venture-store";
import {
  budgetsOf,
  heldByEach,
  ownedThenByOf,
  signedForEach,
  termsInForceOn,
} from "./venture-store";

/** The terms one Agreement froze at signing: what he agreed to, which is not what the Venture says today. */
export interface HisAgreement {
  id: string;
  units: number;
  investorsPercent: number;
  targetWindowStart: string;
  targetWindowEnd: string;
  /** The day a paper everybody signed moved these, where one did. */
  amendedOn: string | null;
  arbitrator: string;
  stampKind: "paper" | "e_challan";
  stampValueBdt: number;
  stampedOn: string;
  stampSerial: string;
}

/**
 * One movement of his own capital through the Venture Account: what moved, which way, the day the bank
 * moved it, and the reference it went on — the four things that let him hold a paper beside his own bank
 * statement and find the same lines.
 *
 * Both ways, because a Venture that missed its Floor is cancelled and every taka goes back: a sheet
 * showing only what came in would tell a man the Farm holds money it has already returned.
 */
export interface HisCapital {
  kind: "received" | "returned";
  amountBdt: number;
  movedOn: string;
  reference: string;
}

/** Him, as a paper addresses him, and the person his family would come to the farm about. */
export interface HimAndHisNominee {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  nid: string | null;
  nominee: {
    name: string;
    phone: string | null;
    relation: string | null;
  } | null;
}

/** The Venture a paper is about, as a paper says it. */
export interface TheVenture {
  id: string;
  name: string;
  unitPriceBdt: number;
}

/** Everything a paper may print about one man on one Venture, and nothing about anybody else. */
export interface HisStanding {
  venture: TheVenture;
  him: HimAndHisNominee;
  agreement: HisAgreement;
  capital: HisCapital[];
  /** What the Farm holds of his: received less returned. */
  capitalBdt: number;
}

const noSuchAgreement = () =>
  new ORPCError("NOT_FOUND", {
    message: "No such agreement",
    data: { refusal: "no_such_agreement" },
  });

/**
 * One Agreement's standing: the Venture, the man, what his paper froze, and every taka of his that has
 * moved either way — narrowed to him before anything is assembled.
 *
 * Every existing reading of a Venture is Venture-shaped: `ventures.agreements` and `ventures.movements`
 * hand back every Agreement and every movement on the run, and a Settlement's payout rows carry every
 * Investor's name. A statement assembled from those would be one careless `.filter` away from sending a
 * man his neighbour's money, and a payload that reached a browser holding it has left the farm whatever
 * the paper printed. So the narrowing happens here, in the one place the three papers read through, and
 * what comes back was never wider than the man it is for (CONTEXT: Investor Statement).
 *
 * Keyed on the **Agreement**, which is the paper the money was signed for. One man holds one Agreement per
 * Venture today — `investment_agreement_uidx` is unique on (venture, investor) — so this is unambiguous
 * now, and stays unambiguous if that index is ever loosened.
 */
export const hisStanding = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  agreementId: string,
  /** The day the paper is being made. What it prints is what was in force then, not at signing. */
  on: string
): Promise<HisStanding> => {
  const agreement = await tx.query.investmentAgreement.findFirst({
    where: { id: agreementId, farmId },
  });
  if (!agreement) {
    throw noSuchAgreement();
  }
  // Three reads rather than a join, as `ventures.agreements` does it: an Agreement declares no relations.
  const [venture, investor] = await Promise.all([
    tx.query.venture.findFirst({
      where: { id: agreement.ventureId, farmId },
      columns: { id: true, name: true, unitPriceBdt: true },
    }),
    tx.query.investor.findFirst({
      where: { id: agreement.investorId, farmId },
    }),
  ]);
  if (!(venture && investor)) {
    throw noSuchAgreement();
  }
  // His own capital, asked for by his Agreement: a Float or a Reimbursement is the Venture's money and no
  // Investor's, and another man's capital is none of his business. Refunds as well as what came in — a
  // cancelled Venture sends every taka back, and those movements carry his Agreement too.
  const moved = await tx.query.ventureMovement.findMany({
    where: {
      farmId,
      ventureId: venture.id,
      agreementId,
      kind: { in: ["capital_in", "refund"] },
    },
    columns: { kind: true, amountBdt: true, movedOn: true, reference: true },
    orderBy: { movedOn: "asc", id: "asc" },
  });
  const terms = (await termsInForceOn(tx, farmId, agreement.id, on)) ?? {
    investorsPercent: agreement.investorsPercent,
    targetWindowStart: agreement.targetWindowStart,
    targetWindowEnd: agreement.targetWindowEnd,
    amendedOn: null,
  };
  const capital: HisCapital[] = moved.map((one) => ({
    kind: one.kind === "refund" ? "returned" : "received",
    amountBdt: one.amountBdt,
    movedOn: one.movedOn,
    reference: one.reference,
  }));
  return {
    venture: {
      id: venture.id,
      name: venture.name,
      unitPriceBdt: venture.unitPriceBdt,
    },
    him: {
      id: investor.id,
      name: investor.name,
      phone: investor.phone,
      address: investor.address,
      nid: investor.nid,
      nominee: investor.nomineeName
        ? {
            name: investor.nomineeName,
            phone: investor.nomineePhone,
            relation: investor.nomineeRelation,
          }
        : null,
    },
    agreement: {
      id: agreement.id,
      units: agreement.units,
      // The terms as the day reads them. An amendment everybody signed moved the split or the window,
      // and a paper that printed what he signed at the start would be telling him the wrong deal.
      investorsPercent: terms.investorsPercent,
      targetWindowStart: terms.targetWindowStart,
      targetWindowEnd: terms.targetWindowEnd,
      amendedOn: terms.amendedOn,
      arbitrator: agreement.arbitrator,
      stampKind: agreement.stampKind,
      stampValueBdt: agreement.stampValueBdt,
      stampedOn: agreement.stampedOn,
      stampSerial: agreement.stampSerial,
    },
    capital,
    capitalBdt: capital.reduce(
      (sum, one) =>
        sum + (one.kind === "returned" ? -one.amountBdt : one.amountBdt),
      0
    ),
  };
};

/**
 * Refuses a paper acknowledging money the Farm does not hold.
 *
 * Two ways that happens and they are different news: nothing has arrived yet, and there is simply nothing
 * to acknowledge; or it arrived and went back, because the Venture was called off. Either way a sheet
 * saying the Farm holds his capital would be the Farm telling a man something untrue about his own money.
 */
export const assertCapitalHeld = (standing: HisStanding) => {
  if (standing.capital.length === 0) {
    throw new ORPCError("BAD_REQUEST", {
      message: "No capital has arrived against that agreement yet",
      data: { refusal: "no_capital_yet" },
    });
  }
  if (standing.capitalBdt <= 0) {
    throw new ORPCError("BAD_REQUEST", {
      message: "That agreement's capital has been refunded",
      data: { refusal: "capital_returned" },
    });
  }
};

/** What a Venture's run has cost so far, by the same seven words the Settlement will freeze. */
export interface TheirSpend {
  charges: { word: ChargeWord; bdt: number }[];
  chargedBdt: number;
  /** The Units actually signed for, which is what a share of this Venture divides by — not the Units
   *  the plan offered, which an under-subscribed Venture never sold. */
  signedUnits: number;
  cattleBudgetBdt: number;
  runningBudgetBdt: number;
  /** What of the money that came in for buying animals has not been drawn against. */
  cattleBudgetLeftBdt: number;
  /**
   * What keeping the animals has cost so far: feed, medicine, the vet and their share of the Herd
   * Costs, off the charge lines above.
   *
   * Spent rather than left, and the difference matters on a paper. What the Venture Account *holds*
   * against the Running Budget is the Owner's screen's answer and includes what its Animals have
   * fetched — so once selling starts it reads as more left than the budget ever was, which is nonsense
   * on a sheet a man keeps. What has gone on keeping them is a figure he can check against the lines
   * printed right above it.
   */
  runningSpentBdt: number;
}

/** An average in taka, or nothing at all where there is nothing to average. */
const meanTaka = (values: number[]) =>
  values.length === 0
    ? null
    : roundTaka(values.reduce((sum, one) => sum + one, 0) / values.length);

/** The charge words that are the Running Budget's: what the animals cost while they stand here. */
const KEEPING_THEM = new Set<ChargeWord>(["feed", "medicine", "vet", "herd"]);

/**
 * Where a Venture's money has gone so far, and what is left of each budget.
 *
 * The charge lines are the Settlement's own — `chargeLinesOf`, the same seven words off the same costing
 * — so that what an Investor is shown while the run goes on adds up the same way as what he is shown
 * when it ends. A progress sheet that totalled differently from the settlement sheet would be the farm
 * arguing with itself in front of the man whose money it is.
 *
 * Both purses, because the costing covers both: what the Venture's own Float paid at the haat, and what
 * the Farm bought for the whole herd and is repaid for through the monthly **Reimbursement**. A sum off
 * the Venture's own Money Events alone would understate feed and medicine badly.
 */
export const theirSpend = async (
  tx: Pick<Tx, "query"> & { execute: Database["execute"] },
  farmId: string,
  venture: {
    id: string;
    targetCapitalBdt: number;
    cattleBudgetBdt: number;
    /** Which side of the run it is on: what buying did not spend is feeding money once it closes. */
    state: VentureRow["state"];
  }
): Promise<TheirSpend> => {
  const [costs, ownedThenBy, held, signed, paidIn] = await Promise.all([
    farmCosts(tx, farmId),
    ownedThenByOf(tx, farmId),
    heldByEach(tx, farmId, [venture.id]),
    signedForEach(tx, farmId, [venture.id]),
    tx.query.ventureMovement.findMany({
      where: { farmId, ventureId: venture.id },
      columns: { kind: true, amountBdt: true },
    }),
  ]);
  const { charges } = whatItWasCharged(costs, ownedThenBy, venture.id, paidIn);
  const budgets = budgetsOf(venture, held.get(venture.id));
  return {
    charges,
    // The sum of the lines as they are shown, not of the figures behind them — as the Settlement does
    // it, because lines that do not add up to the total beneath them is the farm arguing with itself.
    chargedBdt: roundTaka(charges.reduce((sum, one) => sum + one.bdt, 0)),
    signedUnits: signed.get(venture.id)?.units ?? 0,
    cattleBudgetBdt: budgets.cattleBudgetBdt,
    runningBudgetBdt: budgets.runningBudgetBdt,
    cattleBudgetLeftBdt: budgets.cattleBudgetDrawnAgainstBdt,
    runningSpentBdt: roundTaka(
      charges
        .filter((one) => KEEPING_THEM.has(one.word))
        .reduce((sum, one) => sum + one.bdt, 0)
    ),
  };
};

/** The Venture a statement is about, as the readings behind it need it. */
export const theVentureOf = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  ventureId: string
) => {
  const row = await tx.query.venture.findFirst({
    where: { id: ventureId, farmId },
  });
  if (!row) {
    throw new ORPCError("NOT_FOUND", {
      message: "No such Venture",
      data: { refusal: "no_such_venture" },
    });
  }
  return row;
};

/**
 * The photographs of the animals a sheet lists, to travel beside it.
 *
 * Asked only of the animals the sheet says have one, so a Venture nobody has photographed sends nothing
 * rather than a query per beast. Base64 in the payload is what the farm holds and what a screen renders;
 * a sheet of twenty is twenty of them, which is the reason the sheet lists only the standing animals.
 */
export const theirPhotographs = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  animals: readonly { tagNumber: string }[]
): Promise<{ tagNumber: string; contentType: string; data: string }[]> => {
  if (animals.length === 0) {
    return [];
  }
  const tags = animals.map((one) => one.tagNumber);
  const rows = await tx.query.animal.findMany({
    where: { farmId, tagNumber: { in: tags } },
    columns: { id: true, tagNumber: true },
  });
  const photos = await tx.query.animalPhoto.findMany({
    where: { farmId, animalId: { in: rows.map((one) => one.id) } },
    columns: { animalId: true, contentType: true, data: true },
  });
  const named = new Map(rows.map((one) => [one.id, one.tagNumber]));
  return photos.flatMap((one) => {
    const tagNumber = named.get(one.animalId);
    return tagNumber
      ? [{ tagNumber, contentType: one.contentType, data: one.data }]
      : [];
  });
};

/** What became of the herd over the whole run, as the closing sheet tells it. */
export interface TheirHerdStory {
  boughtCount: number;
  averageBoughtBdt: number | null;
  soldCount: number;
  averageSoldBdt: number | null;
  boughtBackCount: number;
  diedCount: number;
}

/** One Settlement Adjustment as his own sheet says it: what it was about, and what it came to for him. */
export interface HisAdjustment {
  reason: string;
  raisedAt: Date;
  outcome: AdjustmentOutcome;
  /** What his Units are worth of it, and what of that has actually reached him. */
  differenceBdt: number;
  paidBdt: number;
}

/** His own line of an approved Settlement, and the Venture's figures it was worked out from. */
export interface HisSettlement {
  approvedAt: Date;
  proceedsBdt: number;
  charges: { word: ChargeWord; bdt: number }[];
  chargedBdt: number;
  profitBdt: number;
  investorsPercent: number;
  units: number;
  perUnitBdt: number;
  roundingBdt: number;
  farmBdt: number;
  advanceBdt: number;
  advanceRepaid: boolean;
  /** Capital returned to all of them, which is what a Unit's own capital divides out of. Follows from
   *  the Units and the unit price he already holds, so it discloses nothing of anybody else. */
  capitalBdt: number;
  /** His: what his Units took, what came back, and what went out to him. */
  his: {
    units: number;
    capitalBdt: number;
    shareBdt: number;
    payoutBdt: number;
    /** The reference the money went out on, or nothing while it has not. */
    reference: string | null;
    paidOn: string | null;
  };
  adjustments: HisAdjustment[];
}

/**
 * His own line of a Settlement, off the figures the approval froze.
 *
 * Never recomputed. Approving wrote the figures down as they stood and every Investor was paid on them,
 * so what he is shown a year later has to be what he was shown on the day — which is why the Corrections
 * that would move them are refused in favour of an Adjustment. A sheet that worked the sum out afresh
 * would quietly undo all of that.
 *
 * Narrowed to his Agreement before it leaves: the frozen read carries every Investor's share row and
 * every Investor's name, and none of that is his business.
 */
export const hisSettlement = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  standing: HisStanding
): Promise<HisSettlement | null> => {
  const settled = await readSettlement(tx, farmId, standing.venture.id);
  if (!settled) {
    return null;
  }
  const his = settled.shares.find(
    (one) => one.agreementId === standing.agreement.id
  );
  if (!his) {
    return null;
  }
  // The reference is on the movement the money went out on, not on the share row, so a sheet produced
  // before the last transfer has gone says so rather than printing a blank where a reference belongs.
  const paid = his.paidMovementId
    ? await tx.query.ventureMovement.findFirst({
        where: { farmId, id: his.paidMovementId },
        columns: { reference: true, movedOn: true },
      })
    : null;
  return {
    approvedAt: settled.approvedAt,
    proceedsBdt: settled.proceedsBdt,
    charges: settled.charges,
    chargedBdt: settled.chargedBdt,
    profitBdt: settled.profitBdt,
    investorsPercent: settled.investorsPercent,
    units: settled.units,
    perUnitBdt: settled.perUnitBdt,
    roundingBdt: settled.roundingBdt,
    farmBdt: settled.farmBdt,
    advanceBdt: settled.advanceBdt,
    advanceRepaid: settled.advanceRepaid,
    capitalBdt: settled.capitalBdt,
    his: {
      units: his.units,
      capitalBdt: his.capitalBdt,
      shareBdt: his.shareBdt,
      payoutBdt: his.payoutBdt,
      reference: paid?.reference ?? null,
      paidOn: paid?.movedOn ?? null,
    },
    // What each Adjustment is worth to him, which is what his Units take of it. Never another man's.
    adjustments: settled.adjustments.map((one) => ({
      reason: one.reason,
      raisedAt: one.raisedAt,
      outcome: one.outcome,
      differenceBdt: roundTaka(one.perUnitDifferenceBdt * his.units),
      paidBdt: roundTaka(one.perUnitPaidBdt * his.units),
    })),
  };
};

/**
 * What became of a Venture's cattle over the whole run: how many it bought and at what average, how many
 * went to a buyer and at what average, how many the Farm bought back at wind-up, and how many it lost.
 *
 * The result with a story attached. An Investor reading a profit figure alone learns nothing about why it
 * is what it is; four bulls bought at sixty and sold at ninety is an answer he can weigh.
 *
 * Each of the four asks whose she was at the moment of the thing it counts, so that they cannot overlap:
 * bought at her arrival, sold on the day the buyer took her, lost on the day she went. The Farm's
 * buy-back at wind-up is an **Internal Sale** to nobody, which is what tells it from a bull sold across
 * to another Venture — and neither of those is a Sale.
 */
export const theirHerdStory = async (
  tx: Pick<Tx, "query"> & { execute: Database["execute"] },
  farmId: string,
  ventureId: string
): Promise<TheirHerdStory> => {
  const [costs, ownedThenBy, internal] = await Promise.all([
    farmCosts(tx, farmId),
    ownedThenByOf(tx, farmId),
    tx.query.internalSale.findMany({
      where: { farmId },
      columns: {
        animalId: true,
        fromVentureId: true,
        toVentureId: true,
        priceBdt: true,
        soldOn: true,
      },
    }),
  ]);
  const byId = new Map(costs.animals.map((one) => [one.id, one]));
  // Every event asks whose she was at *that* moment, which is the only way the four counts do not
  // overlap. A bull the Farm bought back at wind-up and sold on afterwards was not this Venture's when
  // the buyer took him, and a bull sold across to another Venture was that Venture's from the day he
  // went — counting either as this run's Sale would put a price on the sheet it never received.
  const bought: number[] = [];
  const sold: number[] = [];
  let boughtBackCount = 0;
  let diedCount = 0;

  for (const one of costs.animals) {
    if (one.intake && ownedThenBy(one.id, one.intake.arrivedAt) === ventureId) {
      bought.push(one.intake.purchasePriceBdt);
    }
    if (one.sale && ownedThenBy(one.id, one.sale.soldAt) === ventureId) {
      sold.push(one.sale.priceBdt);
    }
    const exit = exitOf(one);
    if (
      exit &&
      (one.state === "died" || one.state === "culled") &&
      ownedThenBy(one.id, exit.at) === ventureId
    ) {
      diedCount += 1;
    }
  }
  for (const one of internal) {
    // Taken on from another purse: bought with this Venture's money as surely as one off a lorry, and
    // the Settlement's own "bought" line counts it, so the story must too.
    if (one.toVentureId === ventureId && byId.has(one.animalId)) {
      bought.push(one.priceBdt);
    }
    // Let go to the Farm, which is the wind-up buy-back: it takes every Animal still standing at one
    // rate on one day, and it is not a Sale.
    if (one.fromVentureId === ventureId && one.toVentureId === null) {
      boughtBackCount += 1;
    }
  }
  return {
    boughtCount: bought.length,
    averageBoughtBdt: meanTaka(bought),
    soldCount: sold.length,
    averageSoldBdt: meanTaka(sold),
    boughtBackCount,
    diedCount,
  };
};
