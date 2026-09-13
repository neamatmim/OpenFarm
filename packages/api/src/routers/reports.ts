import type { Database } from "@OpenFarm/db";
import {
  farmDayOf,
  farmTimeOf,
  milkDispatchRecord,
  roundLitres,
} from "@OpenFarm/domain";
import type { Language } from "@OpenFarm/i18n";
import { formatDate, formatNumber, resolveLanguage } from "@OpenFarm/i18n";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../audit";
import type { Context } from "../context";
import { toCsv } from "../csv";
import { dispatchesBetween, farmDaysBetween } from "../dispatch-store";
import { farmDay } from "../farm-clock";
import { protectedProcedure } from "../index";
import { requireRole } from "../roles";

/** The longest stretch one report covers. A year is what a processor or an inspector asks for. */
const LONGEST_PERIOD_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

const periodInput = z
  .object({ from: farmDay, to: farmDay })
  .refine((period) => period.from <= period.to, {
    message: "A period ends after it begins",
  });

/** The farm days a report covers, refused when the period is longer than one report carries. */
const periodOf = (period: { from: string; to: string }) => {
  const range = farmDaysBetween(period.from, period.to);
  if (
    range.until.getTime() - range.from.getTime() >
    LONGEST_PERIOD_DAYS * DAY_MS
  ) {
    throw new ORPCError("BAD_REQUEST", {
      message: "One report covers a year at most",
      data: { refusal: "period_too_long" },
    });
  }
  return range;
};

/** The language of whoever is producing the report, Bangla when they have never said. */
const languageOf = async (db: Database, userId: string): Promise<Language> => {
  const row = await db.query.user.findFirst({
    where: { id: userId },
    columns: { language: true },
  });
  return resolveLanguage(row);
};

/**
 * Every Export is an Audit Event, stamped with the report, the period and the Registration number
 * (CONTEXT: Export). Nothing changes, so the write is the event alone.
 */
const recordExport = (
  context: Context & { farm: NonNullable<Context["farm"]> },
  report: "milk_dispatch_record" | "milk_production",
  period: { from: string; to: string },
  extra: Record<string, unknown>
) =>
  audited(context).write(
    {
      entity: "report",
      entityId: `${report}:${period.from}:${period.to}`,
      action: "export",
      after: {
        report,
        from: period.from,
        to: period.to,
        registrationNumber: context.farm.registrationNumber,
        ...extra,
      },
    },
    () => Promise.resolve()
  );

export const reportsRouter = {
  /**
   * R12, the milk dispatch record: every Dispatch in a period with the buyer's name and address, the
   * challan, and the fat and SNF where the processor gave them — the paper a processor or BFSA asks for
   * (Safe Food Act s.38), and the same as a CSV.
   *
   * The Owner's and the Manager's (roles matrix: compliance reports — R; export). The paper reads in the
   * language of whoever produces it; the CSV is plain digits for whoever opens it in a spreadsheet.
   */
  milkDispatchRecord: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(periodInput)
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const language = await languageOf(context.db, context.actor.id);
      const dispatches = await dispatchesBetween(
        context.db,
        context.farm.id,
        periodOf(input)
      );
      const totalLitres = roundLitres(
        dispatches.reduce((sum, one) => sum + one.litres, 0)
      );
      const percent = (value: number | null) =>
        value === null ? null : formatNumber(value, language);
      const text = milkDispatchRecord({
        farm: context.farm,
        from: formatDate(new Date(`${input.from}T12:00:00+06:00`), language),
        to: formatDate(new Date(`${input.to}T12:00:00+06:00`), language),
        dispatches: dispatches.map((one) => ({
          day: formatDate(one.dispatchedAt, language, "dateTime"),
          litres: formatNumber(one.litres, language),
          buyerName: one.buyerName,
          buyerAddress: one.buyerAddress,
          challan: one.challan,
          fatPercent: percent(one.fatPercent),
          snfPercent: percent(one.snfPercent),
        })),
        totalLitres: formatNumber(totalLitres, language),
        producedBy: context.actor.name,
        producedAt: formatDate(now, language, "dateTime"),
      });
      const csv = toCsv(
        [
          "date",
          "litres",
          "buyer",
          "buyer_address",
          "challan",
          "fat_percent",
          "snf_percent",
          "note",
        ],
        dispatches.map((one) => [
          farmDayOf(one.dispatchedAt),
          one.litres,
          one.buyerName,
          one.buyerAddress,
          one.challan,
          one.fatPercent,
          one.snfPercent,
          one.note,
        ])
      );
      await recordExport(context, "milk_dispatch_record", input, {
        dispatches: dispatches.length,
        totalLitres,
      });
      return { text, csv, totalLitres };
    }),

  /**
   * R13, milk production: litres by farm day, session, Pen and Destination, with the milk poured away
   * under a Withdrawal shown apart from milk poured away by judgement. A CSV for the Owner's own
   * spreadsheet.
   */
  milkProduction: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(periodInput)
    .handler(async ({ context, input }) => {
      const { from, until } = periodOf(input);
      const sessions = await context.db.query.milkingSession.findMany({
        where: { farmId: context.farm.id, dueAt: { gte: from, lt: until } },
        columns: { id: true, dueAt: true },
        with: {
          pen: {
            columns: { name: true },
            with: { shed: { columns: { name: true } } },
          },
          records: {
            columns: { litres: true, destination: true, forced: true },
          },
        },
        orderBy: { dueAt: "asc", id: "asc" },
      });
      // One line per Session per Destination, with the withheld milk its own line: poured away under a
      // Withdrawal is not the same fact as poured away by judgement.
      const lines = new Map<
        string,
        { key: (string | number)[]; underWithdrawal: string; litres: number }
      >();
      for (const session of sessions) {
        for (const record of session.records) {
          const underWithdrawal = record.forced ? "yes" : "no";
          const id = `${session.id}|${record.destination}|${underWithdrawal}`;
          const line = lines.get(id) ?? {
            key: [
              farmDayOf(session.dueAt),
              farmTimeOf(session.dueAt),
              session.pen.shed.name,
              session.pen.name,
              record.destination,
            ],
            underWithdrawal,
            litres: 0,
          };
          line.litres += Number(record.litres);
          lines.set(id, line);
        }
      }
      const csv = toCsv(
        [
          "date",
          "session",
          "shed",
          "pen",
          "destination",
          "litres",
          "under_withdrawal",
        ],
        [...lines.values()].map((line) => [
          ...line.key,
          roundLitres(line.litres),
          line.underWithdrawal,
        ])
      );
      await recordExport(context, "milk_production", input, {
        sessions: sessions.length,
      });
      return { csv };
    }),
};
