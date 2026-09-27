import { protectedProcedure } from "../index";
import { returnsPage } from "../returns-store";
import { OWNER_ONLY, requireOnly } from "../roles";

/**
 * What the money in the farm's cattle returned: the Owner's Returns page. Each Season of the Farm's own fattening
 * cattle and each Venture, worked as a Settlement is. The Owner's alone, as an animal's money is.
 */
export const returnsRouter = {
  page: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .handler(({ context }) =>
      returnsPage(context.db, context.farm, context.clock.now())
    ),
};
