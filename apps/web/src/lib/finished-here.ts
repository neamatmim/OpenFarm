import { useQuery } from "@tanstack/react-query";

import { phoneOutbox } from "@/lib/outbox-client";

const NOTHING: ReadonlySet<string> = new Set();

/**
 * The work this phone has finished and the farm has not yet heard of: its Finish is still in the Outbox. The day's list
 * counts it done at once, in a shed with no signal, rather than offering it again until the phone is back in range.
 * Kept under the Outbox's key, so whatever puts an entry in or sends one out reads it afresh. Read only where the day's
 * work is shown or counted (`enabled`): every other page has no use for it.
 */
export const useFinishedHere = (enabled = true): ReadonlySet<string> => {
  const finished = useQuery({
    enabled,
    queryKey: ["outbox", "finished-here"],
    queryFn: async () => {
      const entries = (await phoneOutbox()?.pending()) ?? [];
      return entries.flatMap((entry) =>
        entry.kind === "instance_complete" ? [entry.body.instanceId] : []
      );
    },
    networkMode: "always",
    refetchInterval: 15_000,
  });
  return finished.data ? new Set(finished.data) : NOTHING;
};
