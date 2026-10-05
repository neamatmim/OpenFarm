import { useQuery } from "@tanstack/react-query";

import { useT } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

/**
 * What each Investor is called, by id. Every screen that shows a Venture's money shows whose money it
 * was, and an id is not a name — so the one lookup lives here rather than in each sheet.
 */
export const useInvestorNames = () => {
  const t = useT();
  const investors = useQuery(orpc.investors.list.queryOptions());
  const names = new Map(
    (investors.data?.people ?? []).map((one) => [one.id, one.name] as const)
  );
  // The Farm's own capital is held by a record that is no person and on no list: named as the Farm. An answer cached
  // before the Farm could hold Units has none.
  const farmPartnerId = investors.data?.farmPartnerId ?? null;
  return (id: string | null) => {
    if (!id) {
      return "";
    }
    return id === farmPartnerId
      ? t("farmCapital.theFarm")
      : (names.get(id) ?? id);
  };
};
