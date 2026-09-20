import { useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

/**
 * Refreshes a Venture and the Farm's books together, for an act that moved both.
 *
 * Which acts those are is a question about the server, not about the screen: a Venture's own movements
 * — capital in, a Float out and back, an Advance, a refund — are the Venture's money and the Farm's
 * books say nothing of them. The Farm's books move when the Farm is one of the two sides:
 *
 * - a **Reimbursement**, where the Farm is paid for the feed and medicine it bought;
 * - an **Internal Sale** to or from the Farm, where it sold a bull or bought one — but not one between
 *   two Ventures, where no money of the Farm's moved;
 * - the **buy-back** at wind-up, which is an Internal Sale to the Farm;
 * - the **Farm's share** of a Settlement, which is the one part of it the Farm earned.
 *
 * Said here rather than decided again in each sheet, because it was decided again in each sheet and one
 * of them decided wrong: an Internal Sale left the money screens showing a figure the sale had changed.
 */
export const useRefreshTheBooks = () => {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: orpc.ventures.key() });
    await queryClient.invalidateQueries({ queryKey: orpc.money.key() });
  };
};
