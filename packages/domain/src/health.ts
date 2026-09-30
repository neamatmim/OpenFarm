import { underMilkWithdrawal } from "./milk";

/**
 * What the farm may prescribe, and what it may not — and what a Treatment holds back once it
 * has been given.
 *
 * A product with either withdrawal figure blank cannot be prescribed. That is not a
 * technicality: the withdrawal days are the only thing standing between a treated cow and
 * the bulk tank, and a farm that guesses them is a farm selling milk it cannot say is safe.
 */
export interface WithdrawalDays {
  milkWithdrawalDays: number | null;
  meatWithdrawalDays: number | null;
  retiredAt?: Date | null;
}

/** Why a product may not be prescribed. A reason rather than a sentence: the words belong
 *  to whoever is reading, and this package has no language of its own. */
export type NotPrescribable = "no_withdrawal_days" | "retired";

/** The longest a withdrawal is ever going to be. Beyond this it is a typo, not a product. */
export const MAX_WITHDRAWAL_DAYS = 365;

/**
 * Why this product may not be prescribed, or null when it may.
 *
 * One answer, asked by the list that shows the product and by the refusal when somebody
 * tries to prescribe from it — so the screen and the server cannot give different reasons
 * for the same thing.
 */
export const whyNotPrescribable = (
  product: WithdrawalDays
): NotPrescribable | null => {
  if (product.retiredAt) {
    return "retired";
  }
  if (
    product.milkWithdrawalDays === null ||
    product.meatWithdrawalDays === null
  ) {
    return "no_withdrawal_days";
  }
  return null;
};

export const mayBePrescribed = (product: WithdrawalDays): boolean =>
  whyNotPrescribable(product) === null;

/** What is wrong with the days somebody has entered. */
export const findWithdrawalProblems = (days: {
  milkWithdrawalDays: number;
  meatWithdrawalDays: number;
}): string[] => {
  const problems: string[] = [];
  for (const [what, value] of [
    ["milk", days.milkWithdrawalDays],
    ["meat", days.meatWithdrawalDays],
  ] as const) {
    if (!Number.isInteger(value) || value < 0 || value > MAX_WITHDRAWAL_DAYS) {
      problems.push(
        `${what}: whole days, from none up to ${MAX_WITHDRAWAL_DAYS}`
      );
    }
  }
  return problems;
};

/**
 * How a dose goes in. The same list as the column's own enum in the schema — the database
 * package does not depend on this one, so both say it, as milk's destinations do.
 */
export const ROUTES = [
  "intramuscular",
  "intravenous",
  "subcutaneous",
  "oral",
  "intramammary",
  "topical",
] as const;
export type DoseRoute = (typeof ROUTES)[number];

/** A course may not run for ever: a Prescription is a treatment, not a regime. */
export const MAX_COURSE_DAYS = 30;
/** Four times a day is as often as a farm gives anything by hand. */
export const MAX_TIMES_A_DAY = 4;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Is she still inside her meat Withdrawal? The twin of `underMilkWithdrawal`, which lives
 *  with the milk it holds back. She comes off at the instant it names, like its twin. */
export const underMeatWithdrawal = (
  animal: { meatWithdrawalUntil: Date | null },
  now: Date
): boolean =>
  animal.meatWithdrawalUntil !== null &&
  animal.meatWithdrawalUntil.getTime() > now.getTime();

/**
 * When a Withdrawal that started with this dose ends: the dose plus the product's own days.
 *
 * Counted from the dose actually given, which is why a course cut short and a course finished
 * late end on different days — and why the farm works this out from the Treatments rather
 * than from the Prescription that planned them.
 */
export const withdrawalEndsAt = (givenAt: Date, days: number): Date =>
  new Date(givenAt.getTime() + days * DAY_MS);

/** Both of a cow's Withdrawals as every screen shows them, and the Vet's shortening if there
 *  was one. Derived in one place so her page, the Manager's queue and increment 4's Sale all
 *  read the same dates. */
export interface WithdrawalView {
  underMilkWithdrawal: boolean;
  milkWithdrawalUntil: Date | null;
  underMeatWithdrawal: boolean;
  /** The day she is fit for sale again. Null when nothing holds her. */
  meatWithdrawalUntil: Date | null;
  shortened: {
    at: Date;
    reason: string | null;
    /** What her doses alone said, before the Vet shortened it — the figure a slaughter vet
     *  asks about, kept where the page can show it rather than only in the trail. */
    wasMilkUntil: Date | null;
    wasMeatUntil: Date | null;
  } | null;
}

export const withdrawalView = (
  animal: {
    milkWithdrawalUntil: Date | null;
    meatWithdrawalUntil: Date | null;
    milkWithdrawalFromDoses: Date | null;
    meatWithdrawalFromDoses: Date | null;
    withdrawalShortenedAt: Date | null;
    withdrawalShortenedReason: string | null;
  },
  now: Date
): WithdrawalView => ({
  underMilkWithdrawal: underMilkWithdrawal(animal, now),
  milkWithdrawalUntil: animal.milkWithdrawalUntil,
  underMeatWithdrawal: underMeatWithdrawal(animal, now),
  meatWithdrawalUntil: animal.meatWithdrawalUntil,
  shortened: animal.withdrawalShortenedAt
    ? {
        at: animal.withdrawalShortenedAt,
        reason: animal.withdrawalShortenedReason,
        wasMilkUntil: animal.milkWithdrawalFromDoses,
        wasMeatUntil: animal.meatWithdrawalFromDoses,
      }
    : null,
});

/**
 * How far back a buyer's summary looks. Thirty days is what the report set asks for, and it is
 * longer than any withdrawal the farm's own products carry — so a beast clear today with nothing
 * in her last thirty days has nothing to declare at all.
 */
export const WITHDRAWAL_LOOK_BACK_DAYS = 30;

const DAY_MS_ILL = 24 * 60 * 60 * 1000;

/** An animal the Vet has diagnosed again and again, as the Manager's list names her. */
export interface IllAgain {
  animalId: string;
  /** How many Diagnoses in the farm's days. */
  diagnoses: number;
  /** The latest of them: what she had, and when. */
  lastDisease: string;
  lastAt: Date;
}

/**
 * The animals diagnosed at least the farm's number of times within its days: a cost the farm keeps paying, for the
 * Manager to put in front of the Owner (the Owner, 2026-09-29: a list first, not a Cull Reason). Most diagnosed first,
 * then the most lately. Pure — whose Diagnoses they are is the caller's to say.
 */
export const illAgainOf = (
  diagnoses: readonly {
    animalId: string;
    disease: string;
    diagnosedAt: Date;
  }[],
  now: Date,
  farm: { illAgainDiagnoses: number; illAgainDays: number }
): IllAgain[] => {
  const since = now.getTime() - farm.illAgainDays * DAY_MS_ILL;
  const byAnimal = new Map<string, IllAgain>();
  for (const one of diagnoses) {
    if (one.diagnosedAt.getTime() < since || one.diagnosedAt > now) {
      continue;
    }
    const known = byAnimal.get(one.animalId);
    const later = !known || one.diagnosedAt > known.lastAt;
    byAnimal.set(one.animalId, {
      animalId: one.animalId,
      diagnoses: (known?.diagnoses ?? 0) + 1,
      lastDisease: later ? one.disease : (known?.lastDisease ?? one.disease),
      lastAt: later ? one.diagnosedAt : (known?.lastAt ?? one.diagnosedAt),
    });
  }
  return [...byAnimal.values()]
    .filter((one) => one.diagnoses >= farm.illAgainDiagnoses)
    .toSorted(
      (a, b) =>
        b.diagnoses - a.diagnoses ||
        b.lastAt.getTime() - a.lastAt.getTime() ||
        a.animalId.localeCompare(b.animalId)
    );
};
