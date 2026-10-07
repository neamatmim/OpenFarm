import { eq } from "@OpenFarm/db/operators";
import { feedItem } from "@OpenFarm/db/schema/feed";
import { scratchDb } from "@OpenFarm/test-harness";

/**
 * Takes a test's feed out of every Stock Count the rest of its file makes, stock and all. The farm retires a feed only
 * once a count brings it to nothing, so a test that only wants its lorry out of later counts sets it aside here, as
 * setup, rather than through a retirement the farm would refuse.
 */
export const setFeedAside = async (feedItemId: string) => {
  await scratchDb()
    .update(feedItem)
    .set({ retiredAt: new Date() })
    .where(eq(feedItem.id, feedItemId));
};
