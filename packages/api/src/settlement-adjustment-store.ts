import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq } from "@OpenFarm/db/operators";
import type { AdjustmentOutcome } from "@OpenFarm/db/schema/venture";
import { settlementAdjustment } from "@OpenFarm/db/schema/venture";
import { roundTaka } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";

/**
 * What earlier Adjustments have already paid out on this Settlement.
 *
 * Each Adjustment says what the figures would be now against what was frozen, so the second carries the
 * first's news as well as its own. Paying the whole of it again would send the same good news twice.
 */
const alreadyAdjustedPerUnitBdt = (
  raised: readonly {
    outcome: AdjustmentOutcome;
    perUnitDifferenceBdt: number;
  }[]
) => {
  let perUnit = 0;
  for (const one of raised) {
    if (one.outcome === "paid") {
      perUnit += one.perUnitDifferenceBdt;
    }
  }
  return roundTaka(perUnit);
};

/**
 * The Settlement Adjustments raised against a Venture's Settlement, oldest first.
 *
 * Kept apart from the Settlement itself because they answer a different question: a Settlement is what
 * the run came to, an Adjustment is what the farm has learned since — and the first never moves for the
 * second, which is the whole point of approving. Each also says what it sent and what it would still
 * send, because it states its difference against what was *frozen* and so carries the ones before it.
 */
export const adjustmentsOf = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  settlementId: string
) => {
  const rows = await tx.query.settlementAdjustment.findMany({
    where: { farmId, settlementId },
    orderBy: { raisedAt: "asc", id: "asc" },
  });
  // Each Adjustment says what the figures would be against what was frozen, so it carries the ones
  // before it as well as its own. What is still to send is that, less what every Adjustment already paid
  // has sent — every one of them, in whatever order they were dealt with, because that is the sum the
  // farm itself subtracts when it pays. Reading them in the order they were raised instead would offer
  // to send money again the moment one was paid out of turn.
  const sentAlready = alreadyAdjustedPerUnitBdt(
    rows.map((one) => ({
      outcome: one.outcome,
      perUnitDifferenceBdt: one.perUnitDifferenceBdt,
    }))
  );
  // What one of them actually sent is what it was worth less what had been sent before *it* — by when it
  // was dealt with, not when it was raised.
  const inTheOrderTheyWerePaid = rows
    .filter((one) => one.outcome === "paid" && one.closedAt !== null)
    .toSorted(
      (a, b) => (a.closedAt?.getTime() ?? 0) - (b.closedAt?.getTime() ?? 0)
    );
  const sent = new Map<string, number>();
  let before = 0;
  for (const one of inTheOrderTheyWerePaid) {
    const difference = one.perUnitDifferenceBdt;
    sent.set(one.id, roundTaka(difference - before));
    before = roundTaka(before + difference);
  }
  return rows.map((one) => {
    const { perUnitDifferenceBdt } = one;
    return {
      id: one.id,
      reason: one.reason,
      raisedAt: one.raisedAt,
      profitBdt: one.profitBdt,
      perUnitBdt: one.perUnitBdt,
      perUnitDifferenceBdt,
      investorsDifferenceBdt: one.investorsDifferenceBdt,
      thresholdBdt: one.thresholdBdt,
      outcome: one.outcome,
      waivedNote: one.waivedNote,
      closedAt: one.closedAt,
      /** What a Unit took of this one, where it was paid. */
      perUnitPaidBdt: sent.get(one.id) ?? 0,
      /** What a Unit would take if it were paid now, less what every paid one has already sent. */
      perUnitToPayBdt: roundTaka(perUnitDifferenceBdt - sentAlready),
    };
  });
};

/**
 * What a Settlement would come to now, against what it was approved on.
 *
 * The Settlement's own figures never move: this is the difference the late news makes, which is what an
 * Adjustment is of. A share that fell is not collected back — an Investor paid on figures the farm gave
 * him keeps what he was paid — so only a rise is ever a payment.
 */
export const adjustmentAgainst = (
  frozen: { perUnitBdt: number; units: number },
  now: { perUnitBdt: number; profitBdt: number }
) => {
  const perUnitDifferenceBdt = roundTaka(now.perUnitBdt - frozen.perUnitBdt);
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
): Promise<{ id: string; outcome: AdjustmentOutcome }> => {
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
    profitBdt: what.against.profitBdt,
    perUnitBdt: what.against.perUnitBdt,
    perUnitDifferenceBdt: what.against.perUnitDifferenceBdt,
    investorsDifferenceBdt: what.against.investorsDifferenceBdt,
    thresholdBdt: what.thresholdBdt,
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
