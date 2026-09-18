import { useQuery } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

/**
 * What each Investor is called, by id. Every screen that shows a Venture's money shows whose money it
 * was, and an id is not a name — so the one lookup lives here rather than in each sheet.
 */
export const useInvestorNames = () => {
  const investors = useQuery(orpc.investors.list.queryOptions());
  const names = new Map(
    (investors.data?.people ?? []).map((one) => [one.id, one.name] as const)
  );
  return (id: string | null) => (id ? (names.get(id) ?? id) : "");
};
