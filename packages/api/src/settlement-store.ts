import type { Database } from "@OpenFarm/db";
import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq } from "@OpenFarm/db/operators";
import {
  venture as ventureTable,
  ventureMovement,
  ventureSettlement,
  ventureSettlementShare,
} from "@OpenFarm/db/schema/venture";
import type { Split } from "@OpenFarm/domain";
import {
  farmDayOf,
  monthOf,
  monthsFromTo,
  payoutOf,
  roundTaka,
  splitOfProfit,
  startOfFarmDay,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { SnapshotValue, Trail, Tx } from "./audit";
import type { FarmCosts } from "./cost-store";
import { chargedTo, consumedBy, farmCosts } from "./cost-store";
import { adjustmentsOf } from "./settlement-adjustment-store";
import type { BankStanding } from "./venture-store";
import {
  balanceOf,
  bankStandingOf,
  heldByEach,
  NEVER_CHECKED,
  NOTHING_HELD,
  ownedThenByOf,
  stillHersOf,
  termsInForceOn,
} from "./venture-store";

type Db = Pick<Database, "query" | "execute">;

/** What each charge against a run is called. */
export const CHARGE_WORDS = [
  "bought",
  "hasil",
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
): { word: ChargeWord; bdt: number }[] =>
  (Array.isArray(written) ? written : []).flatMap((one) =>
    typeof one === "object" &&
    one !== null &&
    CHARGE_WORDS.includes((one as { word: string }).word as ChargeWord)
      ? [one as { word: ChargeWord; bdt: number }]
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
const A_ROUNDING_BDT = 1;

/**
 * The split with the account's own remainder folded into it: the paisa joins the taka the flooring
 * already left over, and both go to the Farm on the one line that has always said so.
 *
 * Left alone when the remainder is a taka or more. That is not rounding, and a Settlement that quietly
 * moved it would be hiding something the Owner needs to go and find.
 */
export const sweptUp = (
  split: Pick<Split, "roundingBdt" | "farmBdt">,
  overBdt: number
): Pick<Split, "roundingBdt" | "farmBdt"> => {
  const isRounding = Math.abs(overBdt) < A_ROUNDING_BDT;
  return {
    roundingBdt: isRounding
      ? roundTaka(split.roundingBdt + overBdt)
      : split.roundingBdt,
    farmBdt: isRounding ? roundTaka(split.farmBdt + overBdt) : split.farmBdt,
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
  paidIn: readonly { kind: string; amountBdt: string }[]
) => {
  const charged = chargedTo(costs, ownedThenBy, ventureId);
  // What it paid to take its Animals on: their price at the haat where its own Float bought them, and
  // what it paid another purse for one bought in.
  const purchaseBdt = roundTaka(
    sumOf(
      costs.animals.map((one) =>
        one.intake && ownedThenBy(one.id, one.intake.arrivedAt) === ventureId
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
  const charges: { word: ChargeWord; bdt: number }[] = [
    { word: "bought", bdt: purchaseBdt },
    { word: "hasil", bdt: charged.hasilBdt },
    { word: "trips", bdt: charged.tripBdt },
    { word: "feed", bdt: charged.feedBdt },
    { word: "medicine", bdt: charged.medicineBdt },
    { word: "vet", bdt: charged.vetBdt },
    { word: "herd", bdt: charged.herdBdt },
  ];
  // The narrowed shares come back with the lines: a Settlement reads them again for the unpriced feed
  // and the uncosted doses that make it a guess, and summing them twice would be summing them twice.
  return { charged, charges };
};

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
  const [signed, paidIn] = await Promise.all([
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
  // The split a Venture divides on is the one in force today, not the one on the original paper. An
  // amendment moves what everybody agreed to, and a Settlement that read past it would pay a man one
  // share while his যোগদানপত্র promised him another. Everything else — his Units, his Investor, his
  // stamp — is what he signed, and never moves.
  const agreements = await Promise.all(
    signed.map(async (one) => {
      const terms = await termsInForceOn(db, farmId, one.id, today);
      return terms ? { ...one, investorsPercent: terms.investorsPercent } : one;
    })
  );
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
  const { charged, charges } = whatItWasCharged(
    costs,
    ownedThenBy,
    venture.id,
    paidIn
  );
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
      agreementId: one.id,
      investorId: one.investorId,
      name: named.get(one.investorId) ?? "",
      units: one.units,
      capitalBdt,
      shareBdt: split.perUnitBdt * one.units,
      payoutBdt: payoutOf(capitalBdt, one.units, split.perUnitBdt),
    };
  });

  // What the account would still be holding once the Owner's own money and every payout had left it. It
  // is the paisa the two roundings differ by, and it goes where the other remainder already goes: to the
  // Farm, on its own line, so that a settled account reads nothing.
  const advanceBdt = roundTaka(what?.advancedBdt ?? 0);
  const balanceBdt = roundTaka(balanceOf(what ?? NOTHING_HELD));
  const overBdt = roundTaka(
    balanceBdt -
      advanceBdt -
      sumOf(payouts.map((one) => one.payoutBdt)) -
      split.farmBdt
  );
  const swept = sweptUp(split, overBdt);

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
    ...swept,
    /** Repaid at cost out of the Venture's cash before any capital returns, even where the run lost
     *  money: the Owner's own taka went in to feed their animals, and it is not a charge — what it paid
     *  for is already among the charges. */
    advanceBdt,
    capitalBdt: roundTaka((what?.capitalInBdt ?? 0) - (what?.refundedBdt ?? 0)),
    /** What the account holds, which is what everything above has to add up to. */
    balanceBdt,
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
  if (worked.blocks.length !== 0) {
    throw new ORPCError("BAD_REQUEST", {
      message: "This Settlement is not settled enough to approve",
      data: { refusal: worked.blocks[0]?.word ?? "nothing_to_settle" },
    });
  }
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
  const id = uuidv7(by.now);
  await tx.insert(ventureSettlement).values({
    id,
    farmId,
    ventureId,
    proceedsBdt: worked.proceedsBdt,
    chargedBdt: worked.chargedBdt,
    charges: worked.charges,
    profitBdt: worked.profitBdt,
    investorsPercent: worked.investorsPercent,
    units: worked.units,
    investorsBdt: worked.investorsBdt,
    perUnitBdt: worked.perUnitBdt,
    roundingBdt: worked.roundingBdt,
    farmBdt: worked.farmBdt,
    advanceBdt: worked.advanceBdt,
    capitalBdt: worked.capitalBdt,
    balanceBdt: worked.balanceBdt,
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
      capitalBdt: one.capitalBdt,
      shareBdt: one.shareBdt,
      payoutBdt: one.payoutBdt,
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
    advanceBdt: number;
    advanceRepaidId: string | null;
    farmBdt: number;
    farmSharePaidId: string | null;
  },
  shares: readonly { paidMovementId: string | null }[]
) =>
  shares.every((one) => one.paidMovementId !== null) &&
  (settlement.advanceBdt === 0 || settlement.advanceRepaidId !== null) &&
  (settlement.farmBdt === 0 || settlement.farmSharePaidId !== null);

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
    proceedsBdt: row.proceedsBdt,
    chargedBdt: row.chargedBdt,
    charges: chargesAsWritten(row.charges),
    profitBdt: row.profitBdt,
    investorsPercent: row.investorsPercent,
    units: row.units,
    investorsBdt: row.investorsBdt,
    perUnitBdt: row.perUnitBdt,
    roundingBdt: row.roundingBdt,
    farmBdt: row.farmBdt,
    advanceBdt: row.advanceBdt,
    advanceRepaid: row.advanceRepaidId !== null,
    farmSharePaid: row.farmSharePaidId !== null,
    capitalBdt: row.capitalBdt,
    balanceBdt: row.balanceBdt,
    shares: shares.map((one) => ({
      agreementId: one.agreementId,
      investorId: one.investorId,
      name: nameOf.get(one.investorId) ?? "",
      units: one.units,
      capitalBdt: one.capitalBdt,
      shareBdt: one.shareBdt,
      payoutBdt: one.payoutBdt,
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

/** One payment out of a Venture Account, against an approved Settlement. */
export const payOut = async (
  tx: Tx,
  farmId: string,
  what: {
    ventureId: string;
    kind: "payout" | "advance_repaid" | "farm_share";
    amountBdt: number;
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
    amountBdt: what.amountBdt.toFixed(2),
    movedOn: what.movedOn,
    reference: what.reference,
    recordedBy: by.actorId,
    createdAt: by.now,
  });
  return id;
};
