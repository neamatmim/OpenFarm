import type { Database } from "@OpenFarm/db";
import type { AdultDeaths } from "@OpenFarm/domain";
import {
  WEANING_AFTER_DAYS,
  adultDeaths,
  exitOf,
  groupedBy,
  penHistoryOf,
} from "@OpenFarm/domain";

/** The stretch the figure reads over: a year, as the calf-loss figure does. */
export const DEATHS_DAYS = 365;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * What the farm lost in grown animals over the last year: deaths and culls by Side, what the dead died of, and deaths
 * for every hundred head kept a year — every animal the farm had in it, from her Intake, her birth or the day she was
 * registered, to the day she left.
 */
export const adultDeathsOf = async (
  db: Pick<Database, "query">,
  farmId: string,
  now: Date
): Promise<AdultDeaths & { days: number }> => {
  const from = new Date(now.getTime() - DEATHS_DAYS * DAY_MS);
  const herd = await db.query.animal.findMany({
    where: { farmId },
    columns: {
      id: true,
      side: true,
      birthDate: true,
      createdAt: true,
      state: true,
      stateChangedAt: true,
    },
    with: {
      intake: { columns: { arrivedAt: true } },
      mortality: { columns: { kind: true, happenedAt: true, cause: true } },
    },
  });
  // Which Side each stood on when, from her Moves, as her costs are charged: a cull cow fattened for Eid keeps her
  // years in milk on the Dairy side, and a death is the Side's she died on.
  const moves = await db.query.animalMove.findMany({
    where: { farmId },
    columns: {
      id: true,
      animalId: true,
      toPenId: true,
      toSide: true,
      movedAt: true,
    },
  });
  const leftAt = new Map(
    herd.flatMap((one) => {
      const left = one.mortality?.happenedAt ?? exitOf(one)?.at;
      return left ? [[one.id, left] as const] : [];
    })
  );
  const sidesOf = groupedBy(
    penHistoryOf(moves, leftAt),
    (line) => line.animalId
  );
  const deaths = adultDeaths(
    herd.map((one) => {
      const death = one.mortality
        ? {
            kind: one.mortality.kind,
            at: one.mortality.happenedAt,
            cause: one.mortality.cause,
          }
        : null;
      return {
        side: one.side,
        sides: sidesOf.get(one.id) ?? [],
        bornAt: one.birthDate,
        arrivedAt: one.intake?.arrivedAt ?? one.birthDate ?? one.createdAt,
        // A death is dated by when it happened, not when it was written up.
        leftAt: death?.at ?? exitOf(one)?.at ?? null,
        death,
      };
    }),
    { from, until: now, weaningDays: WEANING_AFTER_DAYS }
  );
  return { ...deaths, days: DEATHS_DAYS };
};
