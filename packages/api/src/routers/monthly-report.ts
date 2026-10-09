import type { MonthlyReportFacts } from "@OpenFarm/domain";
import {
  farmDayOf,
  monthOf,
  monthlyReportPaper,
  monthlyReportRows,
  startOfFarmDay,
} from "@OpenFarm/domain";
import { z } from "zod";

import type { Context } from "../context";
import { toCsv } from "../csv";
import { stampedFileName } from "../export-name";
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

/** Whoever makes a month's Export, signed in on their farm: the procedures that make one say who may. */
type ExportingContext = Context & {
  farm: NonNullable<Context["farm"]>;
  actor: { name: string };
};

/**
 * One month of the farm as an Export is made from it: refused first without the farm's DLS registration number, then
 * the month's facts for the paper and the CSV alike, and the days it covers — the month, or, still going, to today.
 */
const monthToExport = async (context: ExportingContext, month: string) => {
  assertRegistered(context.farm, "the monthly report");
  const now = context.clock.now();
  const one = await aMonth(context.db, context.farm, now, month);
  const facts: MonthlyReportFacts = {
    farm: context.farm,
    month: one.month,
    before: one.before,
    soFarTo: one.soFar ? farmDayOf(now) : null,
    figures: one.figures,
    figuresBefore: one.figuresBefore,
    moneyBy: one.moneyBy,
    producedAt: madeOn(now),
    producedBy: context.actor.name,
  };
  const days = {
    from: `${one.month}-01`,
    to: one.soFar ? farmDayOf(now) : lastDayOf(one.month),
  };
  return { facts, days, now };
};

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
   * accountant: on the Farm Identity letterhead, read in Bangla or English. An **Export**, with the month, the days it
   * covers and the format on the trail, and refused without the farm's DLS registration number, as every Export is. A
   * month still to come is refused. The Owner's alone, from their own phone.
   */
  monthPaper: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ month: farmMonth }))
    .handler(async ({ context, input }) => {
      const { facts, days } = await monthToExport(context, input.month);
      const document = monthlyReportPaper(facts);
      await recordExport(context, "monthly_report", days, {
        format: "paper",
        month: facts.month,
      });
      return { document };
    }),

  /**
   * The same month as a CSV for the accountant (`monthlyReportRows`): a row a figure, the paper's own lines, its part
   * and line in Bangla and English as the accountant's own file names a Category, its figures plain numbers. Saved under
   * a name stamped with the farm, the days and when it was made, and an **Export** as the paper is, refused as the
   * paper is. The Owner's alone, from their own phone.
   */
  monthCsv: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ month: farmMonth }))
    .handler(async ({ context, input }) => {
      const { facts, days, now } = await monthToExport(context, input.month);
      // Named as the accountant's own file names a Category: Bangla bare, English beside it.
      const csv = toCsv(
        [
          "part",
          "part_en",
          "line",
          "line_en",
          "way",
          "this_month",
          "month_before",
        ],
        monthlyReportRows(facts).map((row) => [
          row.part.bn,
          row.part.en,
          row.line.bn,
          row.line.en,
          row.way,
          row.thisMonth,
          row.monthBefore,
        ])
      );
      await recordExport(context, "monthly_report", days, {
        format: "csv",
        month: facts.month,
      });
      return {
        csv,
        fileName: stampedFileName(context.farm, "monthly-report", days, now),
      };
    }),
};
