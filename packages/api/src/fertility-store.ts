import type { Database } from "@OpenFarm/db";
import type { CowBreeding, HerdFertility } from "@OpenFarm/domain";
import {
  cowsSinceCalving,
  farmDayOf,
  herdFertility,
  startOfFarmDay,
} from "@OpenFarm/domain";

import { isOnTheFarm } from "./instances-store";

/** The stretch the herd's figures read over: a year, so a season's calvings and the Attempts after them are in it. */
export const FERTILITY_DAYS = 365;
/** How many months the trend runs back: a year of them. */
const TREND_MONTHS = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The first farm day of the month `back` months before the one `day` is in, as YYYY-MM-DD. */
const monthStart = (day: string, back: number): string => {
  const [year, month] = day.split("-").map(Number);
  const at = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1 - back, 1));
  return at.toISOString().slice(0, 10);
};

/**
 * The herd's fertility (domain `fertility.ts`): its measures over the last year, the same month by month for a year,
 * and each cow on the farm since she last calved. Every female the farm has kept is read — a cow sold or crossed to
 * Fattening still calved here, and a year's calving intervals are hers too.
 */
export const fertilityOn = async (
  db: Pick<Database, "query">,
  farmId: string,
  now: Date
): Promise<{
  year: HerdFertility;
  months: (HerdFertility & { month: string })[];
  cows: ReturnType<typeof cowsSinceCalving>;
}> => {
  const rows = await db.query.animal.findMany({
    where: { farmId, sex: "female" },
    columns: {
      id: true,
      tagNumber: true,
      birthDate: true,
      side: true,
      state: true,
      lactationStartedAt: true,
    },
    with: {
      services: { columns: { id: true, animalId: true, servedAt: true } },
      pregnancyChecks: {
        columns: { id: true, serviceId: true, result: true, checkedAt: true },
      },
      calvings: {
        columns: { calvedAt: true, serviceId: true, lactationNumber: true },
      },
    },
  });
  const herd: CowBreeding[] = rows.map((one) => ({
    id: one.id,
    tagNumber: one.tagNumber,
    bornAt: one.birthDate,
    services: one.services,
    checks: one.pregnancyChecks,
    // A cow on the opening register calved before the farm wrote anything down: the day her Lactation began stands in
    // for the calving, so she is on the list of cows since calving like any other.
    calvings:
      one.calvings.length === 0 && one.lactationStartedAt
        ? [
            {
              calvedAt: one.lactationStartedAt,
              serviceId: null,
              lactationNumber: null,
            },
          ]
        : one.calvings,
  }));
  const today = farmDayOf(now);
  const months = Array.from({ length: TREND_MONTHS }, (_, index) => {
    const back = TREND_MONTHS - 1 - index;
    const from = startOfFarmDay(monthStart(today, back));
    const until =
      back === 0 ? now : startOfFarmDay(monthStart(today, back - 1));
    return {
      month: monthStart(today, back).slice(0, 7),
      ...herdFertility(herd, { from, until }),
    };
  });
  // Each cow on the farm's Dairy side now: the cows to go and look at.
  const standing = new Set(
    rows
      .filter((one) => one.side === "dairy" && isOnTheFarm(one))
      .map((one) => one.id)
  );
  return {
    year: herdFertility(herd, {
      from: new Date(now.getTime() - FERTILITY_DAYS * DAY_MS),
      until: now,
    }),
    months,
    cows: cowsSinceCalving(
      herd.filter((one) => standing.has(one.id)),
      now
    ),
  };
};
