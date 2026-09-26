import { useLanguage } from "@/i18n/language-provider";

/** Two ends of a figure as one phrase — "৳500 to ৳600" — or the one figure where both ends say the same, since
 *  "৳600 to ৳600" reads as a range that is not there. */
export const useRange = () => {
  const { t } = useLanguage();
  return (low: string, high: string): string =>
    low === high ? low : t("projection.range", { low, high });
};
