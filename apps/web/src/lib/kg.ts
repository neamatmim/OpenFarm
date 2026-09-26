import { formatNumber } from "@OpenFarm/i18n";

import { useLanguage } from "@/i18n/language-provider";

/** A weight as the reader reads it — "২৪০ কেজি", "240 kg" — in the one spelling every screen shares. */
export const useKg = () => {
  const { t, language } = useLanguage();
  return (value: number): string =>
    t("units.kg", { kg: formatNumber(value, language) });
};
