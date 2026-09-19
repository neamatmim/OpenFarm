import type { Database } from "@OpenFarm/db";
import { roundTaka } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";
import { farmCosts } from "./cost-store";
import type { ChargeWord } from "./settlement-store";
import { whatItWasCharged } from "./settlement-store";
import {
  budgetsOf,
  heldByEach,
  ownedThenByOf,
  signedForEach,
} from "./venture-store";

/** The terms one Agreement froze at signing: what he agreed to, which is not what the Venture says today. */
export interface HisAgreement {
  id: string;
  units: number;
  investorsPercent: number;
  targetWindowStart: string;
  targetWindowEnd: string;
  arbitrator: string;
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
  agreementId: string
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
  const capital: HisCapital[] = moved.map((one) => ({
    kind: one.kind === "refund" ? "returned" : "received",
    amountBdt: Number(one.amountBdt),
    movedOn: one.movedOn,
    reference: one.reference,
  }));
  return {
    venture: {
      id: venture.id,
      name: venture.name,
      unitPriceBdt: Number(venture.unitPriceBdt),
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
      investorsPercent: agreement.investorsPercent,
      targetWindowStart: agreement.targetWindowStart,
      targetWindowEnd: agreement.targetWindowEnd,
      arbitrator: agreement.arbitrator,
      stampValueBdt: Number(agreement.stampValueBdt),
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
  venture: { id: string; targetCapitalBdt: string; cattleBudgetBdt: string }
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
    cattleBudgetLeftBdt: budgets.cattleBudgetHeldBdt,
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
