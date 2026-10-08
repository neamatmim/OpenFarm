import {
  farmDayOf,
  monthOf,
  monthlyReportPaper,
  startOfFarmDay,
} from "@OpenFarm/domain";
import { z } from "zod";

import { assertRegistered, recordExport } from "../export-store";
import { farmMonth } from "../farm-clock";
import { protectedProcedure } from "../index";
import { aMonth, monthByMonth } from "../month-store";
import { madeOn } from "../paper-values";
import { OWNER_ONLY, requireOnly, requirePersonalSession } from "../roles";

/** A "YYYY-MM" month's last farm day. */
const lastDayOf = (month: string) =>
  farmDayOf(
    new Date(monthOf(startOfFarmDay(`${month}-01`)).until.getTime() - 1)
  );

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

  /**
   * One month of the farm laid out on paper (`monthlyReportPaper`), for the Owner to print or save, and to hand the
   * accountant: on the Farm Identity letterhead, read in Bangla or English. An **Export**, with the month, its days and
   * the format on the trail, and refused without the farm's DLS registration number, as every Export is. A month still
   * to come is refused. The Owner's alone, from their own phone.
   */
  monthPaper: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ month: farmMonth }))
    .handler(async ({ context, input }) => {
      assertRegistered(context.farm, "the monthly report");
      const now = context.clock.now();
      const one = await aMonth(context.db, context.farm, now, input.month);
      const document = monthlyReportPaper({
        farm: context.farm,
        month: one.month,
        before: one.before,
        soFarTo: one.soFar ? farmDayOf(now) : null,
        figures: one.figures,
        figuresBefore: one.figuresBefore,
        moneyBy: one.moneyBy,
        producedAt: madeOn(now),
        producedBy: context.actor.name,
      });
      // The days it covers: the month, or — still going — to the day it was printed.
      const days = {
        from: `${one.month}-01`,
        to: one.soFar ? farmDayOf(now) : lastDayOf(one.month),
      };
      await recordExport(context, "monthly_report", days, {
        format: "paper",
        month: one.month,
      });
      return { document };
    }),
};
