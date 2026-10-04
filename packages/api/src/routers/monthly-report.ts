import { z } from "zod";

import { protectedProcedure } from "../index";
import { monthByMonth } from "../month-store";
import { OWNER_ONLY, requireOnly } from "../roles";

/** The monthly report: how the farm did each month over the last year, or over a financial year it asks for. */
export const monthlyReportRouter = {
  /**
   * How the farm has done month by month (`monthByMonth`) over the last twelve months, or over a financial year named
   * by the calendar year it began in (ADR 0016): the Farm's money in and out, the milk sold against what the dairy
   * cows cost, the fattening animals sold and their Margins, and each Venture against its plan. A year still to come
   * is refused. The Owner's alone, as the Margins and the Ventures are.
   */
  get: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .input(
      z
        .object({
          financialYear: z.number().int().min(2000).max(9999).optional(),
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
};
