import type { Database } from "@OpenFarm/db";
import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq } from "@OpenFarm/db/operators";
import {
  venture as ventureTable,
  ventureMovement,
  settlementAdjustment,
  ventureSettlement,
  ventureSettlementShare,
} from "@OpenFarm/db/schema/venture";
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
  // Named rather than numbered, and named in one place: a screen that has to know what "trips" is
  // called should fail to compile when a line is added, not print an empty label.
  const charges: { word: ChargeWord; bdt: number }[] = [
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
      agreementId: one.id,
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
    proceedsBdt: worked.proceedsBdt.toFixed(2),
    chargedBdt: worked.chargedBdt.toFixed(2),
    charges: worked.charges,
    profitBdt: worked.profitBdt.toFixed(2),
    investorsPercent: worked.investorsPercent,
    units: worked.units,
    investorsBdt: worked.investorsBdt.toFixed(2),
    perUnitBdt: worked.perUnitBdt.toFixed(2),
    roundingBdt: worked.roundingBdt.toFixed(2),
    farmBdt: worked.farmBdt.toFixed(2),
    advanceBdt: worked.advanceBdt.toFixed(2),
    capitalBdt: worked.capitalBdt.toFixed(2),
    balanceBdt: worked.balanceBdt.toFixed(2),
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
      capitalBdt: one.capitalBdt.toFixed(2),
      shareBdt: one.shareBdt.toFixed(2),
      payoutBdt: one.payoutBdt.toFixed(2),
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
    advanceBdt: string;
    advanceRepaidId: string | null;
    farmBdt: string;
    farmSharePaidId: string | null;
  },
  shares: readonly { paidMovementId: string | null }[]
) =>
  shares.every((one) => one.paidMovementId !== null) &&
  (Number(settlement.advanceBdt) === 0 ||
    settlement.advanceRepaidId !== null) &&
  (Number(settlement.farmBdt) === 0 || settlement.farmSharePaidId !== null);

/** The Adjustments raised against a Venture's Settlement, oldest first. */
/**
 * What earlier Adjustments have already paid out on this Settlement.
 *
 * Each Adjustment says what the figures would be now against what was frozen, so the second carries the
 * first's news as well as its own. Paying the whole of it again would send the same good news twice.
 */
export const alreadyAdjustedPerUnitBdt = (
  raised: readonly { outcome: string; perUnitDifferenceBdt: number }[]
) => {
  let perUnit = 0;
  for (const one of raised) {
    if (one.outcome === "paid") {
      perUnit += one.perUnitDifferenceBdt;
    }
  }
  return roundTaka(perUnit);
};

export const adjustmentsOf = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  settlementId: string
) => {
  const rows = await tx.query.settlementAdjustment.findMany({
    where: { farmId, settlementId },
    orderBy: { raisedAt: "asc", id: "asc" },
  });
  return rows.map((one) => ({
    id: one.id,
    reason: one.reason,
    raisedAt: one.raisedAt,
    profitBdt: Number(one.profitBdt),
    perUnitBdt: Number(one.perUnitBdt),
    perUnitDifferenceBdt: Number(one.perUnitDifferenceBdt),
    investorsDifferenceBdt: Number(one.investorsDifferenceBdt),
    thresholdBdt: Number(one.thresholdBdt),
    outcome: one.outcome,
    waivedNote: one.waivedNote,
    closedAt: one.closedAt,
  }));
};

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
    proceedsBdt: Number(row.proceedsBdt),
    chargedBdt: Number(row.chargedBdt),
    charges: chargesAsWritten(row.charges),
    profitBdt: Number(row.profitBdt),
    investorsPercent: row.investorsPercent,
    units: row.units,
    investorsBdt: Number(row.investorsBdt),
    perUnitBdt: Number(row.perUnitBdt),
    roundingBdt: Number(row.roundingBdt),
    farmBdt: Number(row.farmBdt),
    advanceBdt: Number(row.advanceBdt),
    advanceRepaid: row.advanceRepaidId !== null,
    farmSharePaid: row.farmSharePaidId !== null,
    capitalBdt: Number(row.capitalBdt),
    balanceBdt: Number(row.balanceBdt),
    shares: shares.map((one) => ({
      agreementId: one.agreementId,
      investorId: one.investorId,
      name: nameOf.get(one.investorId) ?? "",
      units: one.units,
      capitalBdt: Number(one.capitalBdt),
      shareBdt: Number(one.shareBdt),
      payoutBdt: Number(one.payoutBdt),
      paid: one.paidMovementId !== null,
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

/**
 * What a Settlement would come to now, against what it was approved on.
 *
 * The Settlement's own figures never move: this is the difference the late news makes, which is what an
 * Adjustment is of. A share that fell is not collected back — an Investor paid on figures the farm gave
 * him keeps what he was paid — so only a rise is ever a payment.
 */
export const adjustmentAgainst = (
  frozen: { perUnitBdt: string; units: number },
  now: { perUnitBdt: number; profitBdt: number }
) => {
  const perUnitDifferenceBdt = roundTaka(
    now.perUnitBdt - Number(frozen.perUnitBdt)
  );
  return {
    profitBdt: now.profitBdt,
    perUnitBdt: now.perUnitBdt,
    perUnitDifferenceBdt,
    investorsDifferenceBdt: roundTaka(perUnitDifferenceBdt * frozen.units),
  };
};

/**
 * What an Adjustment must have done about it: noted only, or dealt with.
 *
 * Only news that leaves the Investors better off is ever outstanding. Money already paid is never
 * chased, so a share that fell has nothing that can be done about it — calling it outstanding would
 * leave the Owner waiving money she was never going to collect. Below the figure the Farm set nothing
 * moves either, because a hundred taka should not cost a trip to the bank. Either way it is written
 * down, because an Investor is owed the news whichever way it went.
 */
export const outcomeFor = (
  investorsDifferenceBdt: number,
  thresholdBdt: number
) => (investorsDifferenceBdt > thresholdBdt ? "outstanding" : "noted");

/** An Adjustment written down: what arrived late, what it does to the figures, and what must be done. */
export const raiseAdjustment = async (
  tx: Tx,
  farmId: string,
  settlementId: string,
  what: {
    reason: string;
    thresholdBdt: number;
    against: ReturnType<typeof adjustmentAgainst>;
  },
  by: { actorId: string; now: Date }
) => {
  const id = uuidv7(by.now);
  const outcome = outcomeFor(
    what.against.investorsDifferenceBdt,
    what.thresholdBdt
  );
  await tx.insert(settlementAdjustment).values({
    id,
    farmId,
    settlementId,
    reason: what.reason,
    profitBdt: what.against.profitBdt.toFixed(2),
    perUnitBdt: what.against.perUnitBdt.toFixed(2),
    perUnitDifferenceBdt: what.against.perUnitDifferenceBdt.toFixed(2),
    investorsDifferenceBdt: what.against.investorsDifferenceBdt.toFixed(2),
    thresholdBdt: what.thresholdBdt.toFixed(2),
    // Below the figure the Farm set, there is nothing to do and it says so at once.
    outcome,
    closedAt: outcome === "noted" ? by.now : null,
    closedBy: outcome === "noted" ? by.actorId : null,
    raisedBy: by.actorId,
    raisedAt: by.now,
  });
  return { id, outcome };
};

/** One Adjustment of this Settlement's, or nothing the caller may act on. */
export const theAdjustment = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  settlementId: string,
  id: string
) => {
  // Scoped to the Settlement it was raised against, not only to the farm: an Adjustment of one Venture
  // paid through another would send one Venture's figure times the other's Units.
  const row = await tx.query.settlementAdjustment.findFirst({
    where: { id, farmId, settlementId },
  });
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "No such Adjustment" });
  }
  if (row.outcome !== "outstanding") {
    throw new ORPCError("BAD_REQUEST", {
      message: "That Adjustment has already been dealt with",
      data: { refusal: "adjustment_is_closed" },
    });
  }
  return row;
};

/** An Adjustment closed: paid on top of what was settled, or waived in words the Owner stands behind. */
export const closeAdjustment = (
  tx: Tx,
  farmId: string,
  id: string,
  how: { outcome: "paid" | "waived"; waivedNote?: string },
  by: { actorId: string; now: Date }
) =>
  tx
    .update(settlementAdjustment)
    .set({
      outcome: how.outcome,
      waivedNote: how.waivedNote ?? null,
      closedAt: by.now,
      closedBy: by.actorId,
    })
    .where(
      and(
        eq(settlementAdjustment.id, id),
        eq(settlementAdjustment.farmId, farmId)
      )
    );
