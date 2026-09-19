import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq } from "@OpenFarm/db/operators";
import { farm } from "@OpenFarm/db/schema/farm";
import type {
  VentureMovementKind,
  VentureState,
} from "@OpenFarm/db/schema/venture";
import { venture, ventureMovement } from "@OpenFarm/db/schema/venture";
import {
  addDays,
  EXIT_STATES,
  farmDayOf,
  monthOf,
  roundTaka,
  startOfFarmDay,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { SnapshotValue, Tx } from "./audit";
import { tripCostOf } from "./trip-store";

/**
 * Every count a Venture's rules make — Units taken, what a budget still holds, what a Float is owed — reads
 * rows that another request may be writing. One lock on the Farm, taken first by everything that writes a
 * Venture's money, is what makes those counts still true when the write lands.
 */
export const lockTheFarm = async (tx: Tx, farmId: string) => {
  await tx
    .select({ id: farm.id })
    .from(farm)
    .where(eq(farm.id, farmId))
    .for("update");
};

/** A Venture's row, as the columns hold it. */
export interface VentureRow {
  id: string;
  name: string;
  state: VentureState;
  targetCapitalBdt: string;
  floorBdt: string;
  decideBy: string;
  targetWindowStart: string;
  targetWindowEnd: string;
  unitPriceBdt: string;
  units: number;
  cattleBudgetBdt: string;
  cancelledReason: string | null;
}

/** What has been signed for a Venture: the Units spoken for, and how many people hold them. */
export interface SignedFor {
  units: number;
  people: number;
}

const NOBODY: SignedFor = { units: 0, people: 0 };

/** What a Venture's own account has seen: its Investors' capital, what went back, what it has spent and
 *  what it has paid out. Spending and payouts arrive with the buying and settlement work; they are read
 *  as nothing until then, so every reader is already right for the day they do. */
export interface Held {
  /** What Floats are out at the haat, unreconciled. Money the farm has let go of and not yet counted. */
  openFloatBdt: number;
  capitalInBdt: number;
  /** Money in that is not its Investors' capital: what it was paid for an Animal it let go. */
  proceedsBdt: number;
  /** What the Owner has put in of her own, interest-free: every Advance added up, before anything is
   *  repaid. Owed back at cost before any capital returns, and never a charge against the Venture —
   *  it earns nothing and costs it nothing. */
  advancedBdt: number;
  refundedBdt: number;
  spentBdt: number;
  paidOutBdt: number;
  /** Of what has gone out, how much was drawn against the Cattle Budget. A Buying Float is cattle
   *  money: it buys cattle or it comes home again. */
  cattleOutBdt: number;
}

/** What a Venture Account should be holding: everything that came in, less everything that left. */
export const balanceOf = (held: Held) =>
  held.capitalInBdt +
  held.proceedsBdt +
  held.advancedBdt -
  held.refundedBdt -
  held.spentBdt -
  held.paidOutBdt;

const NOTHING_HELD: Held = {
  openFloatBdt: 0,
  capitalInBdt: 0,
  proceedsBdt: 0,
  advancedBdt: 0,
  refundedBdt: 0,
  spentBdt: 0,
  paidOutBdt: 0,
  cattleOutBdt: 0,
};

/** The last day of a Venture's Wind-up Period: the days after its Target Window in which it keeps
 *  selling, before the Farm buys whatever is left. */
export const windUpEndsOn = (targetWindowEnd: string, windUpDays: number) =>
  addDays(targetWindowEnd, windUpDays);

/**
 * A Venture as a screen reads it: the plan it opened on, what it holds, who has signed for it, and the
 * Running Budget, which is whatever the Cattle Budget is not — worked out, never stored, so the two can
 * never drift apart.
 */
/**
 * A Venture's two budgets: what the plan says each is, and what is left of each.
 *
 * The budgets are a plan for the whole capital, so what has actually arrived is split in the same
 * proportion — a Venture half funded holds half of each, rather than a full Cattle Budget and nothing to
 * feed the animals with. After that the two are spent from separately, so a **Buying Float** to the haat
 * takes nothing from the money that keeps the animals.
 *
 * Worked out here rather than inside the Venture's own view, because an Investor's progress statement
 * needs these four figures and nothing else the view carries — and a second copy of this arithmetic is
 * how his paper and the Owner's screen would come to disagree about what is left.
 */
export const budgetsOf = (
  row: Pick<VentureRow, "targetCapitalBdt" | "cattleBudgetBdt" | "state">,
  held: Held | undefined
) => {
  const what = held ?? NOTHING_HELD;
  const target = Number(row.targetCapitalBdt);
  // What of the capital arrived for cattle, less what has already been drawn against it.
  const cameInForCattle =
    target > 0
      ? Math.round(
          ((what.capitalInBdt - what.refundedBdt) *
            Number(row.cattleBudgetBdt)) /
            target
        )
      : 0;
  // Once buying closes there is nothing left to buy, so what the Cattle Budget did not spend is
  // feeding money — the glossary says so of a Cattle Budget, and a Venture told it is short of keep
  // while most of its capital sits idle on the other side would be told a thing that is not true.
  const stillBuying = row.state === "open" || row.state === "buying";
  /** What the cattle side was drawn against, whether or not there is still buying to do with it. */
  const cattleBudgetDrawnAgainstBdt = cameInForCattle - what.cattleOutBdt;
  const cattleBudgetHeldBdt = stillBuying ? cattleBudgetDrawnAgainstBdt : 0;
  return {
    // What it was planned as, which is a fact about the Venture for ever and does not move.
    cattleBudgetBdt: Number(row.cattleBudgetBdt),
    runningBudgetBdt: target - Number(row.cattleBudgetBdt),
    cattleBudgetHeldBdt,
    /**
     * The same figure without the roll-over, for a reader asking what an Investor's buying money did
     * rather than what there is left to spend. An Investor's **অগ্রগতি** asks the first question: told
     * "nothing left" of a Cattle Budget that simply closed, he would read it as all of it spent.
     */
    cattleBudgetDrawnAgainstBdt,
    // What is left to keep them with: the rest of the balance once the cattle side has its own. An
    // Advance is the Owner's own money landing on this side, which is why it raises what is left.
    runningBudgetHeldBdt: balanceOf(what) - cattleBudgetHeldBdt,
  };
};

export const ventureView = (
  row: VentureRow,
  held: Held | undefined,
  signedFor: SignedFor | undefined,
  /** What the farm knows that the Venture's own row does not. Every one of them asked for and none
   *  defaulted: a default would quietly answer "not low", "never checked" or "none left standing"
   *  wherever a caller forgot it, the trail included. */
  alsoKnown: {
    /** The taka below which what is left to keep the animals with is said to be low. */
    warnBelowBdt: number;
    /** How this Venture's account stands against the bank. */
    bank: BankStanding;
    /** The days a Venture keeps selling after its Target Window closes. */
    windUpDays: number;
    /** How many Animals it still has — neither sold, nor dead, nor culled. */
    stillHers: number;
  }
) => {
  const what = held ?? NOTHING_HELD;
  const balanceBdt = balanceOf(what);
  const budgets = budgetsOf(row, held);
  const { cattleBudgetHeldBdt, runningBudgetHeldBdt } = budgets;
  return {
    id: row.id,
    name: row.name,
    state: row.state,
    targetCapitalBdt: Number(row.targetCapitalBdt),
    floorBdt: Number(row.floorBdt),
    decideBy: row.decideBy,
    targetWindow: { start: row.targetWindowStart, end: row.targetWindowEnd },
    unitPriceBdt: Number(row.unitPriceBdt),
    units: row.units,
    cattleBudgetBdt: budgets.cattleBudgetBdt,
    runningBudgetBdt: budgets.runningBudgetBdt,
    ...what,
    balanceBdt,
    /** What of the balance is meant for buying animals, and what keeps them. The cattle side is read
     *  from its own money — what came in for it, less what has been drawn against it — and the running
     *  side is the rest of the balance, so the two always add to what the account should hold. */
    cattleBudgetHeldBdt,
    runningBudgetHeldBdt,
    /** Whether what is left to keep the animals with has fallen below the level the Owner set. Said of
     *  a Venture that is running: one not yet buying has spent nothing, and one whose run is over is
     *  not feeding anybody. */
    runningBudgetLow:
      (row.state === "buying" ||
        row.state === "fattening" ||
        row.state === "selling") &&
      runningBudgetHeldBdt < alsoKnown.warnBelowBdt,
    signedFor: signedFor ?? NOBODY,
    /** How it stands against the bank: when it was last read, and whether any month is still out. */
    bank: alsoKnown.bank,
    /** The last day of the Wind-up Period: the days after the Target Window in which it keeps selling
     *  before the Farm buys whatever is left. Said while there is still time to do something about a
     *  slow bull, rather than at the moment everybody's money is late. */
    windUpEndsOn: windUpEndsOn(row.targetWindowEnd, alsoKnown.windUpDays),
    /** How many of its Animals are still standing. Past the wind-up day with any of them standing is
     *  the Venture that cannot settle on time. */
    animalsStanding: alsoKnown.stillHers,
    cancelledReason: row.cancelledReason,
  };
};

/**
 * What each Venture has been signed for, in one query rather than one per Venture — the Owner's list draws
 * every Venture she has ever opened, and a query per card is a query per card.
 */
export const signedForEach = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  ids: readonly string[]
): Promise<Map<string, SignedFor>> => {
  const summary = new Map(ids.map((id) => [id, NOBODY]));
  if (ids.length === 0) {
    return summary;
  }
  const signed = await tx.query.investmentAgreement.findMany({
    where: { farmId, ventureId: { in: [...ids] } },
    columns: { ventureId: true, units: true },
  });
  for (const one of signed) {
    const soFar = summary.get(one.ventureId) ?? NOBODY;
    summary.set(one.ventureId, {
      units: soFar.units + one.units,
      people: soFar.people + 1,
    });
  }
  return summary;
};

/**
 * What each kind of movement does to a Venture's figures: which line it lands on, which way it moves it,
 * and whether it is drawn against the Cattle Budget or the Running one. One record per kind, so a new
 * kind is one entry here and not a sum rewritten in three places.
 *
 * The sign is what makes the Float honest when it comes home: the cash brought back is the same line and
 * the same budget as the Float that took it, moving the other way.
 */
const WHAT_IT_DOES = {
  capital_in: { line: "capitalInBdt", sign: 1, cattle: 0 },
  refund: { line: "refundedBdt", sign: 1, cattle: 0 },
  // A Float is money out of the account the moment it is drawn: it is in the Manager's hand at the
  // haat, not in the bank, and it is cattle money — it buys cattle or it comes home again.
  float_out: { line: "spentBdt", sign: 1, cattle: 1 },
  // What came home is the same line and the same budget, moving the other way: the unspent part was
  // never spent, and it is cattle money still.
  float_back: { line: "spentBdt", sign: -1, cattle: -1 },
  // An Animal taken on is bought with cattle money, exactly as one bought at the haat is; one let go
  // gives that money back, and it is the Venture's own proceeds rather than anybody's capital.
  internal_buy: { line: "spentBdt", sign: 1, cattle: 1 },
  internal_sell: { line: "proceedsBdt", sign: 1, cattle: -1 },
  // A buyer takes her away and pays for her. Not cattle money coming back, as an Internal Sale's
  // roughly is: an outside Sale returns what she cost and the whole profit of the run with it, and a
  // Venture that is selling up must not read that as money to go and buy more cattle with. It lands on
  // the side that keeps the animals, which is what the ones still standing are eating through.
  sale_in: { line: "proceedsBdt", sign: 1, cattle: 0 },
  // What its Animals ate of the Farm's feed, repaid. Running-budget money: it is the cost of keeping
  // them, not of buying one.
  reimbursement: { line: "spentBdt", sign: 1, cattle: 0 },
  // The Owner's own money, in. It lands in the Running Budget, because it is there to keep the animals
  // fed and not to buy one more of them.
  advance: { line: "advancedBdt", sign: 1, cattle: 0 },
  // The Settlement paying up. An Investor's capital and his share of the profit leave together, the
  // Owner's Advance goes back to her at cost, and the Farm's own share leaves for the Farm's books —
  // none of them a cost of the run, all of them money the account no longer holds. The Farm's money
  // never stays in a Venture Account.
  payout: { line: "paidOutBdt", sign: 1, cattle: 0 },
  advance_repaid: { line: "paidOutBdt", sign: 1, cattle: 0 },
  farm_share: { line: "paidOutBdt", sign: 1, cattle: 0 },
} as const satisfies Record<
  VentureMovementKind,
  { line: keyof Held; sign: 1 | -1; cattle: 0 | 1 | -1 }
>;

/**
 * What each Venture's account has seen, in one query for the whole list. Capital in and refunds are
 * Venture Movements; spending and payouts are read as nothing until the work that makes them arrives.
 */
/** One movement folded into what a Venture holds. The only place a movement becomes a figure, so a
 *  running total and a month-by-month walk cannot come to different answers about the same money. */
const folded = (
  soFar: Held,
  one: {
    kind: VentureMovementKind;
    amountBdt: string;
    reconciledAt: Date | null;
  }
): Held => {
  const does = WHAT_IT_DOES[one.kind];
  const taka = Number(one.amountBdt);
  return {
    ...soFar,
    [does.line]: soFar[does.line] + does.sign * taka,
    cattleOutBdt: soFar.cattleOutBdt + does.cattle * taka,
    openFloatBdt:
      soFar.openFloatBdt +
      (one.kind === "float_out" && one.reconciledAt === null ? taka : 0),
  };
};

export const heldByEach = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  ids: readonly string[],
  /** The last day to count, on the farm's own calendar. Left out, everything: what the account holds
   *  today. Given, what it held at the end of that day — which is what a bank statement is of. */
  until?: string
): Promise<Map<string, Held>> => {
  const held = new Map(ids.map((id) => [id, NOTHING_HELD]));
  if (ids.length === 0) {
    return held;
  }
  const movements = await tx.query.ventureMovement.findMany({
    where: {
      farmId,
      ventureId: { in: [...ids] },
      ...(until === undefined ? {} : { movedOn: { lte: until } }),
    },
    columns: {
      ventureId: true,
      kind: true,
      amountBdt: true,
      reconciledAt: true,
    },
  });
  for (const one of movements) {
    held.set(
      one.ventureId,
      folded(held.get(one.ventureId) ?? NOTHING_HELD, one)
    );
  }
  return held;
};

/** What one Agreement has already taken in: an Investor pays for the Units they hold, and no more. */
export const takenAgainst = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  agreementId: string
): Promise<number> => {
  const rows = await tx.query.ventureMovement.findMany({
    where: { farmId, agreementId, kind: "capital_in" },
    columns: { amountBdt: true },
  });
  return rows.reduce((sum, one) => sum + Number(one.amountBdt), 0);
};

/**
 * That an outing's Buying Float has not been reconciled yet.
 *
 * Reconciling says what went out equals the animals, the outing's costs and the cash brought home. An
 * animal or a cost changed afterwards would make that sum false, and the Owner already signed it.
 */
export const assertTripIsOpen = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  tripId: string | null | undefined
) => {
  if (!tripId) {
    return;
  }
  const counted = await tx.query.ventureMovement.findFirst({
    where: {
      farmId,
      buyingTripId: tripId,
      kind: "float_out",
      reconciledAt: { isNotNull: true },
    },
    columns: { id: true },
  });
  if (counted) {
    throw new ORPCError("BAD_REQUEST", {
      message: "That outing's Float has been reconciled; it takes nothing more",
      data: { refusal: "float_already_reconciled" },
    });
  }
};

/**
 * What a Buying Float has to account for: the Animals it brought home for its Venture — each one's price
 * and the haat's toll on her — and the outing's own costs, the broker, the lorry and keeping the men.
 *
 * Whatever is left of the Float is the cash the Manager should be bringing back.
 */
export const whatTheFloatBought = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  { buyingTripId, ventureId }: { buyingTripId: string; ventureId: string }
) => {
  const trip = await tx.query.buyingTrip.findFirst({
    where: { id: buyingTripId, farmId },
  });
  const brought = await tx.query.intake.findMany({
    where: { farmId, buyingTripId },
    columns: { animalId: true, purchasePriceBdt: true, hasilBdt: true },
  });
  const owners = await tx.query.animal.findMany({
    where: { farmId, id: { in: brought.map((one) => one.animalId) } },
    columns: { id: true, ownerVentureId: true },
  });
  const whose = new Map(owners.map((one) => [one.id, one.ownerVentureId]));
  const animalsBdt = brought
    .filter((one) => whose.get(one.animalId) === ventureId)
    .reduce(
      (sum, one) => sum + Number(one.purchasePriceBdt) + Number(one.hasilBdt),
      0
    );
  return {
    animalsBdt,
    tripBdt: trip ? tripCostOf(trip) : 0,
    animals: brought.filter((one) => whose.get(one.animalId) === ventureId)
      .length,
  };
};

/**
 * What an Internal Sale is priced on: her latest Weigh-in. An Animal nobody has weighed has no price
 * anybody could defend, and the farm would rather refuse than let the Owner pick a number.
 */
export const whatSheLastWeighed = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  animalId: string
) => {
  const weighed = await tx.query.weighIn.findFirst({
    where: { farmId, animalId },
    orderBy: { weighedAt: "desc", id: "desc" },
    columns: { id: true, weightKg: true, weighedAt: true },
  });
  return weighed
    ? {
        id: weighed.id,
        weightKg: Number(weighed.weightKg),
        weighedAt: weighed.weighedAt,
      }
    : null;
};

/** One Internal Sale as the trail records it: who let her go, who took her on, and on what figures. */
export const readInternalSale = async (tx: Tx, farmId: string, id: string) => {
  const row = await tx.query.internalSale.findFirst({ where: { id, farmId } });
  return row
    ? {
        animalId: row.animalId,
        fromVentureId: row.fromVentureId,
        toVentureId: row.toVentureId,
        weightKg: Number(row.weightKg),
        rateBdtPerKg: Number(row.rateBdtPerKg),
        priceBdt: Number(row.priceBdt),
        note: row.note,
        soldOn: row.soldOn,
      }
    : null;
};

/**
 * Who owned each Animal, and from when.
 *
 * Her owner today is on her row; every **Internal Sale** before that says who let her go and who took
 * her on, so her whole history is the sales walked backwards from where she stands now. A month's feed
 * is charged to whoever owned her the day she ate it — not to whoever happens to own her when the
 * Reimbursement is made, which would have one Venture repaying days another one's animals ate.
 */
export const ownersOverTime = async (
  tx: Pick<Tx, "query">,
  farmId: string
): Promise<Map<string, { from: Date; ventureId: string | null }[]>> => {
  const sales = await tx.query.internalSale.findMany({
    where: { farmId },
    columns: {
      animalId: true,
      fromVentureId: true,
      toVentureId: true,
      soldOn: true,
    },
    orderBy: { soldOn: "asc", id: "asc" },
  });
  const byAnimal = new Map<string, typeof sales>();
  for (const one of sales) {
    byAnimal.set(one.animalId, [...(byAnimal.get(one.animalId) ?? []), one]);
  }
  const owners = new Map<string, { from: Date; ventureId: string | null }[]>();
  for (const [animalId, hers] of byAnimal) {
    const [first] = hers;
    if (!first) {
      continue;
    }
    // Before the first sale she belonged to whoever let her go in it; after each one, to whoever took
    // her on.
    owners.set(animalId, [
      { from: new Date(0), ventureId: first.fromVentureId },
      ...hers.map((one) => ({
        from: startOfFarmDay(one.soldOn),
        ventureId: one.toVentureId,
      })),
    ]);
  }
  return owners;
};

/** The last day a month has, as the farm writes a day. */
const lastDayOf = (month: string) => {
  const { until } = monthOf(startOfFarmDay(`${month}-01`));
  return farmDayOf(new Date(until.getTime() - 1));
};

/** What the farm thinks a Venture Account held at the end of one month. */
export const balanceAtMonthEnd = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  ventureId: string,
  month: string
): Promise<number> => {
  const held = await heldByEach(tx, farmId, [ventureId], lastDayOf(month));
  return roundTaka(balanceOf(held.get(ventureId) ?? NOTHING_HELD));
};

/**
 * What the farm believes each of these Ventures held at the end of each of these months, now.
 *
 * One ordered read of the movements folded forward, rather than a read per month: months only ever
 * accumulate, and this is asked for every Venture every time the list is drawn.
 */
const balancesAtMonthEnds = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  ids: readonly string[],
  months: readonly string[]
): Promise<Map<string, Map<string, number>>> => {
  const inOrder = [...months].toSorted();
  const answer = new Map(
    inOrder.map((month) => [month, new Map<string, number>()])
  );
  if (ids.length === 0 || inOrder.length === 0) {
    return answer;
  }
  const movements = await tx.query.ventureMovement.findMany({
    where: { farmId, ventureId: { in: [...ids] } },
    columns: {
      ventureId: true,
      kind: true,
      amountBdt: true,
      reconciledAt: true,
      movedOn: true,
    },
    orderBy: { movedOn: "asc", id: "asc" },
  });
  const held = new Map(ids.map((id) => [id, NOTHING_HELD]));
  let at = 0;
  for (const month of inOrder) {
    const lastDay = lastDayOf(month);
    while (at < movements.length && (movements[at]?.movedOn ?? "") <= lastDay) {
      const one = movements[at];
      if (one) {
        held.set(
          one.ventureId,
          folded(held.get(one.ventureId) ?? NOTHING_HELD, one)
        );
      }
      at += 1;
    }
    answer.set(
      month,
      new Map([...held].map(([id, one]) => [id, roundTaka(balanceOf(one))]))
    );
  }
  return answer;
};

/** Whether a Bank Check still stands: what the farm believes that month ended on now, against what it
 *  believed when she read the statement. Agreeing with a figure nobody holds any more is not agreeing. */
export const hasGoneStale = (believedNow: number, believedThen: number) =>
  roundTaka(believedNow - believedThen) !== 0;

/** How a Venture's account stands against the bank. */
export interface BankStanding {
  /** The last month anybody read the statement against the books, or nothing if nobody has. */
  lastCheckedMonth: string | null;
  /** The months still out, oldest first — every month a Settlement waits on, whether the statement
   *  disagreed or the farm has since changed its mind about what the month ended on. A month put right
   *  stops being one; a month nobody has looked at was never one — which is why the last month checked
   *  is said as well. */
  monthsOut: string[];
  /** Those of them the farm has since changed its mind about, oldest first. A different problem from a
   *  month that disagreed: this one needs the statement read again, that one needs explaining. */
  monthsStale: string[];
}

export const NEVER_CHECKED: BankStanding = {
  lastCheckedMonth: null,
  monthsOut: [],
  monthsStale: [],
};

/**
 * How each Venture's account stands against the bank: every month that is still out, not only the last
 * one read. An August that agreed says nothing about a July that did not, and a Settlement is owed the
 * whole answer rather than the most recent one.
 */
export const bankStandingOf = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  ids: readonly string[]
): Promise<Map<string, BankStanding>> => {
  const checks =
    ids.length === 0
      ? []
      : await tx.query.ventureBankCheck.findMany({
          where: { farmId, ventureId: { in: [...ids] } },
          orderBy: { forMonth: "asc", id: "asc" },
        });
  // What the farm believes each checked month ended on today, which is not what it believed when the
  // statement was read: a movement written or corrected into a month moves that month and every month
  // after it.
  const believedNow = await balancesAtMonthEnds(
    tx,
    farmId,
    ids,
    checks.map((one) => one.forMonth)
  );
  const standing = new Map<string, BankStanding>();
  for (const one of checks) {
    const soFar = standing.get(one.ventureId) ?? {
      ...NEVER_CHECKED,
      monthsOut: [],
      monthsStale: [],
    };
    const believedThen = Number(one.expectedBdt);
    const stale = hasGoneStale(
      believedNow.get(one.forMonth)?.get(one.ventureId) ?? 0,
      believedThen
    );
    if (stale) {
      soFar.monthsStale.push(one.forMonth);
    }
    if (stale || roundTaka(Number(one.readBdt) - believedThen) !== 0) {
      soFar.monthsOut.push(one.forMonth);
    }
    standing.set(one.ventureId, { ...soFar, lastCheckedMonth: one.forMonth });
  }
  return standing;
};

/**
 * What a buyer paid for a Venture's Animal, landing in that Venture's account.
 *
 * Written from the Sale rather than beside it, so that putting the Sale's price right moves this with
 * it: two records of one payment that can drift apart are two records an Investor can be shown in turn.
 * A beast given away fetches nothing and moves nothing.
 */
export const bookSaleProceeds = async (
  tx: Tx,
  sale: {
    id: string;
    farmId: string;
    /** Whose Animal she was when she left, or nothing for the Farm's own. */
    ventureId: string | null;
    priceBdt: number;
    soldAt: Date;
    /** What the movement is looked up by. Her tag, and not a slip number: the money came off a buyer
     *  at the haat, and her tag is what the Owner has to go on. */
    reference: string;
  },
  now: Date,
  recordedBy: string | null
) => {
  const already = await tx.query.ventureMovement.findFirst({
    where: { farmId: sale.farmId, saleId: sale.id },
    columns: { id: true },
  });
  const itsOwn = sale.priceBdt > 0 ? sale.ventureId : null;
  if (already && itsOwn === null) {
    // Not a movement put right but a movement that should never have been written: a Correction saying
    // she was the Farm's, or that she was given away, says this money never reached the account. That
    // is not the Investor's capital appearing never to have moved — it is the farm no longer claiming
    // a payment it does not hold.
    await tx
      .delete(ventureMovement)
      .where(
        and(
          eq(ventureMovement.id, already.id),
          eq(ventureMovement.farmId, sale.farmId)
        )
      );
    return;
  }
  if (itsOwn === null) {
    return;
  }
  if (already) {
    // The Venture as well as the figure: a Correction may say she was another Venture's all along, and
    // what she fetched belongs where she did.
    await tx
      .update(ventureMovement)
      .set({ ventureId: itsOwn, amountBdt: sale.priceBdt.toFixed(2) })
      .where(
        and(
          eq(ventureMovement.id, already.id),
          eq(ventureMovement.farmId, sale.farmId)
        )
      );
    return;
  }
  await tx.insert(ventureMovement).values({
    id: uuidv7(now),
    farmId: sale.farmId,
    ventureId: itsOwn,
    kind: "sale_in",
    saleId: sale.id,
    amountBdt: sale.priceBdt.toFixed(2),
    movedOn: farmDayOf(sale.soldAt),
    reference: sale.reference,
    recordedBy,
    createdAt: now,
  });
};

/**
 * How many Animals each Venture still has: neither sold, nor dead, nor culled.
 *
 * What a Wind-up Period is measured against: past its last day with any of them still hers is the
 * Venture that cannot settle on time. Whether a Settlement then refuses is the Settlement's own rule
 * and not kept here.
 */
/** Which Animals a Venture still has, by tag: neither sold, nor dead, nor culled. */
export const stillHersOf = (
  tx: Pick<Tx, "query">,
  farmId: string,
  ventureId: string
) =>
  tx.query.animal.findMany({
    where: {
      farmId,
      ownerVentureId: ventureId,
      state: { notIn: [...EXIT_STATES] },
    },
    columns: { id: true, tagNumber: true },
    orderBy: { tagNumber: "asc", id: "asc" },
  });

/** What one Animal is worth at a live-weight rate, as the farm rounds it. */
export const priceAtWeight = (weightKg: number, rateBdtPerKg: number) =>
  roundTaka(weightKg * rateBdtPerKg);

export const stillHersByEach = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  ids: readonly string[]
): Promise<Map<string, number>> => {
  const stillHers = new Map(ids.map((id) => [id, 0]));
  if (ids.length === 0) {
    return stillHers;
  }
  const hers = await tx.query.animal.findMany({
    where: {
      farmId,
      ownerVentureId: { in: [...ids] },
      state: { notIn: [...EXIT_STATES] },
    },
    columns: { ownerVentureId: true },
  });
  for (const one of hers) {
    if (one.ownerVentureId) {
      stillHers.set(
        one.ownerVentureId,
        (stillHers.get(one.ownerVentureId) ?? 0) + 1
      );
    }
  }
  return stillHers;
};

/**
 * Whose an Animal was on a given day — her owner then, not her owner now.
 *
 * What every sum narrowed to a Venture is filtered by: a month's feed belongs to whoever owned her that
 * month, and reading it off today's owner charges one Investor for another's animal for good.
 */
export const ownedThenByOf = async (
  tx: Pick<Tx, "query">,
  farmId: string
): Promise<(animalId: string, at: Date) => string | null> => {
  const nowOwned = await tx.query.animal.findMany({
    where: { farmId },
    columns: { id: true, ownerVentureId: true },
  });
  const ownsNow = new Map(nowOwned.map((one) => [one.id, one.ownerVentureId]));
  const changed = await ownersOverTime(tx, farmId);
  const ownerAt = (animalId: string, at: Date): string | null => {
    const hers = changed.get(animalId);
    if (!hers) {
      // Never sold between purses, so she has belonged to the same owner throughout.
      return ownsNow.get(animalId) ?? null;
    }
    // The last change on or before that day is who owned her then.
    let owner = hers[0]?.ventureId ?? null;
    for (const span of hers) {
      if (span.from <= at) {
        owner = span.ventureId;
      }
    }
    return owner;
  };
  return ownerAt;
};

/** One bank check as the trail records it. */
export const readBankCheck = async (tx: Tx, farmId: string, id: string) => {
  const row = await tx.query.ventureBankCheck.findFirst({
    where: { id, farmId },
  });
  return row
    ? {
        ventureId: row.ventureId,
        forMonth: row.forMonth,
        readBdt: Number(row.readBdt),
        expectedBdt: Number(row.expectedBdt),
        note: row.note,
      }
    : null;
};

/** One Venture Movement as the trail records it: whose money, which way, how much and against what
 *  reference. */
export const readMovement = async (tx: Tx, farmId: string, id: string) => {
  const row = await tx.query.ventureMovement.findFirst({
    where: { id, farmId },
  });
  return row
    ? {
        ventureId: row.ventureId,
        kind: row.kind,
        agreementId: row.agreementId,
        buyingTripId: row.buyingTripId,
        amountBdt: Number(row.amountBdt),
        movedOn: row.movedOn,
        reference: row.reference,
        refundsId: row.refundsId,
        reconciledAt: row.reconciledAt,
      }
    : null;
};

/** The Venture as the trail records it. */
export const readVenture = async (tx: Tx, farmId: string, id: string) => {
  const row = await tx.query.venture.findFirst({ where: { id, farmId } });
  if (!row) {
    return null;
  }
  const held = await heldByEach(tx, farmId, [row.id]);
  const signed = await signedForEach(tx, farmId, [row.id]);
  const farmRow = await tx.query.farm.findFirst({
    where: { id: farmId },
    columns: { runningBudgetWarnBdt: true, windUpDays: true },
  });
  const bank = await bankStandingOf(tx, farmId, [row.id]);
  const stillHers = await stillHersByEach(tx, farmId, [row.id]);
  return ventureView(row, held.get(row.id), signed.get(row.id), {
    warnBelowBdt: farmRow?.runningBudgetWarnBdt ?? 0,
    bank: bank.get(row.id) ?? NEVER_CHECKED,
    windUpDays: farmRow?.windUpDays ?? 0,
    stillHers: stillHers.get(row.id) ?? 0,
  });
};

/**
 * A Venture keeping up with its own animals: the first of them sold is what makes it Selling.
 *
 * A fact rather than a chore — the Owner is not asked to remember, and the Manager selling at the haat
 * is not asked to know whose animal she is selling. Nothing to do once it is already Selling, so a
 * second Sale writes no second event.
 */
export const reachesSellingOnASale = async (
  tx: Tx,
  farmId: string,
  ventureId: string,
  /** How the change is recorded — the Sale's own `recordEvent`, so the move is on the same
   *  transaction as the Sale that caused it. */
  trail: (
    tx: Tx,
    event: { entity: string; entityId: string; action: "update" },
    snapshots: { before?: SnapshotValue; after?: SnapshotValue }
  ) => Promise<string>
) => {
  const row = await tx.query.venture.findFirst({
    where: { id: ventureId, farmId },
    columns: { state: true },
  });
  if (row?.state === "settled" || row?.state === "cancelled") {
    // Its books are closed and its money has gone. An Animal of its cannot be sold, because the taka
    // would land in an account whose Settlement has already said what it held — and that Settlement is
    // what every Investor was paid on.
    throw new ORPCError("BAD_REQUEST", {
      message: `That Animal belongs to a Venture that is ${row.state}`,
      data: { refusal: "venture_wrong_state" },
    });
  }
  if (row?.state !== "buying" && row?.state !== "fattening") {
    // Already Selling: it is where a Sale would put it, and there is nothing to record.
    return false;
  }
  const before = await readVenture(tx, farmId, ventureId);
  await tx
    .update(venture)
    .set({ state: "selling" })
    .where(eq(venture.id, ventureId));
  await trail(
    tx,
    { entity: "venture", entityId: ventureId, action: "update" },
    { before, after: await readVenture(tx, farmId, ventureId) }
  );
  // Said rather than acted on here: the run turning back into money is one of the four moments an
  // Investor hears at, and this is the one place that knows it was the *first* Sale — the state only
  // moves once. Telling him is the caller's, because a store that told anybody would have to reach
  // back into the notices and make a circle of the imports.
  return true;
};
