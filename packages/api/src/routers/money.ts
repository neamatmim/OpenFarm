import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { and, eq } from "@OpenFarm/db/operators";
import { moneyEvent, vetFee, vetFeeAnimal } from "@OpenFarm/db/schema/money";
import { startOfFarmDay } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import { counterpartyNamed } from "../counterparty-store";
import { farmDay } from "../farm-clock";
import { requireAnimal } from "../herd-store";
import { protectedProcedure } from "../index";
import { amountInput, paymentMethodInput } from "../money-inputs";
import { bookMoney, bookingOf, settleMoneyNotices } from "../money-store";
import { periodInput, periodOf } from "../period";
import { requireOnly, requirePersonalSession, requireRole } from "../roles";
import { moneyEntryProcedures } from "./money-entries";

/** As much of a period as one screen reads; a busy period says there is more rather than dropping
 *  it quietly, and the accountant's export is where all of it goes. */
const LISTED = 500;

/** The Money Event as the trail records it either side of the Owner's approval. */
const readMoney = async (tx: Tx, id: string) =>
  (await tx.query.moneyEvent.findFirst({
    where: { id },
    columns: {
      amountBdt: true,
      approval: true,
      approvedBy: true,
      approvedAt: true,
    },
  })) ?? null;

/** The Vet's fee as the trail records it. */
const readFee = async (tx: Tx, id: string) =>
  (await tx.query.vetFee.findFirst({
    where: { id },
    with: { animals: { columns: { animalId: true } } },
  })) ?? null;

/** Refused: the money is not waiting for approval — approved already, or never over the threshold. */
const notWaiting = () =>
  new ORPCError("BAD_REQUEST", {
    message: "That money is not waiting for approval",
    data: { refusal: "not_awaiting_approval" },
  });

const OWNER_ONLY = {
  message: "Approving money is the Owner's alone",
  reason: "owner_only",
} as const;

const VET_ONLY = {
  message: "A visit fee is the Vet's own to enter",
  reason: "vet_only",
} as const;

export const moneyRouter = {
  ...moneyEntryProcedures,

  /**
   * The farm's Money Events in a period, newest first: how much, which way, under what Category, with
   * whom, how it was paid, the record it came from, and where it stands with the Owner.
   *
   * The Owner's and the Manager's, from their own phones (roles matrix: Money Events — Owner R, Manager
   * C R U). Barn Staff never see money, and the Vet sees only their own fees.
   */
  list: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(z.object(periodInput))
    .handler(async ({ context, input }) => {
      const { from, until } = periodOf(input);
      const rows = await context.db.query.moneyEvent.findMany({
        where: {
          farmId: context.farm.id,
          occurredAt: { gte: from, lt: until },
        },
        with: {
          category: { columns: { key: true, nameBn: true, nameEn: true } },
          counterparty: { columns: { name: true } },
          approver: { columns: { name: true } },
          receipt: { columns: { moneyEventId: true } },
        },
        orderBy: { occurredAt: "desc", id: "desc" },
        limit: LISTED + 1,
      });
      const events = rows.slice(0, LISTED).map((row) => ({
        id: row.id,
        occurredAt: row.occurredAt,
        direction: row.direction,
        amountBdt: Number(row.amountBdt),
        categoryKey: row.category.key,
        categoryBn: row.category.nameBn,
        categoryEn: row.category.nameEn,
        counterpartyName: row.counterparty?.name ?? null,
        paymentMethod: row.paymentMethod,
        source: row.source,
        sourceId: row.sourceId,
        approval: row.approval,
        approvedByName: row.approver?.name ?? null,
        approvedAt: row.approvedAt,
        note: row.note,
        wageMonth: row.wageMonth,
        side: row.side,
        hasReceipt: row.receipt !== null,
      }));
      return { events, more: rows.length > LISTED };
    }),

  /**
   * The Owner approves a Money Event over the Approval Threshold. The Owner's alone, and recorded with
   * the amount approved; the record that made it went ahead long before.
   *
   * An approval is of an amount, so the Owner names the amount they read. One corrected while they were
   * reading it is refused rather than approved unseen, and so is one somebody else approved first.
   */
  approve: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ id: z.string(), amountBdt: amountInput }))
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const waiting = await context.db.query.moneyEvent.findFirst({
        where: { id: input.id, farmId: context.farm.id },
        columns: { id: true, approval: true, amountBdt: true },
      });
      if (!waiting) {
        throw new ORPCError("NOT_FOUND", { message: "No such money entry" });
      }
      if (waiting.approval !== "awaiting") {
        throw notWaiting();
      }
      if (Number(waiting.amountBdt) !== input.amountBdt) {
        throw new ORPCError("BAD_REQUEST", {
          message: "The amount has been corrected since it was read",
          data: {
            refusal: "amount_changed",
            amountBdt: Number(waiting.amountBdt),
          },
        });
      }
      await audited(context).write(
        {
          entity: "money_event",
          entityId: waiting.id,
          action: "update",
          before: (tx) => readMoney(tx, waiting.id),
          after: (tx) => readMoney(tx, waiting.id),
        },
        async (tx) => {
          // Only while it still waits at the amount read: a correction or another approval landing
          // between the read and this write changes nothing, and nothing is recorded.
          const approved = await tx
            .update(moneyEvent)
            .set({
              approval: "approved",
              approvedBy: context.actor.id,
              approvedAt: now,
            })
            .where(
              and(
                eq(moneyEvent.id, waiting.id),
                eq(moneyEvent.approval, "awaiting"),
                eq(moneyEvent.amountBdt, input.amountBdt.toFixed(2))
              )
            )
            .returning({ id: moneyEvent.id });
          if (approved.length === 0) {
            throw notWaiting();
          }
          await settleMoneyNotices(tx, context.farm.id, waiting.id, now);
        }
      );
      return { id: waiting.id };
    }),

  /**
   * The Vet's own fee for a visit: how much, the day, and the animals seen when the Vet names them. It
   * becomes a Money Event paid to the Vet. The Vet's alone, from their own phone.
   */
  vetFee: protectedProcedure
    .use(requireOnly("vet", VET_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        amountBdt: amountInput,
        visitedOn: farmDay,
        animalTags: z
          .array(z.string().trim().min(1).max(32))
          .max(100)
          .default([]),
        note: z.string().trim().min(1).max(300).optional(),
        paymentMethod: paymentMethodInput,
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const visitedOn = startOfFarmDay(input.visitedOn);
      if (visitedOn > now) {
        throw new ORPCError("BAD_REQUEST", {
          message: "A visit cannot have been on a day that has not come yet",
          data: { refusal: "visited_in_the_future" },
        });
      }
      const seen = await Promise.all(
        [...new Set(input.animalTags.map((tag) => tag.toUpperCase()))].map(
          (tag) => requireAnimal(context.db, context.farm.id, tag)
        )
      );
      const id = newId(now);
      await audited(context).write(
        {
          entity: "vet_fee",
          entityId: id,
          action: "create",
          after: (tx) => readFee(tx, id),
        },
        async (tx) => {
          await tx.insert(vetFee).values({
            id,
            farmId: context.farm.id,
            vetId: context.actor.id,
            amountBdt: input.amountBdt.toFixed(2),
            visitedOn,
            note: input.note ?? null,
            recordedAt: now,
          });
          if (seen.length > 0) {
            await tx
              .insert(vetFeeAnimal)
              .values(
                seen.map((animal) => ({ vetFeeId: id, animalId: animal.id }))
              );
          }
          await bookMoney(tx, bookingOf(context, "vet", now), {
            source: "vet_fee",
            sourceId: id,
            amountBdt: input.amountBdt,
            occurredAt: visitedOn,
            counterpartyId: await counterpartyNamed(
              tx,
              context.farm.id,
              { name: context.actor.name },
              now
            ),
            paymentMethod: input.paymentMethod,
          });
        }
      );
      return { id };
    }),

  /** The Vet's own fees, newest first — the only money the Vet sees. */
  myFees: protectedProcedure
    .use(requireOnly("vet", VET_ONLY))
    .handler(async ({ context }) => {
      const rows = await context.db.query.vetFee.findMany({
        where: { farmId: context.farm.id, vetId: context.actor.id },
        with: {
          animals: {
            with: { animal: { columns: { tagNumber: true } } },
          },
        },
        orderBy: { visitedOn: "desc", id: "desc" },
        limit: 100,
      });
      return rows.map((row) => ({
        id: row.id,
        amountBdt: Number(row.amountBdt),
        visitedOn: row.visitedOn,
        note: row.note,
        tagNumbers: row.animals.map((one) => one.animal.tagNumber).toSorted(),
      }));
    }),
};
