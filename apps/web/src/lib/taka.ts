import { formatNumber } from "@OpenFarm/i18n";

import { useLanguage } from "@/i18n/language-provider";

/**
 * Taka as the reader reads them, in the reader's own numerals.
 *
 * The minus goes in front of the taka mark and not after it: `৳-১২,৩৪৫` is how an Owner learns her run
 * lost money by squinting, and a figure that has gone the wrong way should say so before it is read.
 */
export const useTaka = () => {
  const { language } = useLanguage();
  return (amount: number) =>
    `${amount < 0 ? "−" : ""}৳${formatNumber(Math.abs(Math.round(amount)), language)}`;
};
