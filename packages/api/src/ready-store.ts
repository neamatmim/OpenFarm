import type { Database } from "@OpenFarm/db";
import { startOfFarmDay } from "@OpenFarm/domain";

import { fatteningOf } from "./fattening-store";

/** A whole fattening side fits in one read on a farm of this size; the herd is the bound. */
const HERD_LIMIT = 1000;

/** As many readings as a rate needs, plus room for a page to show a little history. */
const READINGS_READ = 12;

/**
 * What the Fattening side looks like from the outside: every animal on it with what the scale
 * means for her, in a settled order.
 *
 * One place, because the Owner's board and the Ready-for-Sale list both ask it and two copies of
 * this query had already begun to disagree about which States they covered and how many readings
 * they read. Ordered by Tag Number, so a limit takes the same animals twice running.
 */
export const fatteningRows = async (
  db: Database,
  farmId: string,
  where: { penId?: string; states: readonly string[] },
  now: Date
) => {
  const rows = await db.query.animal.findMany({
    where: {
      farmId,
      side: "fattening",
      state: { in: [...where.states] as never },
      penId: where.penId,
    },
    orderBy: { tagNumber: "asc" },
    limit: HERD_LIMIT,
    columns: {
      id: true,
      tagNumber: true,
      state: true,
      penId: true,
      stateChangedAt: true,
      // Her days, so nothing offers the Manager a button that would refuse them.
      meatWithdrawalUntil: true,
      meatWithdrawalFromDoses: true,
      milkWithdrawalUntil: true,
      milkWithdrawalFromDoses: true,
      withdrawalShortenedAt: true,
      withdrawalShortenedReason: true,
    },
    with: {
      pen: { columns: { name: true } },
      intake: {
        columns: {
          weightKg: true,
          arrivedAt: true,
          targetWeightKg: true,
          targetWindowStart: true,
          targetWindowEnd: true,
        },
      },
      /** Newest first: a limit on an ascending order takes her *first* readings. Sorted back
       *  into order inside `fatteningOf`, which is where the gain is worked out. */
      weighIns: {
        orderBy: { weighedAt: "desc", id: "desc" },
        limit: READINGS_READ,
        columns: { weightKg: true, weighedAt: true },
      },
      readySetAside: { columns: { grounds: true, setAsideAt: true } },
    },
  });
  return rows.map(({ intake, weighIns, pen, readySetAside, ...beast }) => ({
    ...beast,
    penName: pen.name,
    setAside: readySetAside ?? null,
    targetWindow: intake
      ? { start: intake.targetWindowStart, end: intake.targetWindowEnd }
      : null,
    /** The days as instants, for the rules that compare them with now. */
    window: intake
      ? {
          opensAt: startOfFarmDay(intake.targetWindowStart),
          closesAt: startOfFarmDay(intake.targetWindowEnd),
        }
      : null,
    view: fatteningOf(intake, weighIns, now),
  }));
};
