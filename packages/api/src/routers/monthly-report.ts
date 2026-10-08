import { z } from "zod";

import { farmMonth } from "../farm-clock";
import { protectedProcedure } from "../index";
import { aMonth, monthByMonth } from "../month-store";
import { OWNER_ONLY, requireOnly } from "../roles";

/** The monthly report: how the farm did each month over the last year, or over a financial year it asks for. */
export const monthlyReportRouter = {
  /**
   * How the farm has done month by month (`monthByMonth`) over the last twelve months, or over a financial year named
   * by the month it began in, "YYYY-MM" (ADR 0016, 0017): the Farm's money in and out, the milk sold against what the dairy
   * cows cost, the fattening animals sold and their Margins, and each Venture against its plan. A month no year begins
   * in, or a year still to come, is refused. The Owner's alone, as the Margins and the Ventures are.
   */
  get: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .input(
      z
        .object({
          financialYear: farmMonth.optional(),
        })
        .optional()
    )
    .handler(({ context, input }) =>
      monthByMonth(
        context.db,
        context.farm,
        context.clock.now(),
        input?.financialYear
      )
    ),

  /**
   * One month of the farm (`aMonth`), named "YYYY-MM": its figures beside the month before's, its money by Category and
   * by Side, the months there are to read and the Ventures that ran in it. A month still to come is refused. The
   * Owner's alone, as the monthly report is.
   */
  month: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .input(z.object({ month: farmMonth }))
    .handler(({ context, input }) =>
      aMonth(context.db, context.farm, context.clock.now(), input.month)
    ),
};
