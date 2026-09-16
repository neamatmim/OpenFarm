import type { DoseGiven, PenSpell, ShortenedHold } from "@OpenFarm/domain";
import { withdrawalEndsAt } from "@OpenFarm/domain";
import type { Language } from "@OpenFarm/i18n";
import { formatDate, formatNumber } from "@OpenFarm/i18n";

import type { HerArrival, HerPenSpell, HerWithdrawal } from "./animal-record";

// How a paper says what her record holds. The record keeps dates and figures; a paper is read by a buyer or a
// slaughter vet, in both languages, so the words are here rather than in the record every reader shares.

/** What the farm says about her hold today, and whether a Vet cut it short. */
export const herWithdrawalWords = (
  view: HerWithdrawal,
  language: Language
): {
  clear: boolean;
  clearOn: string | null;
  shortened: ShortenedHold | null;
} => ({
  clear: !view.underMeatWithdrawal,
  clearOn: view.meatWithdrawalUntil
    ? formatDate(view.meatWithdrawalUntil, language, "date")
    : null,
  shortened: view.shortened
    ? {
        on: formatDate(view.shortened.at, language, "date"),
        reason: view.shortened.reason,
        wouldHaveRunTo: view.shortened.wasMeatUntil
          ? formatDate(view.shortened.wasMeatUntil, language, "date")
          : null,
      }
    : null,
});

/** Where she came from, in words rather than a column value. */
export const sourceWords = (arrival: HerArrival | null): string => {
  if (arrival?.how !== "bought") {
    return "খামারে জন্ম / born here";
  }
  // Bought, and the farm may or may not have written down from whom.
  return arrival.intake?.seller
    ? `${arrival.intake.seller.name} থেকে কেনা / bought from`
    : "কেনা / bought";
};

/** Her age as the farm can say it: from her birth date if it knows one, and otherwise from what
 *  the seller said at Intake, which is a judgement and is labelled as one. */
export const ageWords = (
  her: { birthDate: Date | null; arrival: HerArrival | null },
  language: Language
): string | null => {
  if (her.birthDate) {
    return formatDate(her.birthDate, language, "date");
  }
  const intake = her.arrival?.intake;
  return intake
    ? `আনুমানিক ${formatNumber(intake.estimatedAgeMonths, language)} মাস (আসার সময়) / estimated at intake`
    : null;
};

/** Her Pen Spells as a paper prints them: newest first, the way she is read back. */
export const penSpellWords = (
  spells: readonly HerPenSpell[],
  language: Language
): PenSpell[] =>
  spells.toReversed().map((spell) => ({
    penName: spell.pen.name,
    from: formatDate(spell.from, language, "date"),
    until: spell.until ? formatDate(spell.until, language, "date") : null,
  }));

/** One dose, as either paper reports it. */
export const doseWords = (
  dose: {
    givenAt: Date;
    product: { nameBn: string; meatWithdrawalDays: number | null };
    giver: { name: string } | null;
    prescription: { vet: { name: string } | null } | null;
  },
  language: Language
): DoseGiven => ({
  productName: dose.product.nameBn,
  givenOn: formatDate(dose.givenAt, language, "date"),
  // What this dose alone held her for, which is not the same as what she is held for today: a
  // Vet may have cut the hold short, and the papers say so where they say she is clear.
  meatClearOn: dose.product.meatWithdrawalDays
    ? formatDate(
        withdrawalEndsAt(dose.givenAt, dose.product.meatWithdrawalDays),
        language,
        "date"
      )
    : null,
  prescribedBy: dose.prescription?.vet?.name ?? null,
  givenBy: dose.giver?.name ?? null,
});
