/**
 * Animals lost soon after they came, by who sold them and where they were bought — the question a farm asks of a
 * trader whose bulls keep dying in quarantine: bought sick, or bought tired? Early is the quarantine's thirty days. A
 * death and a cull are counted apart, and a Diagnosis within those days counts the animal once however often she was
 * diagnosed. Read for the Owner, never written on the animal's record: it is a pattern, not an accusation.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Early is the first thirty days after arrival: the quarantine the standard playbook keeps a bought animal in. */
export const EARLY_DAYS = 30;

/** One animal the farm bought: who sold her, where, and when she came. */
export interface BoughtIn {
  animalId: string;
  seller: string | null;
  /** The haat as the Buying Trip wrote it; nothing for one bought at the farm gate. */
  haat: string | null;
  arrivedAt: Date;
}

/** One seller's, or one haat's, animals: how many were bought, and how many were lost or fell ill early. */
export interface EarlyLosses {
  name: string;
  bought: number;
  died: number;
  culled: number;
  /** Animals the Vet diagnosed within the early days, each once. */
  diagnosed: number;
}

const earlyAfter = (arrivedAt: Date, at: Date) => {
  const days = (at.getTime() - arrivedAt.getTime()) / DAY_MS;
  return days >= 0 && days < EARLY_DAYS;
};

const counted = (
  bought: readonly BoughtIn[],
  nameOf: (one: BoughtIn) => string | null,
  lost: (one: BoughtIn) => {
    died: boolean;
    culled: boolean;
    diagnosed: boolean;
  }
): EarlyLosses[] => {
  const byName = new Map<string, EarlyLosses>();
  for (const one of bought) {
    const name = nameOf(one)?.trim();
    if (!name) {
      continue;
    }
    const row = byName.get(name) ?? {
      name,
      bought: 0,
      died: 0,
      culled: 0,
      diagnosed: 0,
    };
    const how = lost(one);
    row.bought += 1;
    row.died += how.died ? 1 : 0;
    row.culled += how.culled ? 1 : 0;
    row.diagnosed += how.diagnosed ? 1 : 0;
    byName.set(name, row);
  }
  return [...byName.values()]
    .filter((row) => row.died + row.culled + row.diagnosed > 0)
    .toSorted(
      (a, b) =>
        b.died - a.died ||
        b.culled - a.culled ||
        b.diagnosed - a.diagnosed ||
        b.bought - a.bought ||
        a.name.localeCompare(b.name)
    );
};

/**
 * The animals bought in `from`–`until`, by seller and by haat: those with an early death, cull or Diagnosis, the most
 * lost first. A seller or a haat with none lost early is not named.
 */
export const earlyLosses = (
  bought: readonly BoughtIn[],
  deaths: readonly { animalId: string; kind: "died" | "culled"; at: Date }[],
  diagnoses: readonly { animalId: string; at: Date }[],
  { from, until }: { from: Date; until: Date }
): { bySeller: EarlyLosses[]; byHaat: EarlyLosses[] } => {
  const inTheStretch = bought.filter(
    (one) => one.arrivedAt >= from && one.arrivedAt < until
  );
  const deathOf = new Map(deaths.map((one) => [one.animalId, one]));
  const lost = (one: BoughtIn) => {
    const death = deathOf.get(one.animalId);
    const early = death !== undefined && earlyAfter(one.arrivedAt, death.at);
    return {
      died: early && death?.kind === "died",
      culled: early && death?.kind === "culled",
      diagnosed: diagnoses.some(
        (seen) =>
          seen.animalId === one.animalId && earlyAfter(one.arrivedAt, seen.at)
      ),
    };
  };
  return {
    bySeller: counted(inTheStretch, (one) => one.seller, lost),
    byHaat: counted(inTheStretch, (one) => one.haat, lost),
  };
};
