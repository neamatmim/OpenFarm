import type { MoneySummary } from "@OpenFarm/domain";
import {
  accountantSummaryPaper,
  farmDayOf,
  farmTimeOf,
  milkDispatchPaper,
  roundLiters,
  summarizeMoney,
} from "@OpenFarm/domain";
import { z } from "zod";

import type { Context } from "../context";
import { toCsv } from "../csv";
import { dispatchesBetween, litersDispatched } from "../dispatch-store";
import type { DispatchRow } from "../dispatch-store";
import { stampedFileName } from "../export-name";
import { assertRegistered, recordExport } from "../export-store";
import { protectedProcedure } from "../index";
import type { ExportedMoney } from "../money-export-store";
import { moneyForTheAccountant } from "../money-export-store";
import { madeOn } from "../paper-values";
import { periodInput, periodOf } from "../period";
import { receivableOfBuyers } from "../receivable-store";
import { requirePersonalSession, requireRole } from "../roles";

type FarmContext = Context & { farm: NonNullable<Context["farm"]> };

/** The accountant's summary laid out on paper, read in Bangla or English: the period's money added up, and who still
 *  owed the farm what on its last day. */
const accountantPaper = async (
  context: FarmContext & { actor: { name: string } },
  period: { from: string; to: string },
  summary: MoneySummary
) => {
  // Who still owed what on the period's last day, as the buyers' payments up to then had left it.
  const book = await receivableOfBuyers(context.db, context.farm.id, {
    asOf: period.to,
  });
  return accountantSummaryPaper({
    farm: context.farm,
    from: period.from,
    to: period.to,
    summary,
    receivableAtTheEnd: book
      .filter((buyer) => buyer.owingMoney > 0)
      .map((buyer) => ({ name: buyer.name, owingMoney: buyer.owingMoney }))
      .toSorted(
        (a, b) => b.owingMoney - a.owingMoney || a.name.localeCompare(b.name)
      ),
    producedAt: madeOn(context.clock.now()),
    producedBy: context.actor.name,
  });
};

/** The accountant's CSV: every Money Event of the period, with the record behind it and whether the Owner
 *  has approved it. Plain digits and plain words for whoever opens it in a spreadsheet. */
const accountantCsv = (money: readonly ExportedMoney[]) =>
  toCsv(
    [
      "date",
      "direction",
      "amount_money",
      "category",
      "category_en",
      "counterparty",
      "payment_method",
      "side",
      "record",
      "record_id",
      "reference",
      "transaction_id",
      "farm_account",
      "approval",
      "note",
    ],
    money.map((one) => [
      farmDayOf(one.occurredAt),
      one.direction,
      one.amountMoney.toFixed(2),
      one.categoryBn,
      one.categoryEn,
      one.counterpartyName,
      one.paymentMethod,
      one.sides.map((share) => share.side ?? "whole_farm").join("+"),
      one.source,
      one.sourceId,
      one.reference,
      one.transactionId,
      one.farmAccountName,
      one.approval === "awaiting" ? "awaiting_approval" : one.approval,
      one.note,
    ])
  );

/** The dispatch record laid out on paper, read in Bangla or English. */
const dispatchPaper = (
  context: FarmContext & { actor: { name: string } },
  period: { from: string; to: string },
  dispatches: readonly DispatchRow[]
) =>
  milkDispatchPaper({
    farm: context.farm,
    from: period.from,
    to: period.to,
    dispatches: dispatches.map((one) => ({
      at: one.dispatchedAt,
      liters: one.liters,
      buyerName: one.buyerName,
      buyerAddress: one.buyerAddress,
      deliveryNote: one.deliveryNote,
      fatPercent: one.fatPercent,
      snfPercent: one.snfPercent,
    })),
    producedAt: madeOn(context.clock.now()),
    producedBy: context.actor.name,
  });

/** The dispatch record as a CSV: plain digits for whoever opens it in a spreadsheet. */
const dispatchCsv = (dispatches: readonly DispatchRow[]) =>
  toCsv(
    [
      "date",
      "time",
      "liters",
      "buyer",
      "buyer_address",
      "delivery_note",
      "fat_percent",
      "snf_percent",
      "note",
    ],
    dispatches.map((one) => [
      farmDayOf(one.dispatchedAt),
      farmTimeOf(one.dispatchedAt),
      one.liters.toFixed(2),
      one.buyerName,
      one.buyerAddress,
      one.deliveryNote,
      one.fatPercent?.toFixed(2) ?? null,
      one.snfPercent?.toFixed(2) ?? null,
      one.note,
    ])
  );

export const reportsRouter = {
  /**
   * R12, the milk dispatch record: every Dispatch in a period with the buyer's name and address, the
   * delivery note, and the fat and SNF where the processor gave them — the paper a processor or BFSA asks for
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
      assertRegistered(context.farm, "a dispatch record");
      const dispatches = await dispatchesBetween(
        context.db,
        context.farm.id,
        periodOf(input)
      );
      const totalLiters = litersDispatched(dispatches);
      const result =
        input.format === "paper"
          ? { document: dispatchPaper(context, input, dispatches) }
          : {
              csv: dispatchCsv(dispatches),
              fileName: stampedFileName(
                context.farm,
                "milk-dispatch",
                input,
                context.clock.now()
              ),
            };
      await recordExport(context, "milk_dispatch_record", input, {
        format: input.format,
        dispatches: dispatches.length,
        totalLiters,
      });
      return { ...result, totalLiters };
    }),

  /**
   * R13, milk production: liters by farm day, session, Pen and Destination, with the milk poured away
   * under a Withdrawal shown apart from milk poured away by judgment. A CSV for the Owner's own
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
            columns: { liters: true, destination: true, underWithdrawal: true },
          },
        },
        orderBy: { dueAt: "asc", id: "asc" },
      });
      // One line per Session per Destination, with the withheld milk its own line: poured away under a
      // Withdrawal is not the same fact as poured away by judgment.
      const lines = new Map<
        string,
        { key: string[]; underWithdrawal: string; liters: number }
      >();
      for (const session of sessions) {
        for (const record of session.records) {
          // Held when she was milked, whoever sent the milk to Discard: the phone, or the gate over it.
          const underWithdrawal = record.underWithdrawal ? "yes" : "no";
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
            liters: 0,
          };
          line.liters += Number(record.liters);
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
          "liters",
          "under_withdrawal",
        ],
        [...lines.values()].map((line) => [
          ...line.key,
          roundLiters(line.liters).toFixed(2),
          line.underWithdrawal,
        ])
      );
      await recordExport(context, "milk_production", input, {
        format: "csv",
        sessions: sessions.length,
      });
      return {
        csv,
        fileName: stampedFileName(
          context.farm,
          "milk-production",
          input,
          context.clock.now()
        ),
      };
    }),

  /**
   * R15, the accountant's export: every Money Event of a period as a CSV, or a summary of income against
   * expense by Category, by Counterparty and by Side as a paper headed by the farm. Money the Owner has not
   * approved is in both, and marked. The farm does not keep books; its accountant keeps them from this.
   *
   * The Owner's and the Manager's, from their own phones (roles matrix: finance reports — R; export).
   */
  accountantExport: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(z.object({ ...periodInput, format: z.enum(["paper", "csv"]) }))
    .handler(async ({ context, input }) => {
      assertRegistered(context.farm, "the accountant's export");
      const money = await moneyForTheAccountant(
        context.db,
        context.farm.id,
        periodOf(input)
      );
      const summary = summarizeMoney(money);
      const result =
        input.format === "paper"
          ? {
              summary,
              document: await accountantPaper(context, input, summary),
            }
          : {
              csv: accountantCsv(money),
              fileName: stampedFileName(
                context.farm,
                "money",
                input,
                context.clock.now()
              ),
            };
      await recordExport(context, "accountant_export", input, {
        format: input.format,
        moneyEvents: money.length,
        incomeMoney: summary.incomeMoney,
        expenseMoney: summary.expenseMoney,
      });
      return result;
    }),
};
