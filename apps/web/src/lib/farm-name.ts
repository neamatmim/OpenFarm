import { useQuery } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

/** The farm's name, for its own doors before anybody signs in; nothing before the farm is set up, or while it loads. */
export const useFarmName = (): string | null => {
  const door = useQuery(orpc.farm.door.queryOptions());
  return door.data?.farmName ?? null;
};
