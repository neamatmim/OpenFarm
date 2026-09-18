import type { Database } from "@OpenFarm/db";
import {
  farmDayOf,
  monthOf,
  monthsFromTo,
  payoutOf,
  roundTaka,
  splitOfProfit,
  startOfFarmDay,
} from "@OpenFarm/domain";

import { chargedTo, consumedBy, farmCosts } from "./cost-store";
import type { BankStanding } from "./venture-store";
import {
  balanceOf,
  bankStandingOf,
  heldByEach,
  NEVER_CHECKED,
  ownedThenByOf,
  stillHersOf,
} from "./venture-store";

type Db = Pick<Database, "query" | "execute">;

/**
 * Something that makes a Settlement a guess rather than a sum, with the word the reader has for it.
 *
 * Data and not an error, because the Owner needs the figures and the reasons she may not act on them at
 * the same time: told only "refused", she has nothing to go and put right.
 */
export type Block =
  | { word: "agreements_disagree"; percents: number[] }
  | { word: "an_animal_still_stands"; tagNumbers: string[] }
  | { word: "a_price_is_missing"; unpricedKg: number; uncostedDoses: number }
  | { word: "a_float_is_open"; openFloatBdt: number }
  | { word: "a_reimbursement_is_owed"; months: string[] }
  | {
      word: "the_bank_disagrees";
      /** The statement disagreed and nobody has explained it. */
      disagreed: string[];
      /** The farm has since changed its mind about what the month ended on. */
      stale: string[];
      /** Nobody ever opened the statement for it. */
      neverRead: string[];
    };

const NOTHING_HELD = {
  openFloatBdt: 0,
  capitalInBdt: 0,
  proceedsBdt: 0,
  advancedBdt: 0,
  refundedBdt: 0,
  spentBdt: 0,
  paidOutBdt: 0,
  cattleOutBdt: 0,
};

/** Added up. */
const sumOf = (figures: readonly number[]) => {
  let total = 0;
  for (const one of figures) {
    total += one;
  }
  return total;
};

/** Which of the months a Venture ran for it still owes the Farm for. */
const monthsOwed = (
  costs: Awaited<ReturnType<typeof farmCosts>>,
  ownedThenBy: (animalId: string, at: Date) => string | null,
  ventureId: string,
  months: readonly string[],
  alreadyPaid: ReadonlySet<string>
): string[] =>
  months.filter((month) => {
    if (alreadyPaid.has(month)) {
      return false;
    }
    // A month its animals ate nothing in is owed nothing for, and `reimburse` would refuse it anyway.
    return (
      consumedBy(
        costs,
        ownedThenBy,
        ventureId,
        monthOf(startOfFarmDay(`${month}-01`))
      ).totalBdt !== 0
    );
  });

/** What a Settlement is worked out from, for the reasons it cannot yet be acted on. */
interface Grounds {
  agreements: readonly { investorsPercent: number }[];
  charged: { unpricedKg: number; uncostedDoses: number };
  costs: Awaited<ReturnType<typeof farmCosts>>;
  held: { openFloatBdt: number } | undefined;
  ownedThenBy: (animalId: string, at: Date) => string | null;
  paidIn: readonly { kind: string; forMonth: string | null }[];
  standing: readonly { tagNumber: string }[];
  today: string;
  venture: { id: string; createdAt: Date };
  withTheBank: BankStanding;
}

/**
 * Everything that makes a Settlement a guess rather than a sum, each with the word the reader has.
 *
 * Five in the spec's words — an Animal still standing, a price missing, a Buying Float unreconciled, a
 * Reimbursement owed, the bank disagreeing — and one more the paper can raise: two Agreements of one
 * Venture signed on different splits, which the farm cannot divide its way out of.
 */
const whatBlocksIt = ({
  agreements,
  charged,
  costs,
  held,
  ownedThenBy,
  paidIn,
  standing,
  today,
  venture,
  withTheBank,
}: Grounds): Block[] => {
  const blocks: Block[] = [];
  // Every Agreement of one Venture is signed on the same split. Two that disagree is a paper problem
  // the farm cannot divide its way out of, so it says so rather than picking one.
  const percents = new Set(agreements.map((one) => one.investorsPercent));
  if (percents.size > 1) {
    blocks.push({ word: "agreements_disagree", percents: [...percents] });
  }
  if (standing.length !== 0) {
    blocks.push({
      word: "an_animal_still_stands",
      tagNumbers: standing.map((one) => one.tagNumber),
    });
  }
  if (charged.unpricedKg !== 0 || charged.uncostedDoses !== 0) {
    // Figures, not a sentence: how much and how many, for the screen to say in the reader's language
    // and the reader's own numerals.
    blocks.push({
      word: "a_price_is_missing",
      unpricedKg: charged.unpricedKg,
      uncostedDoses: charged.uncostedDoses,
    });
  }
  const openFloatBdt = roundTaka(held?.openFloatBdt ?? 0);
  if (openFloatBdt !== 0) {
    blocks.push({ word: "a_float_is_open", openFloatBdt });
  }
  // Every month it ran, up to and including the month it is being settled in. A month still running
  // cannot be reimbursed — `reimburse` refuses one that is not over — and that is the point: what its
  // animals have eaten this month is money the account still has to part with, so a Settlement that
  // passed it by would promise the Investors more than there is. Read on the farm's own clock, because a
  // Venture opened at midnight in Dhaka is opened the day before in UTC.
  const ran = monthsFromTo(
    farmDayOf(venture.createdAt).slice(0, 7),
    today.slice(0, 7)
  );
  const owed = monthsOwed(
    costs,
    ownedThenBy,
    venture.id,
    ran,
    new Set(
      paidIn
        .filter((one) => one.kind === "reimbursement")
        .map((one) => one.forMonth ?? "")
    )
  );
  if (owed.length !== 0) {
    blocks.push({ word: "a_reimbursement_is_owed", months: owed });
  }
  // A month nobody ever read is as much of a gap as one that disagreed: agreeing with a statement nobody
  // opened is not agreeing, and there is no Bank Check row to go stale.
  // Only a month that is over can be read against a statement, so the month being settled in is not
  // one the bank is asked about.
  const readable = ran.filter((month) => month < today.slice(0, 7));
  const neverRead = readable.filter(
    (month) =>
      withTheBank.lastCheckedMonth === null ||
      month > withTheBank.lastCheckedMonth
  );
  // Told apart, because they are different problems: a stale month needs the statement read again, a
  // disagreeing one needs explaining, and one nobody opened needs opening.
  const stale = withTheBank.monthsStale;
  const disagreed = withTheBank.monthsOut.filter(
    (month) => !stale.includes(month)
  );
  if (disagreed.length + stale.length + neverRead.length !== 0) {
    blocks.push({ word: "the_bank_disagrees", disagreed, stale, neverRead });
  }
  return blocks;
};

/** What one Investor is owed: their capital back, and what their Units took of the profit. */
export interface Payout {
  investorId: string;
  name: string;
  units: number;
  capitalBdt: number;
  /** What their Units took of the profit, or lost of it. */
  shareBdt: number;
  payoutBdt: number;
}

/**
 * The close-out of a Venture, worked out and shown before anything is done.
 *
 * What its Animals fetched, everything the run was charged as its own line, the Owner's Advance repaid at
 * cost, capital returned whole, and the profit split by the percentages the Agreements froze. The charges
 * are the costing the farm already does, narrowed to the Animals that were this Venture's at the time —
 * never a second sum, because two answers to "what did this bull cost" is the argument a Settlement
 * exists to end.
 *
 * Blocked is not refused: the figures come back with the reasons they cannot be acted on, because an
 * Owner told only "no" has nothing to go and put right.
 */
export const settlementOf = async (
  db: Db,
  farmId: string,
  venture: { id: string; createdAt: Date },
  today: string
) => {
  const [costs, ownedThenBy, held, bank, standing] = await Promise.all([
    farmCosts(db, farmId),
    ownedThenByOf(db, farmId),
    heldByEach(db, farmId, [venture.id]),
    bankStandingOf(db, farmId, [venture.id]),
    stillHersOf(db, farmId, venture.id),
  ]);
  const what = held.get(venture.id);
  const [agreements, paidIn] = await Promise.all([
    db.query.investmentAgreement.findMany({
      where: { farmId, ventureId: venture.id },
      orderBy: { createdAt: "asc", id: "asc" },
    }),
    db.query.ventureMovement.findMany({
      where: { farmId, ventureId: venture.id },
      columns: {
        kind: true,
        agreementId: true,
        forMonth: true,
        amountBdt: true,
      },
    }),
  ]);
  // The one or two people who signed, not every Investor the farm has ever had.
  const people =
    agreements.length === 0
      ? []
      : await db.query.investor.findMany({
          where: {
            farmId,
            id: { in: agreements.map((one) => one.investorId) },
          },
          columns: { id: true, name: true },
        });
  const named = new Map(people.map((one) => [one.id, one.name]));

  // ---- what the run made ----
  const proceedsBdt = roundTaka(what?.proceedsBdt ?? 0);
  const charged = chargedTo(costs, ownedThenBy, venture.id);
  // What it paid to take its Animals on: their price at the haat where its own Float bought them, and
  // what it paid another purse for one bought in.
  const purchaseBdt = roundTaka(
    sumOf(
      costs.animals.map((one) =>
        one.intake && ownedThenBy(one.id, one.intake.arrivedAt) === venture.id
          ? Number(one.intake.purchasePriceBdt)
          : 0
      )
    ) +
      sumOf(
        paidIn
          .filter((one) => one.kind === "internal_buy")
          .map((one) => Number(one.amountBdt))
      )
  );
  const charges = [
    { word: "bought", bdt: purchaseBdt },
    { word: "hasil", bdt: charged.hasilBdt },
    { word: "trips", bdt: charged.tripBdt },
    { word: "feed", bdt: charged.feedBdt },
    { word: "medicine", bdt: charged.medicineBdt },
    { word: "vet", bdt: charged.vetBdt },
    { word: "herd", bdt: charged.herdBdt },
  ];
  // The sum of the lines as they are shown, not of the figures behind them: lines that do not add up to
  // the total beneath them is the farm arguing with itself in front of an Investor.
  const chargedBdt = roundTaka(sumOf(charges.map((one) => one.bdt)));
  const profitBdt = roundTaka(proceedsBdt - chargedBdt);

  // ---- how it divides ----
  const units = sumOf(agreements.map((one) => one.units));
  const [first] = agreements;
  const investorsPercent = first?.investorsPercent ?? 0;
  const split = splitOfProfit({ profitBdt, investorsPercent, units });
  const capitalOf = (agreementId: string) =>
    roundTaka(
      sumOf(
        paidIn
          .filter(
            (one) =>
              one.kind === "capital_in" && one.agreementId === agreementId
          )
          .map((one) => Number(one.amountBdt))
      )
    );
  const payouts: Payout[] = agreements.map((one) => {
    const capitalBdt = capitalOf(one.id);
    return {
      investorId: one.investorId,
      name: named.get(one.investorId) ?? "",
      units: one.units,
      capitalBdt,
      shareBdt: split.perUnitBdt * one.units,
      payoutBdt: payoutOf(capitalBdt, one.units, split.perUnitBdt),
    };
  });

  const blocks = whatBlocksIt({
    agreements,
    charged,
    costs,
    held: what,
    ownedThenBy,
    paidIn,
    standing,
    today,
    venture,
    withTheBank: bank.get(venture.id) ?? NEVER_CHECKED,
  });

  return {
    blocks,
    proceedsBdt,
    charges,
    chargedBdt,
    profitBdt,
    investorsPercent,
    units,
    ...split,
    /** Repaid at cost out of the Venture's cash before any capital returns, even where the run lost
     *  money: the Owner's own taka went in to feed their animals, and it is not a charge — what it paid
     *  for is already among the charges. */
    advanceBdt: roundTaka(what?.advancedBdt ?? 0),
    capitalBdt: roundTaka((what?.capitalInBdt ?? 0) - (what?.refundedBdt ?? 0)),
    /** What the account holds, which is what everything above has to add up to. */
    balanceBdt: roundTaka(balanceOf(what ?? NOTHING_HELD)),
    payouts,
  };
};
