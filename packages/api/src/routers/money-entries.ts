import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import { SIDES } from "@OpenFarm/db/schema/herd";
import {
  MONEY_DIRECTIONS,
  moneyCategory,
  moneyReceipt,
} from "@OpenFarm/db/schema/money";
import { PHOTO_MAX_BYTES, mayCorrect, startOfFarmDay } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import { correctionWindows, reasonInput, refusalData } from "../corrections";
import { counterpartyNamed } from "../counterparty-store";
import { farmDay } from "../farm-clock";
import { protectedProcedure } from "../index";
import {
  amountInput,
  correctedPaymentMethodInput,
  counterpartyInput,
  paymentMethodInput,
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

/** A calendar month, as a wage pays for one. */
const monthInput = z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/u);

const receiptInput = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  data: z.string().min(1).max(PHOTO_MAX_BYTES),
});

const noteInput = z.string().trim().min(1).max(300);

/** The Side money entered by hand belongs to; left out, the whole farm. */
const sideInput = z.enum(SIDES);

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

/** Refused, with the word the screen says it in. */
const refused = (message: string, refusal: string) =>
  new ORPCError("BAD_REQUEST", { message, data: { refusal } });

/** The Category as the trail records it either side of a change. */
const readCategory = async (tx: Tx, farmId: string, id: string) =>
  (await tx.query.moneyCategory.findFirst({ where: { id, farmId } })) ?? null;

/** Money entered by hand as the trail records it: the Money Event, and when a receipt was kept — not the
 *  photo. */
const readEntered = async (tx: Tx, farmId: string, id: string) => {
  const row = await tx.query.moneyEvent.findFirst({
    where: { id, farmId },
    with: { receipt: { columns: { updatedAt: true } } },
  });
  if (!row) {
    return null;
  }
  const { receipt, ...entry } = row;
  return { ...entry, receiptKeptAt: receipt?.updatedAt ?? null };
};

/**
 * The Category money entered by hand goes under: this farm's, one a record does not book, and a wage's
 * month given exactly when it is a wage. A retired Category takes nothing new — but money already under
 * it stays correctable where it is.
 */
const categoryForEntered = async (
  db: Pick<Tx, "query">,
  farmId: string,
  categoryId: string,
  {
    wageMonth,
    alreadyUnderIt,
  }: { wageMonth: string | null; alreadyUnderIt: boolean }
) => {
  const category = await db.query.moneyCategory.findFirst({
    where: { id: categoryId, farmId },
    columns: { id: true, key: true, direction: true, retiredAt: true },
  });
  if (!category) {
    throw new ORPCError("NOT_FOUND", { message: "No such Category" });
  }
  if (category.retiredAt && !alreadyUnderIt) {
    throw refused("That Category is retired", "category_retired");
  }
  if (!mayBeEnteredByHand(category.key)) {
    // Milk sold is booked by its Dispatch, a bull bought by its Intake: entering it by hand as well is
    // the same money twice.
    throw refused(
      "That Category's money comes from its own record",
      "category_kept_by_records"
    );
  }
  const isWage = category.key === "wages";
  if (isWage && wageMonth === null) {
    throw refused("A wage names the month it pays for", "wage_needs_month");
  }
  if (!isWage && wageMonth !== null) {
    throw refused("Only a wage pays for a month", "month_is_for_wages");
  }
  return category;
};

/** One wage per person per month: refused when this person's month is already paid, by another entry. */
const assertWageNotYetEntered = async (
  tx: Tx,
  farmId: string,
  wage: { counterpartyId: string; wageMonth: string | null; id: string }
) => {
  if (wage.wageMonth === null) {
    return;
  }
  const already = await tx.query.moneyEvent.findFirst({
    where: {
      farmId,
      counterpartyId: wage.counterpartyId,
      wageMonth: wage.wageMonth,
      id: { ne: wage.id },
    },
    columns: { id: true },
  });
  if (already) {
    throw refused(
      "That person's wage for that month is already entered",
      "wage_already_entered"
    );
  }
};

/** The farm day money moved, refused when that day has not come yet. */
const enteredOn = (day: string, now: Date): Date => {
  const at = startOfFarmDay(day);
  if (at > now) {
    throw refused(
      "Money cannot have moved on a day that has not come yet",
      "entered_in_the_future"
    );
  }
  return at;
};

/** Keeps a receipt's photo, replacing one kept before. */
const keepReceipt = async (
  tx: Tx,
  farmId: string,
  moneyEventId: string,
  receipt: z.infer<typeof receiptInput>,
  now: Date
) => {
  await tx
    .insert(moneyReceipt)
    .values({ moneyEventId, farmId, ...receipt, updatedAt: now })
    .onConflictDoUpdate({
      target: moneyReceipt.moneyEventId,
      set: { ...receipt, updatedAt: now },
    });
};

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
            throw refused(
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
          ? refused(
              "Wages are kept: a wage is one per person per month under them",
              "category_kept_for_wages"
            )
          : refused(
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
    .input(
      z.object({
        id: z.string(),
        categoryId: z.string().optional(),
        amountBdt: amountInput.optional(),
        occurredOn: farmDay.optional(),
        counterparty: counterpartyInput.optional(),
        paymentMethod: correctedPaymentMethodInput,
        note: noteInput.nullable().optional(),
        wageMonth: monthInput.nullable().optional(),
        side: sideInput.nullable().optional(),
        receipt: receiptInput.optional(),
        reason: reasonInput,
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const existing = await context.db.query.moneyEvent.findFirst({
        where: { id: input.id, farmId: context.farm.id },
      });
      if (!existing) {
        throw new ORPCError("NOT_FOUND", { message: "No such money entry" });
      }
      if (existing.source !== "by_hand") {
        throw refused(
          "That money comes from a record; put the record right",
          "correct_the_record"
        );
      }
      const verdict = mayCorrect({
        roles: context.roles,
        isOwnEntry: existing.recordedBy === context.actor.id,
        recordedAt: existing.recordedAt,
        now,
        windows: correctionWindows(context.farm),
      });
      if (!verdict.allowed) {
        throw new ORPCError("FORBIDDEN", {
          message: "The correction window for that entry has closed",
          data: { refusal: refusalData(verdict.refusal) },
        });
      }
      const wageMonth =
        input.wageMonth === undefined ? existing.wageMonth : input.wageMonth;
      const categoryId = input.categoryId ?? existing.categoryId;
      const category = await categoryForEntered(
        context.db,
        context.farm.id,
        categoryId,
        { wageMonth, alreadyUnderIt: categoryId === existing.categoryId }
      );
      const occurredAt =
        input.occurredOn === undefined
          ? existing.occurredAt
          : enteredOn(input.occurredOn, now);
      const audit = audited(context);
      const previous = await audit.latestEventFor(
        context.db,
        "money_event",
        existing.id
      );
      await audit.write(
        {
          entity: "money_event",
          entityId: existing.id,
          action: "correct",
          reason: input.reason,
          roleUsed: verdict.role,
          supersedesId: previous?.id,
          before: (tx) => readEntered(tx, context.farm.id, existing.id),
          after: (tx) => readEntered(tx, context.farm.id, existing.id),
        },
        async (tx) => {
          const counterpartyId =
            input.counterparty === undefined
              ? existing.counterpartyId
              : await counterpartyNamed(
                  tx,
                  context.farm.id,
                  input.counterparty,
                  now
                );
          if (counterpartyId !== null) {
            await assertWageNotYetEntered(tx, context.farm.id, {
              counterpartyId,
              wageMonth,
              id: existing.id,
            });
          }
          await bookMoney(
            tx,
            bookingOf(context, verdict.role, now),
            {
              source: "by_hand",
              sourceId: existing.id,
              amountBdt: input.amountBdt ?? Number(existing.amountBdt),
              occurredAt,
              counterpartyId,
              paymentMethod: input.paymentMethod,
            },
            {
              id: existing.id,
              category,
              note: input.note === undefined ? existing.note : input.note,
              wageMonth,
              side: input.side === undefined ? existing.side : input.side,
            }
          );
          if (input.receipt) {
            await keepReceipt(
              tx,
              context.farm.id,
              existing.id,
              input.receipt,
              now
            );
          }
        }
      );
      return { id: existing.id };
    }),

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
