import { farmDayOf, startOfFarmDay } from "./farm-clock";

/**
 * The word an Observation uses for oestrus. An Observation that says this is a **Heat**.
 *
 * A fixed word rather than a meaning somebody attaches to a choice, because the Version's choices
 * are the author's to reword and reorder, and the farm has to be able to tell a Heat from "off her
 * feed" in a record written three seasons ago. The Observation's `saw` was built to be this stable
 * word (increment 2), so Breeding reads it rather than inventing a second one.
 */
export const HEAT = "heat";

/**
 * The farm event a Service is. The work it raises — the Pregnancy Check — falls due the farm's
 * number of days after the attempt's first service, not after every service.
 */
export const SERVICE = "service";

const HOUR_MS = 60 * 60 * 1000;

/**
 * When the AI work a Heat raises falls due, and how long it has before it is late.
 *
 * A service takes in a window after the heat is seen, not at an instant — so the work is due at
 * the window's start and late at its end. Both ends are Farm Parameters: how soon a technician can
 * reach the farm is a fact about this farm, not about cattle.
 */
export const aiWindow = (
  seenAt: Date,
  window: { startHours: number; endHours: number }
): { dueAt: Date; graceMinutes: number } => ({
  dueAt: new Date(seenAt.getTime() + window.startHours * HOUR_MS),
  graceMinutes: (window.endHours - window.startHours) * 60,
});

/**
 * Two sightings closer than this are the same heat.
 *
 * A standing heat lasts most of a day and its signs longer, so a cow marked on the evening round
 * and again the next morning has been seen once, twice. A cow returns to heat about three weeks
 * later, which is far outside it. Not a Farm Parameter: this is a fact about cattle, not about
 * this farm.
 */
export const SAME_HEAT_WITHIN_HOURS = 48;

/**
 * The first of each run of one cow's records closer together than a heat: every record that is not
 * within `SAME_HEAT_WITHIN_HOURS` of the one that began her current run. Measured from the record
 * that began the run, not from the last one: a cow marked every day for a week is not one long heat,
 * and chaining would let a run of records hide the fact.
 */
const firstOfEachHeat = <Entry extends { id: string; animalId: string }>(
  entries: Entry[],
  at: (entry: Entry) => Date
): Entry[] => {
  const ordered = entries.toSorted(
    (a, b) =>
      a.animalId.localeCompare(b.animalId) ||
      at(a).getTime() - at(b).getTime() ||
      a.id.localeCompare(b.id)
  );
  const begun: Entry[] = [];
  let began: Entry | undefined;
  for (const entry of ordered) {
    const sameHeat =
      began !== undefined &&
      began.animalId === entry.animalId &&
      at(entry).getTime() - at(began).getTime() <
        SAME_HEAT_WITHIN_HOURS * HOUR_MS;
    if (!sameHeat) {
      begun.push(entry);
      began = entry;
    }
  }
  return begun;
};

/**
 * Which sightings begin a heat, and so which raise work.
 *
 * Decided from the sightings themselves and not from whatever work happens to be open, because
 * the open work is the wrong thing to ask. A cow served on the morning of her heat and seen again
 * that evening has no open job — and the evening sighting must still raise nothing. Two sightings
 * that reach the farm together from a phone that had no signal must raise one job, not two. Only
 * the sightings can say that, and they say it the same way however late they arrive.
 */
export const heatsThatBegin = <
  Sighting extends {
    id: string;
    animalId: string;
    seenAt: Date;
  },
>(
  sightings: Sighting[]
): Sighting[] => firstOfEachHeat(sightings, (sighting) => sighting.seenAt);

/**
 * Which services begin an attempt: the first a cow was given in each heat.
 *
 * The farm sometimes serves a cow twice in one heat — at twelve hours and again at twenty-four — and
 * those are one attempt, not two (Owner, 2026-09-13). The Pregnancy Check falls due from the first,
 * and a heat whose services did not take is one failure: counted per service, a cow served twice
 * every heat would be a Repeat Breeder a whole cycle early. Told apart by time rather than by the
 * Heat each answered, because a bull running with the herd serves cows nobody saw in heat.
 */
export const attemptsThatBegin = <
  Served extends {
    id: string;
    animalId: string;
    servedAt: Date;
  },
>(
  services: Served[]
): Served[] => firstOfEachHeat(services, (served) => served.servedAt);

/**
 * How a cow is served. Fixed words, like `HEAT`: the Step offering the choice may call them what
 * the farm calls them, but the record has to say which of the two it was in a way Breeding can
 * still read when a Pregnancy Check and a Calving look back at it.
 */
export const SERVICE_METHODS = ["ai", "natural"] as const;
export type ServiceMethod = (typeof SERVICE_METHODS)[number];

export const isServiceMethod = (value: string): value is ServiceMethod =>
  (SERVICE_METHODS as readonly string[]).includes(value);

/**
 * What a Pregnancy Check found. Fixed words for the same reason a Heat is one: the Step may word
 * the choice as the Vet likes, but Breeding has to read the answer seasons later.
 */
export const PREGNANCY_CHECK_RESULTS = ["positive", "negative"] as const;
export type PregnancyCheckResult = (typeof PREGNANCY_CHECK_RESULTS)[number];

export const isPregnancyCheckResult = (
  value: string
): value is PregnancyCheckResult =>
  (PREGNANCY_CHECK_RESULTS as readonly string[]).includes(value);

/**
 * The attempt a service belongs to: the first service of the heat it was given in — itself, or the
 * latest attempt begun before it.
 */
export const attemptOf = <
  Served extends { id: string; animalId: string; servedAt: Date },
>(
  services: Served[],
  serviceId: string
): Served | null => {
  const one = services.find((each) => each.id === serviceId);
  if (!one) {
    return null;
  }
  return (
    attemptsThatBegin(
      services.filter((each) => each.animalId === one.animalId)
    ).findLast((attempt) => attempt.servedAt <= one.servedAt) ?? null
  );
};

/**
 * Her attempts that did not take — what a Repeat Breeder is counted from, and what the Manager is
 * shown when she is raised as one.
 *
 * An attempt failed when the Vet's latest word on it is negative, or when nobody found her carrying
 * from it and she was served again: a cow back in heat three weeks later has answered the question
 * before the Vet was due to ask it. One attempt is one failure however many times she was served in
 * that heat. An attempt still waiting for its check has not failed yet.
 */
export const attemptsThatFailed = <
  Served extends { id: string; animalId: string; servedAt: Date },
>(
  /** One cow's services, the ones that did not take included. */
  services: Served[],
  checks: {
    id: string;
    serviceId: string;
    result: PregnancyCheckResult;
    checkedAt: Date;
  }[]
): Served[] => {
  const attempts = attemptsThatBegin(services);
  const latestWord = new Map<string, PregnancyCheckResult>();
  const newestFirst = checks.toSorted(
    (a, b) =>
      b.checkedAt.getTime() - a.checkedAt.getTime() || b.id.localeCompare(a.id)
  );
  for (const check of newestFirst) {
    const attempt = attemptOf(services, check.serviceId);
    if (attempt && !latestWord.has(attempt.id)) {
      latestWord.set(attempt.id, check.result);
    }
  }
  return attempts.filter((attempt, index) => {
    const word = latestWord.get(attempt.id);
    const servedAgain = index < attempts.length - 1;
    return word === "negative" || (word === undefined && servedAgain);
  });
};

/** How many of her attempts did not take. */
export const failedAttempts = (
  services: { id: string; animalId: string; servedAt: Date }[],
  checks: Parameters<typeof attemptsThatFailed>[1]
): number => attemptsThatFailed(services, checks).length;

/**
 * What the person answering a Repeat Breeder decided: to serve her again, to treat her first, or to
 * cull her. Recorded as a decision and nothing more — a cull decided here is still a Sale or a
 * Mortality somebody records when she goes.
 */
export const REPEAT_BREEDER_DECISIONS = [
  "serve_again",
  "treat",
  "cull",
] as const;
export type RepeatBreederDecision = (typeof REPEAT_BREEDER_DECISIONS)[number];

/**
 * Whether a cow should be on the Manager's queue as a Repeat Breeder: failed at least the farm's
 * threshold of attempts, and failed again since anybody last answered for her. A cow found carrying
 * again is not a question any more.
 */
export const isRepeatBreeder = ({
  failed,
  threshold,
  answeredAtFailures,
  carrying,
}: {
  failed: number;
  threshold: number;
  /** How many failures she had when somebody last answered, or null if nobody has. */
  answeredAtFailures: number | null;
  carrying: boolean;
}): boolean =>
  !carrying &&
  failed >= threshold &&
  (answeredAtFailures === null || failed > answeredAtFailures);

const DAY_MS = 24 * HOUR_MS;

/**
 * How a calving went, what each calf was, and whether it was born alive. Fixed words, like a Heat's:
 * the Step's labels are the farm's to write, but the calving history is read back seasons later.
 */
export const CALVING_EASES = ["unassisted", "assisted", "vet"] as const;
export type CalvingEase = (typeof CALVING_EASES)[number];
export const CALF_SEXES = ["female", "male"] as const;
export type CalfSex = (typeof CALF_SEXES)[number];
export const CALF_OUTCOMES = ["alive", "stillborn"] as const;
export type CalfOutcome = (typeof CALF_OUTCOMES)[number];

/** Who records a Calving (roles matrix: Breeding — Calving is `C R U` to the Manager and `C` to Barn
 *  Staff as an SOP step). */
export const CALVING_RECORDERS = ["staff", "manager"] as const;

/** The States a cow who calves may be in: carrying her first, dried off for this one, or — a dry-off
 *  that never happened — still in milk. */
export const MAY_CALVE_FROM = ["pregnant_heifer", "dry", "milking"] as const;

/**
 * The work Expected Calving pulls towards it, each named for the Farm Parameter that says how long
 * before her Expected Calving: drying her off, and walking her to the calving pen. The days are the farm's,
 * set once for every cow, so a procedure names which lead it keeps rather than a number of its own.
 */
export const CALVING_LEADS = ["dry_off", "calving_prep"] as const;
export type CalvingLead = (typeof CALVING_LEADS)[number];

export const isCalvingLead = (value: string): value is CalvingLead =>
  (CALVING_LEADS as readonly string[]).includes(value);

/**
 * When work a lead ahead of her calving falls due: the farm's day that many days before she is
 * expected. A day's work, like anything counted in days — not an appointment at whatever hour a
 * service happened to be.
 */
export const calvingWorkDue = (
  expectedCalvingAt: Date,
  leadDays: number
): Date =>
  startOfFarmDay(
    farmDayOf(new Date(expectedCalvingAt.getTime() - leadDays * DAY_MS))
  );

/**
 * When she is expected to calve: the attempt's first service, carried the farm's gestation on.
 * Worked out, never typed — a correction to the day she was served moves it with the service.
 */
export const expectedCalvingFrom = (
  servedAt: Date,
  gestationDays: number
): Date => new Date(servedAt.getTime() + gestationDays * DAY_MS);
