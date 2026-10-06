import type { Database } from "@OpenFarm/db";
import type { AdultDeaths, DairyTurnover, Sickness } from "@OpenFarm/domain";
import {
  WEANING_AFTER_DAYS,
  adultDeaths,
  dairyTurnover,
  exitOf,
  groupedBy,
  penHistoryOf,
  sicknessOf,
  sidesOverTime,
} from "@OpenFarm/domain";

/** The stretch the figure reads over: a year, as the calf-loss figure does. */
export const DEATHS_DAYS = 365;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The farm's herd as the yearly figures read it — every animal it has kept, how she came and went, her calvings and
 * Diagnoses — with which Side each stood on when, from her Moves, as her costs are charged: a cull cow fattened for Eid
 * keeps her years in milk on the Dairy side, and a death is the Side's she died on.
 */
const herdWithSides = async (db: Pick<Database, "query">, farmId: string) => {
  const herd = await db.query.animal.findMany({
    where: { farmId },
    columns: {
      id: true,
      side: true,
      birthDate: true,
      createdAt: true,
      state: true,
      stateChangedAt: true,
      lactationNumber: true,
      lactationStartedAt: true,
    },
    with: {
      intake: { columns: { arrivedAt: true } },
      weaning: { columns: { weanedAt: true } },
      mortality: { columns: { kind: true, happenedAt: true, cause: true } },
      calvings: { columns: { calvedAt: true, lactationNumber: true } },
      diagnoses: {
        columns: { diagnosedAt: true, disease: true, diseaseEn: true },
      },
    },
  });
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
  return { herd, sidesOf };
};

type Herd = Awaited<ReturnType<typeof herdWithSides>>;

/** How she left, dated by when it happened rather than when it was written up; nothing while she is here. */
const leftOf = (one: Herd["herd"][number]) => {
  if (one.mortality) {
    return { how: one.mortality.kind, at: one.mortality.happenedAt };
  }
  const exit = exitOf(one);
  return exit && (exit.how === "sold" || exit.how === "lost")
    ? { how: exit.how, at: exit.at }
    : null;
};

/** The death figures from the herd read once. */
const deathsOf = (
  herd: Herd["herd"],
  sidesOf: Herd["sidesOf"],
  stretch: { from: Date; until: Date }
) =>
  adultDeaths(
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
        weanedAt: one.weaning?.weanedAt ?? null,
        arrivedAt: one.intake?.arrivedAt ?? one.birthDate ?? one.createdAt,
        // A death is dated by when it happened, not when it was written up.
        leftAt: death?.at ?? exitOf(one)?.at ?? null,
        death,
      };
    }),
    { ...stretch, weaningDays: WEANING_AFTER_DAYS }
  );

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
  const { herd, sidesOf } = await herdWithSides(db, farmId);
  return {
    ...deathsOf(herd, sidesOf, { from, until: now }),
    days: DEATHS_DAYS,
  };
};

/**
 * How the dairy herd turned over and how often the farm's animals were found sick, over the last year: every way a cow
 * left the milking herd and the heifers that joined it, over the cows kept; Diagnoses over the head kept on each Side,
 * and clinical mastitis over the cows.
 */
export const herdHealthOf = async (
  db: Pick<Database, "query">,
  farmId: string,
  now: Date
): Promise<{ turnover: DairyTurnover; sickness: Sickness; days: number }> => {
  const from = new Date(now.getTime() - DEATHS_DAYS * DAY_MS);
  const stretch = { from, until: now };
  const { herd, sidesOf } = await herdWithSides(db, farmId);
  const females = herd.filter(
    (one) =>
      one.side === "dairy" || one.calvings.length > 0 || one.lactationNumber > 0
  );
  const turnover = dairyTurnover(
    females.map((one) => {
      const calvedOn = one.calvings
        .map((calving) => calving.calvedAt)
        .toSorted((a, b) => a.getTime() - b.getTime());
      const first = one.calvings.find(
        (calving) => calving.lactationNumber === 1
      );
      return {
        // A cow on the opening register calved before the farm wrote anything down: her Lactation's start says so.
        cowFrom:
          calvedOn[0] ??
          (one.lactationNumber > 0
            ? (one.lactationStartedAt ?? one.createdAt)
            : null),
        firstCalvedAt: first?.calvedAt ?? null,
        side: one.side,
        sides: sidesOf.get(one.id) ?? [],
        arrivedAt: one.intake?.arrivedAt ?? one.birthDate ?? one.createdAt,
        left: leftOf(one),
      };
    }),
    stretch
  );
  const deaths = deathsOf(herd, sidesOf, stretch);
  const sideOf = sidesOverTime([...sidesOf.values()].flat());
  const diagnoses = herd.flatMap((one) =>
    one.diagnoses
      .filter((seen) => seen.diagnosedAt >= from && seen.diagnosedAt < now)
      .map((seen) => ({
        side: sideOf(one, seen.diagnosedAt),
        disease: seen.disease,
        diseaseEn: seen.diseaseEn,
      }))
  );
  return {
    turnover,
    sickness: sicknessOf(diagnoses, {
      dairyHeadYears: deaths.dairy.headYears,
      fatteningHeadYears: deaths.fattening.headYears,
      cowYears: turnover.cowYears,
    }),
    days: DEATHS_DAYS,
  };
};
