import { cullList } from "../cull-store";
import { protectedProcedure } from "../index";
import { OWNER_ONLY, requireOnly, requirePersonalSession } from "../roles";

export const cullListRouter = {
  /**
   * Every dairy cow in milk or dry, and every Repeat Breeder, with the Cull Reasons the farm has to name her: her milk
   * against her keep, empty long after calving or dry and empty, or not settling (`cullList`). The Owner's alone, as an
   * animal's money is, and nothing to answer: a cow leaves the list when the facts under her change.
   */
  list: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .handler(
      async ({ context }) =>
        await cullList(context.db, context.farm, context.clock.now())
    ),
};
