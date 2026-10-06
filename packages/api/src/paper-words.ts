import type {
  DoseGiven,
  PenSpellLine,
  ShortenedHold,
  WithdrawalView,
} from "@OpenFarm/domain";
import { withdrawalEndsAt } from "@OpenFarm/domain";
import type { Language } from "@OpenFarm/i18n";
import { formatDate, formatNumber } from "@OpenFarm/i18n";

import type { HerPenSpell } from "./animal-record";
import { meatDaysOf } from "./health-store";

// How a paper says what her record holds. The record keeps dates and figures; a paper is read by a buyer or a
// slaughter vet, in both languages, so the words are here rather than in the record every reader shares.

/** What the farm says about her hold today, and whether a Vet cut it short. */
export const herWithdrawalWords = (
  view: WithdrawalView,
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

/** Where she came from, in words rather than a column value: what the farm says of her, not how the Move that
 *  brought her in was written — an animal bought before the farm kept records was bought all the same. */
export const sourceWords = (her: {
  source: string;
  intake: { seller: { name: string } | null } | null;
}): string => {
  if (her.source !== "bought") {
    return "খামারে জন্ম / born here";
  }
  // Bought, and the farm may or may not have written down from whom.
  return her.intake?.seller
    ? `${her.intake.seller.name} থেকে কেনা / bought from`
    : "কেনা / bought";
};

/** Her sex as the farm's Bangla paper says it, with the English beside it — never the record's own English word. */
export const sexWords = (sex: string): string =>
  sex === "female" ? "স্ত্রী / female" : "পুরুষ / male";

const LEFT_WORDS: Record<string, string> = {
  died: "মারা গেছে / died",
  culled: "বাদ দেওয়া / culled",
  lost: "হারিয়ে গেছে / lost",
};

/** How she left, and the day, for any way out but a Sale — whose paper says where she went instead. Nothing while she
 *  is here. Every paper says it the same way (CONTEXT: Exit). */
export const leftWords = (
  exit: { how: string; at: Date } | null,
  language: Language
): string | null => {
  const said = exit ? LEFT_WORDS[exit.how] : undefined;
  return exit && said
    ? `${said} · ${formatDate(exit.at, language, "date")}`
    : null;
};

/** Her age as the farm can say it: from her birth date if it knows one, and otherwise from what
 *  the seller said at Intake, which is a judgement and is labelled as one. */
export const ageWords = (
  her: {
    birthDate: Date | null;
    intake: { estimatedAgeMonths: number } | null;
  },
  language: Language
): string | null => {
  if (her.birthDate) {
    return formatDate(her.birthDate, language, "date");
  }
  const { intake } = her;
  return intake
    ? `আনুমানিক ${formatNumber(intake.estimatedAgeMonths, language)} মাস (আসার সময়) / estimated at intake`
    : null;
};

/** Her Pen Spells as a paper prints them: newest first, the way she is read back. */
export const penSpellWords = (
  spells: readonly HerPenSpell[],
  language: Language
): PenSpellLine[] =>
  spells.toReversed().map((spell) => ({
    penName: spell.pen.name,
    from: formatDate(spell.from, language, "date"),
    until: spell.until ? formatDate(spell.until, language, "date") : null,
  }));

/** One dose, as either paper reports it. */
export const doseWords = (
  dose: {
    givenAt: Date;
    /** The days kept on the dose when it was given, which the gate reads (health-store's `meatDaysOf`). */
    meatWithdrawalDays: number | null;
    /** Who advised a dose given without a Prescription, and why; nothing for the others. */
    advice: string | null;
    /** The work it was given under: nothing for a dose not prescribed, which no work asked for. */
    instanceId: string | null;
    product: { nameBn: string; meatWithdrawalDays: number | null };
    giver: { name: string } | null;
    prescription: { vet: { name: string } | null } | null;
  },
  language: Language
): DoseGiven => {
  // What this dose alone held her for, which is not the same as what she is held for today: a Vet may have cut the hold
  // short, and the papers say so where they say she is clear. Read as the gate reads it — the days kept on the dose — so
  // a product's days lowered since cannot make the paper say clear where the gate says held.
  const days = meatDaysOf(dose);
  return {
    productName: dose.product.nameBn,
    givenOn: formatDate(dose.givenAt, language, "date"),
    meatClearOn: days
      ? formatDate(withdrawalEndsAt(dose.givenAt, days), language, "date")
      : null,
    prescribedBy: dose.prescription?.vet?.name ?? null,
    advice: dose.instanceId === null ? (dose.advice ?? "") : null,
    givenBy: dose.giver?.name ?? null,
  };
};
