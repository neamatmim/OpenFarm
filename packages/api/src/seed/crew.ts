import type { PlaybookKey } from "@OpenFarm/domain";

import type { PersonKey } from "./standing";

/**
 * Who does each piece of the Playbook the seed's farm keeps, and who signs it off — and so which pieces it keeps: the
 * whole Standard Playbook but the anthrax vaccination, which is for a farm where anthrax occurs.
 */
export const CREW = {
  morningMilking: { worker: "milker", checker: "manager" },
  eveningMilking: { worker: "milker", checker: "manager" },
  feeding: { worker: "feeder", checker: "manager" },
  healthRound: { worker: "stockman", checker: "manager" },
  // What the round saw, answered by the Manager: the Vet rung for the urgent, the rest looked at again.
  seeToUnwell: { worker: "manager" },
  seeToUnwellUrgent: { worker: "manager" },
  insemination: { worker: "manager" },
  pregnancyCheck: { worker: "vet" },
  dryOff: { worker: "stockman", checker: "manager" },
  calvingPrep: { worker: "stockman" },
  calvingRecord: { worker: "milker", checker: "manager" },
  // The newborn calf's first hours, done by whoever finds her.
  newbornCalfCare: { worker: "milker", checker: "manager" },
  newbornSecondFeed: { worker: "milker", checker: "manager" },
  weaning: { worker: "stockman", checker: "manager" },
  weighIn: { worker: "stockman", checker: "manager" },
  fmdVaccination: { worker: "stockman", checker: "vet" },
  lsdVaccination: { worker: "stockman", checker: "vet" },
  deworming: { worker: "stockman", checker: "vet" },
  treatmentDose: { worker: "stockman", checker: "manager" },
  burial: { worker: "stockman", checker: "manager" },
  dlsReport: { worker: "manager" },
  // The Manager takes the feed in and counts it; the Owner signs the count off.
  stockCount: { worker: "manager", checker: "owner" },
  biosecurity: { worker: "manager" },
  // The bought-in bull's chain, from his arrival to his sale.
  arrivalCheck: { worker: "stockman", checker: "manager" },
  arrivalDeworming: { worker: "stockman", checker: "vet" },
  arrivalFmd: { worker: "stockman", checker: "vet" },
  arrivalLsd: { worker: "stockman", checker: "vet" },
  hsVaccination: { worker: "stockman", checker: "vet" },
  bqVaccination: { worker: "stockman", checker: "vet" },
  tickSpray: { worker: "stockman", checker: "manager" },
  quarantineRelease: { worker: "manager", checker: "vet" },
  shedDisinfection: { worker: "stockman", checker: "manager" },
  fmdBooster: { worker: "stockman", checker: "vet" },
  dewormBooster: { worker: "stockman", checker: "vet" },
  preSale: { worker: "manager" },
} as const satisfies Partial<
  Record<PlaybookKey, { worker: PersonKey; checker?: PersonKey }>
>;

/** A piece of the Playbook the seed's farm keeps. */
export type SeededKey = keyof typeof CREW;

/** Whether the seed's farm keeps this piece of the Playbook. */
export const isSeeded = (key: string): key is SeededKey => key in CREW;
