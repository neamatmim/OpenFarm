/**
 * What the farm loses in calves — the figure that says whether its calf care is working. Over a stretch of days: the
 * calves born alive, those born dead, and those that died before they were weaned, with what they died of. DLS calls
 * more than one in ten lost before weaning unacceptable (NG-GLPP §11.5(a); docs/research/newborn-calf-care.md §8).
 *
 * A calf is lost if she died — or was culled — before her Weaning; one never weaned is lost if she died younger than
 * the weaning age, so a farm that does not record weaning still gets a figure. A calf sold before weaning is not lost:
 * the farm chose to let her go. Stillborn calves are counted apart, because what the farm's care changes begins once
 * she is breathing.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * What calves most often die of on Bangladeshi dairy farms, offered on the death form for a calf (docs/research/
 * newborn-calf-care.md §8): scours, pneumonia, navel or joint ill, weak from birth, worms. Written in Bangla whoever
 * picks one, so the calf-loss figure counts one cause once rather than once per language.
 */
export const CALF_DEATH_CAUSES = [
  { bn: "পাতলা পায়খানা", en: "Scours" },
  { bn: "নিউমোনিয়া", en: "Pneumonia" },
  { bn: "নাভি বা গিরা ফোলা", en: "Navel or joint ill" },
  { bn: "জন্ম থেকে দুর্বল", en: "Weak from birth" },
  { bn: "কৃমি", en: "Worms" },
] as const;

/** One calf born at a Calving, and how her first months went. */
export interface CalfRecord {
  bornAt: Date;
  stillborn: boolean;
  /** When she died or was culled, and why as the farm wrote it; nothing while she lives or was sold. */
  lostAt: Date | null;
  cause: string | null;
  weanedAt: Date | null;
}

/** One cause of calf deaths, and how many. */
export interface CalfCause {
  cause: string;
  count: number;
}

export interface CalfLosses {
  bornAlive: number;
  stillborn: number;
  diedBeforeWeaning: number;
  /** The calves born alive whose weeks of risk are over by the stretch's end: weaned, or past the weaning age. */
  oldEnough: number;
  /**
   * Of the calves old enough, the part lost before weaning: 0.12 is twelve in a hundred. Nothing with none old enough.
   * Not over every calf born alive: last week's calves have not yet lived through the weeks that kill calves, and
   * counting them as safe would read the farm's losses low just where the line of one in ten is drawn.
   */
  lostShare: number | null;
  /** What the lost calves died of, the commonest first; the same day by name. */
  causes: CalfCause[];
}

/** Whether a calf born alive was lost before she was weaned. */
export const lostBeforeWeaning = (
  calf: CalfRecord,
  weaningDays: number
): boolean => {
  if (calf.stillborn || calf.lostAt === null) {
    return false;
  }
  if (calf.weanedAt !== null) {
    return calf.lostAt < calf.weanedAt;
  }
  return calf.lostAt.getTime() - calf.bornAt.getTime() < weaningDays * DAY_MS;
};

/** The calves born in `from`–`until`, counted. */
export const calfLosses = (
  calves: readonly CalfRecord[],
  { from, until, weaningDays }: { from: Date; until: Date; weaningDays: number }
): CalfLosses => {
  const born = calves.filter(
    (calf) => calf.bornAt >= from && calf.bornAt < until
  );
  const alive = born.filter((calf) => !calf.stillborn);
  const lost = alive.filter((calf) => lostBeforeWeaning(calf, weaningDays));
  const weaningAgeBy = until.getTime() - weaningDays * DAY_MS;
  const oldEnough = alive.filter(
    (calf) =>
      calf.bornAt.getTime() <= weaningAgeBy ||
      (calf.weanedAt !== null && calf.weanedAt < until)
  );
  const lostOfThem = oldEnough.filter((calf) =>
    lostBeforeWeaning(calf, weaningDays)
  );
  const byCause = new Map<string, number>();
  for (const calf of lost) {
    const cause = calf.cause?.trim() || "—";
    byCause.set(cause, (byCause.get(cause) ?? 0) + 1);
  }
  return {
    bornAlive: alive.length,
    stillborn: born.length - alive.length,
    diedBeforeWeaning: lost.length,
    oldEnough: oldEnough.length,
    lostShare:
      oldEnough.length === 0 ? null : lostOfThem.length / oldEnough.length,
    causes: [...byCause.entries()]
      .map(([cause, count]) => ({ cause, count }))
      .toSorted((a, b) => b.count - a.count || a.cause.localeCompare(b.cause)),
  };
};
