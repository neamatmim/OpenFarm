import { uuidv7 as newId } from "@OpenFarm/db/ids";
import {
  farmDayOf,
  farmTimeOf,
  milkDispatchRecord,
  roundLitres,
  startOfFarmDay,
} from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../audit";
import type { Context } from "../context";
import { toCsv } from "../csv";
import { dispatchesBetween, litresDispatched } from "../dispatch-store";
import type { DispatchRow } from "../dispatch-store";
import { protectedProcedure } from "../index";
import { periodInput, periodOf } from "../period";
import { languageOf } from "../reader-language";
import { requirePersonalSession, requireRole } from "../roles";

type FarmContext = Context & { farm: NonNullable<Context["farm"]> };

/**
 * Every Export is an Audit Event, stamped with the report, the period and the Registration number
 * (CONTEXT: Export). Nothing changes, so the write is the event alone; each Export is its own entity, so
 * the same period handed over twice is two Exports on the trail, not one Export seen twice.
 */
const recordExport = (
  context: FarmContext,
  report: "milk_dispatch_record" | "milk_production",
  period: { from: string; to: string },
  extra: Record<string, unknown>
) =>
  audited(context).write(
    {
      entity: "report",
      entityId: newId(context.clock.now()),
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

/** The dispatch record as a paper, in the language of whoever is producing it. */
const dispatchPaper = async (
  context: FarmContext & { actor: { id: string; name: string } },
  period: { from: string; to: string },
  dispatches: readonly DispatchRow[]
) => {
  const language = await languageOf(context.db, context.actor.id);
  const figure = (value: number | null) =>
    value === null ? null : formatNumber(value, language);
  return milkDispatchRecord({
    farm: context.farm,
    from: formatDate(startOfFarmDay(period.from), language),
    to: formatDate(startOfFarmDay(period.to), language),
    dispatches: dispatches.map((one) => ({
      at: formatDate(one.dispatchedAt, language, "dateTime"),
      litres: formatNumber(one.litres, language),
      buyerName: one.buyerName,
      buyerAddress: one.buyerAddress,
      challan: one.challan,
      fatPercent: figure(one.fatPercent),
      snfPercent: figure(one.snfPercent),
    })),
    totalLitres: formatNumber(litresDispatched(dispatches), language),
    producedBy: context.actor.name,
    producedAt: formatDate(context.clock.now(), language, "dateTime"),
  });
};

/** The dispatch record as a CSV: plain digits for whoever opens it in a spreadsheet. */
const dispatchCsv = (dispatches: readonly DispatchRow[]) =>
  toCsv(
    [
      "date",
      "time",
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
      farmTimeOf(one.dispatchedAt),
      one.litres.toFixed(2),
      one.buyerName,
      one.buyerAddress,
      one.challan,
      one.fatPercent?.toFixed(2) ?? null,
      one.snfPercent?.toFixed(2) ?? null,
      one.note,
    ])
  );

export const reportsRouter = {
  /**
   * R12, the milk dispatch record: every Dispatch in a period with the buyer's name and address, the
   * challan, and the fat and SNF where the processor gave them — the paper a processor or BFSA asks for
   * (Safe Food Act s.38), or the same as a CSV.
   *
   * The Owner's and the Manager's, from their own phones (roles matrix: compliance reports — R; export).
   * A farm that has not written its Registration number down is told so, as the transport card tells
   * it: a record handed to an inspector without it is a record with a hole in it.
   */
  milkDispatchRecord: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(z.object({ ...periodInput, format: z.enum(["paper", "csv"]) }))
    .handler(async ({ context, input }) => {
      if (!context.farm.registrationNumber?.trim()) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            "The farm's DLS registration number is not recorded, and a dispatch record cannot be written without it",
          data: {
            refusal: "farm_identity_incomplete",
            missing: "registrationNumber",
          },
        });
      }
      const dispatches = await dispatchesBetween(
        context.db,
        context.farm.id,
        periodOf(input)
      );
      const totalLitres = litresDispatched(dispatches);
      const result =
        input.format === "paper"
          ? { text: await dispatchPaper(context, input, dispatches) }
          : { csv: dispatchCsv(dispatches) };
      await recordExport(context, "milk_dispatch_record", input, {
        format: input.format,
        dispatches: dispatches.length,
        totalLitres,
      });
      return { ...result, totalLitres };
    }),

  /**
   * R13, milk production: litres by farm day, session, Pen and Destination, with the milk poured away
   * under a Withdrawal shown apart from milk poured away by judgement. A CSV for the Owner's own
   * spreadsheet.
   */
  milkProduction: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(z.object(periodInput))
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
        { key: string[]; underWithdrawal: string; litres: number }
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
          roundLitres(line.litres).toFixed(2),
          line.underWithdrawal,
        ])
      );
      await recordExport(context, "milk_production", input, {
        format: "csv",
        sessions: sessions.length,
      });
      return { csv };
    }),
};
