import type { PlaybookKey } from "@OpenFarm/domain";

import type { PersonKey } from "./standing";

/**
 * Who does each piece of the Playbook the seed's farm keeps, and who signs it off — and so which pieces it keeps. The
 * bought-in bull's chain (arrival, doses on his own days, release, the pre-sale check) is the standard's for a farm to
 * adopt, not the seed's: its herd walks its bulls between Pens by script, and a release walking them too would leave
 * the script's Pens and the farm's apart.
 */
export const CREW = {
  morningMilking: { worker: "milker", checker: "manager" },
  eveningMilking: { worker: "milker", checker: "manager" },
  feeding: { worker: "feeder", checker: "manager" },
  healthRound: { worker: "stockman", checker: "manager" },
  insemination: { worker: "manager" },
  pregnancyCheck: { worker: "vet" },
  dryOff: { worker: "stockman", checker: "manager" },
  calvingPrep: { worker: "stockman" },
  calvingRecord: { worker: "milker", checker: "manager" },
  weighIn: { worker: "stockman", checker: "manager" },
  fmdVaccination: { worker: "stockman", checker: "vet" },
  lsdVaccination: { worker: "stockman", checker: "vet" },
  deworming: { worker: "stockman", checker: "vet" },
  treatmentDose: { worker: "stockman", checker: "manager" },
  burial: { worker: "stockman", checker: "manager" },
  dlsReport: { worker: "manager" },
  stockCount: { worker: "manager" },
  biosecurity: { worker: "manager" },
} as const satisfies Partial<
  Record<PlaybookKey, { worker: PersonKey; checker?: PersonKey }>
>;

/** A piece of the Playbook the seed's farm keeps. */
export type SeededKey = keyof typeof CREW;

/** Whether the seed's farm keeps this piece of the Playbook. */
export const isSeeded = (key: string): key is SeededKey => key in CREW;
