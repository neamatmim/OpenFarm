import { roundTaka } from "@OpenFarm/domain";
import type { Language } from "@OpenFarm/i18n";
import { formatNumber } from "@OpenFarm/i18n";

import { useLanguage } from "@/i18n/language-provider";

/**
 * The taka mark with the minus in front of it, never after.
 *
 * `৳-১২,৩৪৫` is how an Owner learns her run lost money by squinting, and a figure that has gone the
 * wrong way should say so before it is read rather than after.
 */
const said = (amount: number, language: Language, figure: number): string =>
  `${amount < 0 ? "−" : ""}৳${formatNumber(figure, language)}`;

/**
 * A sum of money as the reader reads it, to the whole taka.
 *
 * Whole, because the paisa on a sum are noise the farm does not bank in — the Settlement is worked out
 * to the paisa and paid out in taka, and a balance carrying two decimals reads as precision nobody has.
 */
export const saidInTaka = (amount: number, language: Language): string =>
  said(amount, language, Math.abs(Math.round(amount)));

/**
 * A rate as the reader reads it, keeping its paisa.
 *
 * A cost per litre or a cost of gain is not a sum but a figure to compare against another, and rounding
 * it to the taka is what makes two different rates print the same. This is the one place paisa are said.
 */
export const saidToThePaisa = (amount: number, language: Language): string =>
  said(amount, language, Math.abs(roundTaka(amount)));

/** A sum, for a screen that need not ask who is reading. */
export const useTaka = () => {
  const { language } = useLanguage();
  return (amount: number) => saidInTaka(amount, language);
};

/** A rate, for the same. */
export const useTakaToThePaisa = () => {
  const { language } = useLanguage();
  return (amount: number) => saidToThePaisa(amount, language);
};
