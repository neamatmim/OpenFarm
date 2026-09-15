import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import { MONEY_DIRECTIONS, moneyCategory } from "@OpenFarm/db/schema/money";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import { correct } from "../corrections/correction";
import {
  moneyByHandCorrection,
  moneyByHandCorrectionInput,
} from "../corrections/money-by-hand";
import { counterpartyNamed } from "../counterparty-store";
import { farmDay } from "../farm-clock";
import { protectedProcedure } from "../index";
import {
  assertWageNotYetEntered,
  categoryForEntered,
  enteredOn,
  keepReceipt,
  readEntered,
  refusedByHand,
} from "../money-by-hand-store";
import {
  amountInput,
  counterpartyInput,
  monthInput,
  noteInput,
  paymentMethodInput,
  receiptInput,
  sideInput,
} from "../money-inputs";
import {
  addStandardCategories,
  bookMoney,
  bookingOf,
  isStandardName,
  mayBeEnteredByHand,
  mayBeRetired,
  missingStandardCategories,
} from "../money-store";
import { requireOnly, requirePersonalSession, requireRole } from "../roles";

/** Thrown inside the standard Categories' write when another request gave them first, so that no Audit
 *  Event says they were given twice. */
class NothingToGiveError extends Error {
  constructor() {
    super("The standard Categories were already given");
    this.name = "NothingToGiveError";
  }
}

const MANAGER_ONLY = {
  message: "Entering money is the Manager's; the Owner reads and approves it",
  reason: "manager_only",
} as const;

/** The Category as the trail records it either side of a change. */
const readCategory = async (tx: Tx, farmId: string, id: string) =>
  (await tx.query.moneyCategory.findFirst({ where: { id, farmId } })) ?? null;

export const moneyEntryProcedures = {
  /**
   * The farm's Categories, retired ones included, standard ones first given to a farm that does not
   * have them yet. The Owner's and the Manager's to keep.
   */
  categories: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(async ({ context }) => {
      const now = context.clock.now();
      const missing = await missingStandardCategories(
        context.db,
        context.farm.id
      );
      if (missing.length > 0) {
        // Given once, and recorded as what was actually given: a second request that finds them already
        // there writes nothing, and says nothing.
        let added: string[] = [];
        await audited(context)
          .write(
            {
              entity: "money_category",
              entityId: context.farm.id,
              action: "create",
              after: () => Promise.resolve({ standard: added }),
            },
            async (tx) => {
              added = await addStandardCategories(
                tx,
                context.farm.id,
                missing,
                now
              );
              if (added.length === 0) {
                throw new NothingToGiveError();
              }
            }
          )
          .catch((error: unknown) => {
            if (!(error instanceof NothingToGiveError)) {
              throw error;
            }
          });
      }
      const rows = await context.db.query.moneyCategory.findMany({
        where: { farmId: context.farm.id },
        orderBy: { nameBn: "asc", id: "asc" },
      });
      return rows.map((row) => ({
        id: row.id,
        key: row.key,
        nameBn: row.nameBn,
        nameEn: row.nameEn,
        direction: row.direction,
        retiredAt: row.retiredAt,
        /** Whether money may be entered by hand under it, and whether the farm may retire it. */
        enterable: mayBeEnteredByHand(row.key),
        retirable: mayBeRetired(row.key),
      }));
    }),

  /** A Category of the farm's own. The Owner's and the Manager's. */
  addCategory: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(
      z.object({
        nameBn: z.string().trim().min(1).max(80),
        nameEn: z.string().trim().min(1).max(80).optional(),
        direction: z.enum(MONEY_DIRECTIONS),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const id = newId(now);
      await audited(context).write(
        {
          entity: "money_category",
          entityId: id,
          action: "create",
          after: (tx) => readCategory(tx, context.farm.id, id),
        },
        async (tx) => {
          // A standard Category's name is kept for it, even before the farm has been given it: a farm's
          // own "milk sales" would leave the Dispatches nowhere to book.
          const taken = await tx.query.moneyCategory.findFirst({
            where: { farmId: context.farm.id, nameBn: input.nameBn },
            columns: { id: true },
          });
          if (taken || isStandardName(input.nameBn)) {
            throw refusedByHand(
              "The farm already has that Category",
              "category_exists"
            );
          }
          await tx.insert(moneyCategory).values({
            id,
            farmId: context.farm.id,
            key: null,
            nameBn: input.nameBn,
            nameEn: input.nameEn ?? null,
            direction: input.direction,
            createdAt: now,
          });
        }
      );
      return { id };
    }),

  /**
   * Retires a Category: nothing new goes under it, and everything entered under it keeps it. Never
   * removed. A Category a record books under is not the farm's to retire, and nor is Wages, which the
   * one-wage-a-month rule is kept by.
   */
  retireCategory: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const category = await context.db.query.moneyCategory.findFirst({
        where: { id: input.id, farmId: context.farm.id },
        columns: { id: true, key: true, retiredAt: true },
      });
      if (!category) {
        throw new ORPCError("NOT_FOUND", { message: "No such Category" });
      }
      if (!mayBeRetired(category.key)) {
        throw category.key === "wages"
          ? refusedByHand(
              "Wages are kept: a wage is one per person per month under them",
              "category_kept_for_wages"
            )
          : refusedByHand(
              "A record's money is booked under that Category",
              "category_kept_by_records"
            );
      }
      if (category.retiredAt) {
        return { id: category.id };
      }
      await audited(context).write(
        {
          entity: "money_category",
          entityId: category.id,
          action: "update",
          before: (tx) => readCategory(tx, context.farm.id, category.id),
          after: (tx) => readCategory(tx, context.farm.id, category.id),
        },
        async (tx) => {
          await tx
            .update(moneyCategory)
            .set({ retiredAt: now })
            .where(eq(moneyCategory.id, category.id));
        }
      );
      return { id: category.id };
    }),

  /**
   * Money no record catches, entered by hand: wages, electricity, repairs, manure sold. How much, the day,
   * the Category, who with, how it was paid, a note and a photo of the receipt. A wage names the person
   * and the month it pays for, once.
   *
   * The Manager's, from their own phone (roles matrix: Money Events — Manager C R U, Owner R). Over the
   * Approval Threshold it waits for the Owner as a record's money does.
   */
  enter: protectedProcedure
    .use(requireOnly("manager", MANAGER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        categoryId: z.string(),
        amountBdt: amountInput,
        occurredOn: farmDay,
        counterparty: counterpartyInput,
        paymentMethod: paymentMethodInput,
        note: noteInput.optional(),
        wageMonth: monthInput.optional(),
        side: sideInput.optional(),
        receipt: receiptInput.optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const occurredAt = enteredOn(input.occurredOn, now);
      const wageMonth = input.wageMonth ?? null;
      const category = await categoryForEntered(
        context.db,
        context.farm.id,
        input.categoryId,
        { wageMonth, alreadyUnderIt: false }
      );
      const id = newId(now);
      await audited(context).write(
        {
          entity: "money_event",
          entityId: id,
          action: "create",
          after: (tx) => readEntered(tx, context.farm.id, id),
        },
        async (tx) => {
          const counterpartyId = await counterpartyNamed(
            tx,
            context.farm.id,
            input.counterparty,
            now
          );
          await assertWageNotYetEntered(tx, context.farm.id, {
            counterpartyId,
            wageMonth,
            id,
          });
          await bookMoney(
            tx,
            bookingOf(context, context.roleUsed, now),
            {
              source: "by_hand",
              sourceId: id,
              amountBdt: input.amountBdt,
              occurredAt,
              counterpartyId,
              paymentMethod: input.paymentMethod,
            },
            {
              id,
              category,
              note: input.note ?? null,
              wageMonth,
              side: input.side ?? null,
            }
          );
          if (input.receipt) {
            await keepReceipt(tx, context.farm.id, id, input.receipt, now);
          }
        }
      );
      return { id };
    }),

  /**
   * Puts right money entered by hand — a Correction like any other: a reason, the Role's Correction
   * Window, and the trail holding what it said. A note sent as nothing is cleared. A record's own money
   * is put right on the record, never here.
   */
  correctEntered: protectedProcedure
    .use(requireOnly("manager", MANAGER_ONLY))
    .use(requirePersonalSession())
    .input(moneyByHandCorrectionInput)
    .handler(({ context, input }) =>
      correct(context, moneyByHandCorrection, input)
    ),

  /** The photo of a Money Event's receipt. The Owner's and the Manager's, from their own phones. */
  receipt: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const row = await context.db.query.moneyReceipt.findFirst({
        where: { moneyEventId: input.id, farmId: context.farm.id },
        columns: { contentType: true, data: true },
      });
      if (!row) {
        throw new ORPCError("NOT_FOUND", { message: "No receipt kept" });
      }
      return row;
    }),
};
