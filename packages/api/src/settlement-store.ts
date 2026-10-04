import type { Database } from "@OpenFarm/db";
import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq } from "@OpenFarm/db/operators";
import { venture as ventureTable } from "@OpenFarm/db/schema/venture";
import {
  ventureMovement,
  ventureSettlement,
  ventureSettlementShare,
} from "@OpenFarm/db/schema/venture-account";
import type { Split } from "@OpenFarm/domain";
import {
  farmDayOf,
  monthsFromTo,
  payoutOf,
  roundMoney,
  splitOfProfit,
  unitsAltogether,
  unitsHeld,
  whatUnitsTake,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { SnapshotValue, Trail, Tx } from "./audit";
import type { BankStanding } from "./bank-standing";
import { NEVER_CHECKED } from "./bank-standing";
import { heldSalesOf } from "./cash-store";
import type { CarriedLine, FarmCosts } from "./cost-store";
import { chargedTo, farmCosts, owedByMonth } from "./cost-store";
import { adjustmentsOf } from "./settlement-adjustment-store";
import {
  balanceOf,
  bankStandingOf,
  heldByEach,
  NOTHING_HELD,
  ownedThenByOf,
  stillHersOf,
  termsInForceOn,
} from "./venture-store";

type Db = Pick<Database, "query" | "execute">;

/** What each charge against a run is called. */
export const CHARGE_WORDS = [
  "bought",
  "market_toll",
  "trips",
  "feed",
  "medicine",
  "vet",
  "herd",
] as const;

/**
 * The charges a Settlement froze, read back.
 *
 * A jsonb column comes out as `unknown`, and a screen cannot label a line it cannot name — so a line
 * whose word the farm no longer knows is dropped rather than handed on to be rendered as a blank label.
 */
const chargesAsWritten = (
  written: unknown
): { word: ChargeWord; amount: number }[] =>
  (Array.isArray(written) ? written : []).flatMap((one) =>
    typeof one === "object" &&
    one !== null &&
    CHARGE_WORDS.includes((one as { word: string }).word as ChargeWord)
      ? [one as { word: ChargeWord; amount: number }]
      : []
  );

export type ChargeWord = (typeof CHARGE_WORDS)[number];

/**
 * Something that makes a Settlement a guess rather than a sum, with the word the reader has for it.
 *
 * Data and not an error, because the Owner needs the figures and the reasons she may not act on them at
 * the same time: told only "refused", she has nothing to go and put right.
 */
export type Block =
  /** Nobody has signed for it, so there is nobody to settle with. */
  | { word: "nobody_has_signed" }
  | { word: "agreements_disagree"; percents: number[] }
  | { word: "an_animal_still_stands"; tagNumbers: string[] }
  | { word: "a_price_is_missing"; unpricedKg: number; uncostedDoses: number }
  | { word: "a_float_is_open"; openFloatMoney: number }
  /** A Venture's animals sold for cash whose price is still in the hand that took it, not yet deposited. */
  | { word: "sale_cash_in_a_hand"; tagNumbers: string[]; hands: string[] }
  | {
      word: "a_reimbursement_is_owed";
      /** The months never repaid. */
      months: string[];
      /** What months already repaid have moved by since, for the next Reimbursement to carry; less where negative. */
      carryMoney: number;
    }
  /** The account would hold a taka or more once everybody is paid (over), or be that much short of paying them
   *  (under, negative): not rounding, but money the Owner has to go and find before anybody is paid. */
  | { word: "the_account_does_not_add_up"; overMoney: number }
  | {
      word: "the_bank_disagrees";
      /** The statement disagreed and nobody has explained it. */
      disagreed: string[];
      /** The farm has since changed its mind about what the month ended on. */
      stale: string[];
      /** Nobody ever opened the statement for it. */
      neverRead: string[];
    };

/**
 * A rounding difference is smaller than a taka.
 *
 * A month's Reimbursement is the sum of five parts each already rounded, because five lines that do not
 * add up to the figure beneath them is the farm arguing with itself in front of an Investor. A Settlement
 * adds the raw shares over the whole run and rounds once. Round-then-sum and sum-then-round are not the
 * same, and over a run of months they drift by paisa.
 *
 * So paisa are swept and taka are not. Anything larger than this is not rounding — it is a real
 * disagreement between what the run was charged and what actually left the account, and the Farm
 * quietly absorbing it would be the farm hiding its own mistake.
 */
const A_ROUNDING_MONEY = 1;

/** The blocks under which the Settlement's own sum is not yet known, so an account that does not match it says nothing. */
const A_GUESS_BEFORE_THE_SUM: ReadonlySet<Block["word"]> = new Set([
  "nobody_has_signed",
  "agreements_disagree",
  "an_animal_still_stands",
  "a_price_is_missing",
  "a_float_is_open",
  "sale_cash_in_a_hand",
]);

/**
 * The split with the account's own remainder folded into it: the paisa joins the taka the flooring
 * already left over, and both go to the Farm on the one line that has always said so.
 *
 * Left alone when the remainder is a taka or more. That is not rounding, and a Settlement that quietly
 * moved it would be hiding something the Owner needs to go and find.
 */
export const sweptUp = (
  split: Pick<Split, "roundingMoney" | "farmMoney">,
  overMoney: number
): Pick<Split, "roundingMoney" | "farmMoney"> => {
  const isRounding = Math.abs(overMoney) < A_ROUNDING_MONEY;
  return {
    roundingMoney: isRounding
      ? roundMoney(split.roundingMoney + overMoney)
      : split.roundingMoney,
    farmMoney: isRounding
      ? roundMoney(split.farmMoney + overMoney)
      : split.farmMoney,
  };
};

/** Added up. */
const sumOf = (figures: readonly number[]) => {
  let total = 0;
  for (const one of figures) {
    total += one;
  }
  return total;
};

/** What a Settlement is worked out from, for the reasons it cannot yet be acted on. */
interface Grounds {
  agreements: readonly { investorsPercent: number }[];
  charged: { unpricedKg: number; uncostedDoses: number };
  costs: Awaited<ReturnType<typeof farmCosts>>;
  held: { openFloatMoney: number } | undefined;
  ownedThenBy: (animalId: string, at: Date) => string | null;
  paidIn: readonly {
    kind: string;
    forMonth: string | null;
    amountMoney: number;
    carried: readonly CarriedLine[] | null;
  }[];
  standing: readonly { tagNumber: string }[];
  today: string;
  venture: { id: string; createdAt: Date };
  withTheBank: BankStanding;
}

/**
 * Every month a Venture ran, up to and including the month it is being settled in. A month still running cannot be
 * reimbursed — `reimburse` refuses one that is not over — and that is the point: what its animals have eaten this
 * month is money the account still has to part with, so a Settlement that passed it by would promise the Investors
 * more than there is. Read on the farm's own clock, because a Venture opened at midnight in Dhaka is opened the day
 * before in UTC.
 */
const monthsRan = (venture: { createdAt: Date }, today: string) =>
  monthsFromTo(farmDayOf(venture.createdAt).slice(0, 7), today.slice(0, 7));

type OwedGrounds = Pick<
  Grounds,
  "costs" | "ownedThenBy" | "paidIn" | "today" | "venture"
>;

/**
 * What a Venture still owes the Farm: the months it ran that were never repaid (and came to something), what months
 * already repaid have moved by since and the next Reimbursement is to carry, and the two together — money the
 * account holds that is the Farm's, said so on its own block, and so not money nobody can explain.
 */
const owedOf = ({
  costs,
  ownedThenBy,
  paidIn,
  today,
  venture,
}: OwedGrounds) => {
  const months = owedByMonth(
    costs,
    ownedThenBy,
    venture.id,
    monthsRan(venture, today),
    paidIn.filter((one) => one.kind === "reimbursement")
  );
  return {
    neverRepaid: months
      .filter((one) => !one.repaid && one.comesToMoney !== 0)
      .map((one) => one.month),
    carryMoney: roundMoney(
      sumOf(months.filter((one) => one.repaid).map((one) => one.stillOwedMoney))
    ),
    totalMoney: roundMoney(sumOf(months.map((one) => one.stillOwedMoney))),
  };
};

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
  // Asked first, because every other question here passes for a Venture nothing has happened to: one
  // that has bought nothing has no Animal standing, no Float open, no month owed and no price missing.
  // So a Venture opened this morning settles for nothing at all, reaches Settled, and is then frozen
  // against signing anybody, taking a taka or being called off — dead on the day it was opened.
  //
  // Asked of the Agreements and not of the state, because a run can end badly: one whose animals all
  // died never reaches Selling, and what is left of its Running Budget is still its Investors' to be
  // given back.
  if (agreements.length === 0) {
    blocks.push({ word: "nobody_has_signed" });
  }
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
  const openFloatMoney = roundMoney(held?.openFloatMoney ?? 0);
  if (openFloatMoney !== 0) {
    blocks.push({ word: "a_float_is_open", openFloatMoney });
  }
  const ran = monthsRan(venture, today);
  const owed = owedOf({ costs, ownedThenBy, paidIn, today, venture });
  if (owed.neverRepaid.length !== 0 || owed.carryMoney !== 0) {
    blocks.push({
      word: "a_reimbursement_is_owed",
      months: owed.neverRepaid,
      carryMoney: owed.carryMoney,
    });
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

/**
 * What each of these Investors is called, by id.
 *
 * The one or two who signed, never every Investor the farm has ever had — and always named, because a
 * screen showing who has been paid and who has not cannot show a uuid at somebody the Owner is about to
 * telephone.
 */
const namesOf = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  theirs: readonly { investorId: string }[]
) => {
  if (theirs.length === 0) {
    return new Map<string, string>();
  }
  const people = await tx.query.investor.findMany({
    where: { farmId, id: { in: theirs.map((one) => one.investorId) } },
    columns: { id: true, name: true },
  });
  return new Map(people.map((one) => [one.id, one.name]));
};

/** What one Investor is owed: their capital back, and what their Units took of the profit. */
export interface Payout {
  /** The paper it is owed under, so an approved share can be traced back to what was signed. */
  agreementId: string;
  investorId: string;
  name: string;
  units: number;
  capitalMoney: number;
  /** What their Units took of the profit, or lost of it. */
  shareMoney: number;
  payoutMoney: number;
}

/**
 * What a Venture's run has been charged, as its own lines.
 *
 * Named rather than numbered, and named in one place: a screen that has to know what "trips" is called
 * should fail to compile when a line is added, not print an empty label. Shared with the progress
 * statement, so what an Investor is shown while the run goes on adds up the same way as what he is shown
 * when it ends — the same seven words, off the same costing, never a second sum.
 */
export const whatItWasCharged = (
  costs: FarmCosts,
  ownedThenBy: (animalId: string, at: Date) => string | null,
  ventureId: string,
  /** Its own money movements, for what it paid another purse to take an Animal on. */
  paidIn: readonly { kind: string; amountMoney: number }[]
) => {
  const charged = chargedTo(costs, ownedThenBy, ventureId);
  // What it paid to take its Animals on: their price at the livestock market where its own Float bought them, and
  // what it paid another purse for one bought in.
  const purchaseMoney = roundMoney(
    sumOf(
      costs.animals.map((one) =>
        one.intake && ownedThenBy(one.id, one.intake.arrivedAt) === ventureId
          ? one.intake.purchasePriceMoney
          : 0
      )
    ) +
      sumOf(
        paidIn
          .filter((one) => one.kind === "internal_buy")
          .map((one) => one.amountMoney)
      )
  );
  const charges: { word: ChargeWord; amount: number }[] = [
    { word: "bought", amount: purchaseMoney },
    { word: "market_toll", amount: charged.marketTollMoney },
    { word: "trips", amount: charged.tripMoney },
    { word: "feed", amount: charged.feedMoney },
    { word: "medicine", amount: charged.medicineMoney },
    { word: "vet", amount: charged.vetMoney },
    { word: "herd", amount: charged.herdMoney },
  ];
  // The narrowed shares come back with the lines: a Settlement reads them again for the unpriced feed
  // and the uncosted doses that make it a guess, and summing them twice would be summing them twice.
  return { charged, charges };
};

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
  venture: { id: string; createdAt: Date; unitPriceMoney: number },
  today: string
) => {
  // Approval works this out inside a transaction. Its PostgreSQL client may only execute one query at a time.
  const costs = await farmCosts(db, farmId);
  const ownedThenBy = await ownedThenByOf(db, farmId);
  const held = await heldByEach(db, farmId, [venture.id]);
  const bank = await bankStandingOf(db, farmId, [venture.id]);
  const standing = await stillHersOf(db, farmId, venture.id);
  const what = held.get(venture.id);
  const signed = await db.query.investmentAgreement.findMany({
    where: { farmId, ventureId: venture.id },
    orderBy: { createdAt: "asc", id: "asc" },
  });
  const paidIn = await db.query.ventureMovement.findMany({
    where: { farmId, ventureId: venture.id },
    columns: {
      kind: true,
      agreementId: true,
      forMonth: true,
      amountMoney: true,
      carried: true,
    },
  });
  // The split a Venture divides on is the one in force today, not the one on the original paper. An
  // amendment moves what everybody agreed to, and a Settlement that read past it would pay a man one
  // share while his যোগদানপত্র promised him another. Everything else — his Units, his Investor, his
  // stamp — is what he signed, and never moves.
  const agreements = [];
  for (const one of signed) {
    // A transaction has one PostgreSQL client, so its reads must not overlap.
    // oxlint-disable-next-line no-await-in-loop
    const terms = await termsInForceOn(db, farmId, one.id, today);
    agreements.push(
      terms ? { ...one, investorsPercent: terms.investorsPercent } : one
    );
  }
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
  const proceedsMoney = roundMoney(what?.proceedsMoney ?? 0);
  const { charged, charges } = whatItWasCharged(
    costs,
    ownedThenBy,
    venture.id,
    paidIn
  );
  // The sum of the lines as they are shown, not of the figures behind them: lines that do not add up to
  // the total beneath them is the farm arguing with itself in front of an Investor.
  const chargedMoney = roundMoney(sumOf(charges.map((one) => one.amount)));
  const profitMoney = roundMoney(proceedsMoney - chargedMoney);

  // ---- how it divides ----
  const capitalOf = (agreementId: string) =>
    roundMoney(
      sumOf(
        paidIn
          .filter(
            (one) =>
              one.kind === "capital_in" && one.agreementId === agreementId
          )
          .map((one) => one.amountMoney)
      )
    );
  // By the Units each Agreement holds — what it paid in, over the Unit price — not the Units it signed for: a Venture
  // may start buying while one is part paid, and money nobody put in must take no share of what was made or lost.
  const holdings = agreements.map((one) => {
    const capitalMoney = capitalOf(one.id);
    return {
      ...one,
      capitalMoney,
      units: unitsHeld(capitalMoney, venture.unitPriceMoney),
    };
  });
  const eachHolds = holdings.map((one) => one.units);
  const units = unitsAltogether(eachHolds);
  const [first] = agreements;
  const investorsPercent = first?.investorsPercent ?? 0;
  const split = splitOfProfit({
    profitMoney,
    investorsPercent,
    units,
    held: eachHolds,
  });
  const payouts: Payout[] = holdings.map((one) => ({
    agreementId: one.id,
    investorId: one.investorId,
    name: named.get(one.investorId) ?? "",
    units: one.units,
    capitalMoney: one.capitalMoney,
    shareMoney: whatUnitsTake(split.perUnitMoney, one.units),
    payoutMoney: payoutOf(one.capitalMoney, one.units, split.perUnitMoney),
  }));

  // What the account would still be holding once the Owner's own money and every payout had left it. It
  // is the paisa the two roundings differ by, and it goes where the other remainder already goes: to the
  // Farm, on its own line, so that a settled account reads nothing.
  const advanceMoney = roundMoney(what?.advancedMoney ?? 0);
  const balanceMoney = roundMoney(balanceOf(what ?? NOTHING_HELD));
  const overMoney = roundMoney(
    balanceMoney -
      advanceMoney -
      sumOf(payouts.map((one) => one.payoutMoney)) -
      split.farmMoney
  );
  const swept = sweptUp(split, overMoney);

  const blocks: Block[] = whatBlocksIt({
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
  // A Sale's price taken in cash and still in the hand that took it: the account has not got it, so what the Investors
  // are paid out of is short of what their animals fetched until it is deposited.
  const heldSales = await heldSalesOf(db as Tx, farmId, {
    ventureId: venture.id,
  });
  if (heldSales.length > 0) {
    const holders = await db.query.user.findMany({
      where: { id: { in: [...new Set(heldSales.map((one) => one.heldBy))] } },
      columns: { name: true },
    });
    blocks.push({
      word: "sale_cash_in_a_hand",
      tagNumbers: heldSales.map((one) => one.tagNumber),
      hands: holders.map((one) => one.name),
    });
  }
  // Asked once the figures can be trusted at all: with an Animal standing, a price missing or a Float out, what the
  // account "should" hold is itself a guess, and those blocks already say why.
  const theSumIsAGuess = blocks.some((one) =>
    A_GUESS_BEFORE_THE_SUM.has(one.word)
  );
  // What the account holds for months still owed is the Farm's, and its own block says so.
  const unexplainedMoney = roundMoney(
    overMoney -
      owedOf({ costs, ownedThenBy, paidIn, today, venture }).totalMoney
  );
  if (!theSumIsAGuess && Math.abs(unexplainedMoney) >= A_ROUNDING_MONEY) {
    blocks.push({
      word: "the_account_does_not_add_up",
      overMoney: unexplainedMoney,
    });
  }

  return {
    blocks,
    proceedsMoney,
    charges,
    chargedMoney,
    profitMoney,
    investorsPercent,
    units,
    ...split,
    ...swept,
    /** Repaid at cost out of the Venture's cash before any capital returns, even where the run lost
     *  money: the Owner's own taka went in to feed their animals, and it is not a charge — what it paid
     *  for is already among the charges. */
    advanceMoney,
    capitalMoney: roundMoney(
      (what?.capitalInMoney ?? 0) - (what?.refundedMoney ?? 0)
    ),
    /** What the account holds, which is what everything above has to add up to. */
    balanceMoney,
    payouts,
  };
};

/**
 * The Settlement written down as it stood, and one row for each Investor it owes.
 *
 * The whole point of approving is that the figures stop moving: a late cost or a Correction after this
 * changes what the costing says and changes nothing here, because what an Investor is shown a year later
 * has to be what he was shown on the day.
 */
export const approveSettlement = async (
  tx: Tx,
  farmId: string,
  ventureId: string,
  worked: Awaited<ReturnType<typeof settlementOf>>,
  by: { actorId: string; now: Date }
) => {
  // Asked first: once approved, a cost landing afterwards moves the costing and leaves the account not adding up —
  // a Settlement Adjustment's business, not a second approval's.
  const already = await tx.query.ventureSettlement.findFirst({
    where: { farmId, ventureId },
    columns: { id: true },
  });
  if (already) {
    throw new ORPCError("BAD_REQUEST", {
      message: "This Venture's Settlement has already been approved",
      data: { refusal: "already_approved" },
    });
  }
  if (worked.blocks.length !== 0) {
    throw new ORPCError("BAD_REQUEST", {
      message: "This Settlement is not settled enough to approve",
      data: { refusal: worked.blocks[0]?.word ?? "nothing_to_settle" },
    });
  }
  const id = uuidv7(by.now);
  await tx.insert(ventureSettlement).values({
    id,
    farmId,
    ventureId,
    proceedsMoney: worked.proceedsMoney,
    chargedMoney: worked.chargedMoney,
    charges: worked.charges,
    profitMoney: worked.profitMoney,
    investorsPercent: worked.investorsPercent,
    units: worked.units,
    investorsMoney: worked.investorsMoney,
    perUnitMoney: worked.perUnitMoney,
    roundingMoney: worked.roundingMoney,
    farmMoney: worked.farmMoney,
    advanceMoney: worked.advanceMoney,
    capitalMoney: worked.capitalMoney,
    balanceMoney: worked.balanceMoney,
    approvedBy: by.actorId,
    approvedAt: by.now,
  });
  for (const one of worked.payouts) {
    // oxlint-disable-next-line no-await-in-loop -- one transaction, one Investor at a time
    await tx.insert(ventureSettlementShare).values({
      id: uuidv7(by.now),
      farmId,
      settlementId: id,
      agreementId: one.agreementId,
      investorId: one.investorId,
      units: one.units,
      capitalMoney: one.capitalMoney,
      shareMoney: one.shareMoney,
      payoutMoney: one.payoutMoney,
      createdAt: by.now,
    });
  }
  return id;
};

/** A Venture's approved Settlement and what it owes each Investor, or nothing if nobody has approved. */
export const approvedSettlementOf = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  ventureId: string
) => {
  const row = await tx.query.ventureSettlement.findFirst({
    where: { farmId, ventureId },
  });
  if (!row) {
    return null;
  }
  const shares = await tx.query.ventureSettlementShare.findMany({
    where: { farmId, settlementId: row.id },
    orderBy: { createdAt: "asc", id: "asc" },
  });
  return { row, shares };
};

/**
 * Whether everything the Settlement owed has gone out: every Investor paid, and the Owner's own money
 * back. What moves a Venture to Settled, as a fact rather than a chore.
 */
export const nothingLeftToPay = (
  settlement: {
    advanceMoney: number;
    advanceRepaidId: string | null;
    farmMoney: number;
    farmSharePaidId: string | null;
  },
  shares: readonly { paidMovementId: string | null }[]
) =>
  shares.every((one) => one.paidMovementId !== null) &&
  (settlement.advanceMoney === 0 || settlement.advanceRepaidId !== null) &&
  (settlement.farmMoney === 0 || settlement.farmSharePaidId !== null);

/**
 * An approved Settlement as the trail and the screen read it: the figures as they stood, and each
 * Investor's share with whether it has gone out and whether he has said he had it.
 */
export const readSettlement = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  ventureId: string
) => {
  const approved = await approvedSettlementOf(tx, farmId, ventureId);
  if (!approved) {
    return null;
  }
  const { row, shares } = approved;
  const nameOf = await namesOf(tx, farmId, shares);
  return {
    approvedAt: row.approvedAt,
    proceedsMoney: row.proceedsMoney,
    chargedMoney: row.chargedMoney,
    charges: chargesAsWritten(row.charges),
    profitMoney: row.profitMoney,
    investorsPercent: row.investorsPercent,
    units: row.units,
    investorsMoney: row.investorsMoney,
    perUnitMoney: row.perUnitMoney,
    roundingMoney: row.roundingMoney,
    farmMoney: row.farmMoney,
    advanceMoney: row.advanceMoney,
    advanceRepaid: row.advanceRepaidId !== null,
    farmSharePaid: row.farmSharePaidId !== null,
    capitalMoney: row.capitalMoney,
    balanceMoney: row.balanceMoney,
    shares: shares.map((one) => ({
      agreementId: one.agreementId,
      investorId: one.investorId,
      name: nameOf.get(one.investorId) ?? "",
      units: one.units,
      capitalMoney: one.capitalMoney,
      shareMoney: one.shareMoney,
      payoutMoney: one.payoutMoney,
      paid: one.paidMovementId !== null,
      /** The Venture Movement his money went out on, for whoever has to print the reference it went
       *  on — a payout movement carries the Venture and not the Agreement, so this is the only way
       *  back to it. */
      paidMovementId: one.paidMovementId,
      acknowledgedAt: one.acknowledgedAt,
      acknowledgedNote: one.acknowledgedNote,
    })),
    /** Whether everything it owed has gone out, which is what makes the Venture Settled. */
    allPaid: nothingLeftToPay(row, shares),
    /** What has landed late since, and what was done about each of them. */
    adjustments: await adjustmentsOf(tx, farmId, row.id),
  };
};

/** The Venture reaching Settled once the last of it has gone out. */
export const reachesSettledOnLastPayout = async (
  tx: Tx,
  farmId: string,
  ventureId: string,
  trail: Trail,
  read: (tx: Tx) => Promise<SnapshotValue>
) => {
  const approved = await approvedSettlementOf(tx, farmId, ventureId);
  if (!approved || !nothingLeftToPay(approved.row, approved.shares)) {
    return;
  }
  const before = await read(tx);
  await tx
    .update(ventureTable)
    .set({ state: "settled" })
    .where(
      and(eq(ventureTable.id, ventureId), eq(ventureTable.farmId, farmId))
    );
  await trail(
    tx,
    { entity: "venture", entityId: ventureId, action: "update" },
    { before, after: await read(tx) }
  );
};

/** One payment out of a Venture Account against an approved Settlement — or the one payment in, the Farm's
 *  share of a loss. */
export const payOut = async (
  tx: Tx,
  farmId: string,
  what: {
    ventureId: string;
    kind: "payout" | "advance_repaid" | "farm_share" | "farm_loss_in";
    amountMoney: number;
    movedOn: string;
    reference: string;
  },
  by: { actorId: string; now: Date }
) => {
  const id = uuidv7(by.now);
  await tx.insert(ventureMovement).values({
    id,
    farmId,
    ventureId: what.ventureId,
    kind: what.kind,
    amountMoney: what.amountMoney,
    movedOn: what.movedOn,
    reference: what.reference,
    recordedBy: by.actorId,
    createdAt: by.now,
  });
  return id;
};
