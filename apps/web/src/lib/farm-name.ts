import { useQuery } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

/** The farm's name, for its own doors before anybody signs in; nothing before the farm is set up, or while it loads. */
export const useFarmName = (): string | null => {
  const door = useQuery(orpc.farm.door.queryOptions());
  return door.data?.farmName ?? null;
};

/** Whether the farm has said there is no farm yet: the first run, when whoever opens the first account becomes its
 *  Owner. Not while the answer is still coming — a sign-in that flashed the first-run words would mislead everybody. */
export const useNoFarmYet = (): boolean => {
  const door = useQuery(orpc.farm.door.queryOptions());
  return door.data !== undefined && door.data.farmName === null;
};
