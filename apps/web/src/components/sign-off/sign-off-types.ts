import type { SopContent } from "@OpenFarm/domain";
import { useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

/** A list the page has asked the farm for, handed to the tab that draws it: what came back, and whether asking failed. */
export interface Asked<T> {
  data: T[] | undefined;
  isError: boolean;
  refetch: () => unknown;
}

/** A piece of work done and waiting for its checker, as the queue reads it. */
export type ToCheck = Awaited<
  ReturnType<typeof orpc.instances.signOffQueue.call>
>[number];

/** A piece of work gone late and still open, as the Overdue list reads it. */
export type LateWork = Awaited<
  ReturnType<typeof orpc.instances.overdue.call>
>[number];

/** Something the farm could not put right on its own, as the review queue reads it. */
export type OpenReview = Awaited<
  ReturnType<typeof orpc.review.open.call>
>[number];

/** SOP content is jsonb, so it arrives untyped; the Version's own shape is the promise. */
export const titleOf = (
  row: { version: { content: unknown } },
  bangla: boolean
) => {
  const { name } = row.version.content as SopContent;
  return bangla ? name.bn : (name.en ?? name.bn);
};

/** What a checked, sent back or missed piece of work changes: the queues themselves, and the notices about them. */
export const useRefreshWork = () => {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: orpc.instances.key() });
    void queryClient.invalidateQueries({ queryKey: orpc.alerts.key() });
  };
};
