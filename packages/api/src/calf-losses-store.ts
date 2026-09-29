import type { Database } from "@OpenFarm/db";
import type { CalfLosses } from "@OpenFarm/domain";
import { calfLosses } from "@OpenFarm/domain";

/** The stretch the figure reads over: a year, so a season's worth of calvings and their deaths are both in it. */
export const CALF_LOSSES_DAYS = 365;

/** Weaned at three months, as the standard Weaning procedure raises it: a calf never weaned is judged by this age. */
const WEANING_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * What the farm lost in calves over the last year: every calf born at a Calving in it — born alive or dead — and those
 * that died or were culled before their Weaning, with the cause the farm wrote down.
 */
export const calfLossesOf = async (
  db: Pick<Database, "query">,
  farmId: string,
  now: Date
): Promise<CalfLosses & { days: number }> => {
  const from = new Date(now.getTime() - CALF_LOSSES_DAYS * DAY_MS);
  const calves = await db.query.animal.findMany({
    where: {
      farmId,
      calvingId: { isNotNull: true },
      birthDate: { gte: from, lte: now },
    },
    columns: { birthDate: true, calfOutcome: true },
    with: {
      mortality: { columns: { kind: true, happenedAt: true, cause: true } },
      weaning: { columns: { weanedAt: true } },
    },
  });
  const losses = calfLosses(
    calves.flatMap((one) =>
      one.birthDate
        ? [
            {
              bornAt: one.birthDate,
              stillborn: one.calfOutcome === "stillborn",
              lostAt: one.mortality?.happenedAt ?? null,
              cause: one.mortality?.cause ?? null,
              weanedAt: one.weaning?.weanedAt ?? null,
            },
          ]
        : []
    ),
    { from, until: now, weaningDays: WEANING_DAYS }
  );
  return { ...losses, days: CALF_LOSSES_DAYS };
};
