import { protectedProcedure } from "../index";
import { monthByMonth } from "../month-store";
import { OWNER_ONLY, requireOnly } from "../roles";

/** The monthly report: how the farm did each month over the last year. */
export const monthlyReportRouter = {
  /**
   * How the farm has done month by month over the last year (`monthByMonth`): the Farm's money in and out, the milk
   * sold against what the dairy cows cost, the fattening animals sold and their Margins, and each Venture against its
   * plan. The Owner's alone, as the Margins and the Ventures are.
   */
  get: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .handler(({ context }) =>
      monthByMonth(context.db, context.farm, context.clock.now())
    ),
};
