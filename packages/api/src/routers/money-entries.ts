import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import { MONEY_DIRECTIONS, moneyCategory } from "@OpenFarm/db/schema/money";
import { farmDayOf, looksEnteredAlready, roundMoney } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import { assertTheHand } from "../cash-store";
import { correct } from "../corrections/correction";
import {
  moneyByHandCorrection,
  moneyByHandCorrectionInput,
} from "../corrections/money-by-hand";
import {
  wageDrawCorrection,
  wageDrawCorrectionInput,
} from "../corrections/wage-draw";
import { counterpartyNamed } from "../counterparty-store";
import { farmDay } from "../farm-clock";
import type { FarmList } from "../farm-list";
import {
  assertNameFree,
  bringBackToList,
  giveStandardOnce,
  retireFromList,
} from "../farm-list";
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
  farmAccountIdInput,
  referenceInput,
} from "../money-inputs";
import {
  addStandardCategories,
  bookMoney,
  bookingOf,
  isStandardName,
  mayBeChargedToAnimals,
  mayBeEnteredByHand,
  mayBePaidMonthly,
  mayBeRetired,
  missingStandardCategories,
  accountSaid,
} from "../money-store";
import { tell } from "../notice";
import {
  OWNER_ONLY,
  requireOnly,
  requirePersonalSession,
  requireRole,
} from "../roles";
import {
  drawsByPerson,
  drawsToTake,
  recordWageDraw,
  takeDraws,
} from "../wage-draw-store";

/**
 * Whether this looks like money already entered: the same person, the same taka, the same farm day, entered by hand.
 * Refused with the earlier one, so the Manager can see it, unless sent again knowing — and then the Owner is told, in the
 * evening's post, that it was entered twice on purpose. The Owner entering it twice knowingly tells nobody.
 */
const askIfEnteredAlready = async (
  tx: Tx,
  context: {
    farm: { id: string };
    roles: readonly string[];
    actor: { name: string };
  },
  entry: {
    id: string;
    name: string;
    amountMoney: number;
    occurredAt: Date;
    sameAgain: boolean;
    now: Date;
    /** What it is compared with: money entered by hand, or a person's Wage Draws. */
    source?: "by_hand" | "wage_draw";
  }
): Promise<string | null> => {
  const sameDay = await tx.query.moneyEvent.findMany({
    where: {
      farmId: context.farm.id,
      source: entry.source ?? "by_hand",
      occurredAt: { eq: entry.occurredAt },
    },
    columns: { id: true, amountMoney: true, occurredAt: true },
    with: {
      counterparty: { columns: { name: true } },
      recorder: { columns: { name: true } },
      category: { columns: { nameBn: true, nameEn: true } },
    },
    orderBy: { recordedAt: "asc", id: "asc" },
  });
  const day = farmDayOf(entry.occurredAt);
  const match = looksEnteredAlready(
    { name: entry.name, amountMoney: entry.amountMoney, day },
    sameDay.map((one) => ({
      ...one,
      name: one.counterparty?.name ?? null,
      day: farmDayOf(one.occurredAt),
    }))
  );
  if (!match) {
    return null;
  }
  if (!entry.sameAgain) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "This looks like money already entered: the same person, the same taka, the same day",
      data: {
        refusal: "looks_entered_already",
        match: {
          id: match.id,
          name: match.name,
          amountMoney: match.amountMoney,
          day,
          categoryBn: match.category?.nameBn ?? null,
          categoryEn: match.category?.nameEn ?? null,
          recordedByName: match.recorder?.name ?? null,
        },
      },
    });
  }
  if (!context.roles.includes("owner")) {
    await tell(
      tx,
      context.farm.id,
      {
        kind: "entered_twice",
        about: { id: entry.id },
        facts: {
          name: entry.name,
          amountMoney: entry.amountMoney,
          day,
          by: context.actor.name,
        },
      },
      entry.now
    );
  }
  return match.id;
};

/** The Category as the trail records it either side of a change. */
const readCategory = async (tx: Tx, farmId: string, id: string) =>
  (await tx.query.moneyCategory.findFirst({ where: { id, farmId } })) ?? null;

/**
 * Whose hand cash written up by hand is in, where the writer named another (`assertTheHand`): the Owner writing up the
 * Manager's takings or draw, never anybody else naming another's hand. Nothing for money not paid in cash, which is in
 * nobody's hand, nor where nobody was named — it is the writer's, as a Sale's is.
 */
const handNamed = async (
  context: {
    farm: { id: string };
    actor: { id: string };
    roles: readonly string[];
  },
  tx: Tx,
  input: { paymentMethod?: string; heldBy?: string }
): Promise<string | undefined> =>
  (input.paymentMethod ?? "cash") === "cash"
    ? await assertTheHand(
        tx,
        context.farm.id,
        { id: context.actor.id, roles: context.roles },
        input.heldBy
      )
    : undefined;

/** The farm's Categories, as the one way a list is kept keeps it. */
const CATEGORIES = {
  entity: "money_category",
  table: moneyCategory,
  read: readCategory,
  notFound: "No such Category",
  names: { bn: moneyCategory.nameBn, en: moneyCategory.nameEn },
  nameTaken: {
    refusal: "category_exists",
    message: "The farm already has that Category",
  },
} satisfies FarmList & Parameters<typeof assertNameFree>[2];

export const moneyEntryProcedures = {
  /** The Categories money is entered under. */
  categories: {
    /**
     * The farm's Categories, retired ones included, standard ones first given to a farm that does not
     * have them yet. The Owner's and the Manager's to keep.
     */
    list: protectedProcedure
      .use(requireRole("owner", "manager"))
      .handler(async ({ context }) => {
        // Given once, and recorded as what was actually given: a second request that finds them already there writes
        // nothing, and says nothing.
        await giveStandardOnce(context, {
          entity: "money_category",
          missing: () => missingStandardCategories(context.db, context.farm.id),
          give: (tx, keys, now) =>
            addStandardCategories(tx, context.farm.id, keys, now),
        });
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
          // Whether the animals of its Side carry money entered under it, and whether the Owner may say
          // they do at all.
          chargedToAnimals: row.chargedToAnimals,
          chargeable: mayBeChargedToAnimals(row),
          // Whether it is a Monthly Cost, and whether the Owner may make it one now: never a retired one, which takes
          // nothing new.
          paidMonthly: row.paidMonthlySince !== null,
          monthlyMarkable: mayBePaidMonthly(row) && row.retiredAt === null,
        }));
      }),

    /** A Category of the farm's own. The Owner's and the Manager's. */
    create: protectedProcedure
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
            const names = { bn: input.nameBn, en: input.nameEn };
            if (isStandardName(names)) {
              throw refusedByHand(
                "The farm already has that Category",
                "category_exists"
              );
            }
            await assertNameFree(tx, context.farm.id, CATEGORIES, names);
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
     * A Category's name put right — "বিদুৎ বিল" typed for "বিদ্যুৎ বিল" — where making a new one and retiring the old
     * split a year of money across two names. The farm's own Categories only: a standard one's name is what the farm's
     * own records book under, and is kept. Refused for a name another Category, or a standard one, already has.
     */
    rename: protectedProcedure
      .use(requireRole("owner", "manager"))
      .use(requirePersonalSession())
      .input(
        z.object({
          id: z.string(),
          nameBn: z.string().trim().min(1).max(80),
          nameEn: z.string().trim().min(1).max(80).optional(),
        })
      )
      .handler(async ({ context, input }) => {
        await audited(context).write(
          {
            entity: "money_category",
            entityId: input.id,
            action: "update",
            before: (tx) => readCategory(tx, context.farm.id, input.id),
            after: (tx) => readCategory(tx, context.farm.id, input.id),
          },
          async (tx) => {
            const category = await tx.query.moneyCategory.findFirst({
              where: { id: input.id, farmId: context.farm.id },
              columns: { key: true },
            });
            if (!category) {
              throw new ORPCError("NOT_FOUND", {
                message: CATEGORIES.notFound,
              });
            }
            if (category.key !== null) {
              throw refusedByHand(
                "A standard Category keeps its name",
                "category_is_standard"
              );
            }
            const names = { bn: input.nameBn, en: input.nameEn };
            if (isStandardName(names)) {
              throw refusedByHand(
                "The farm already has that Category",
                "category_exists"
              );
            }
            await assertNameFree(
              tx,
              context.farm.id,
              CATEGORIES,
              names,
              input.id
            );
            await tx
              .update(moneyCategory)
              .set({ nameBn: input.nameBn, nameEn: input.nameEn ?? null })
              .where(eq(moneyCategory.id, input.id));
          }
        );
        return { id: input.id };
      }),

    /**
     * Marks a Category as charged to the animals of its Side — a Vet visit that named nobody, lab tests, fly
     * spray — or takes the mark off. The month's money under it is then split across the animals standing
     * that month, by the days each stood.
     *
     * The Owner's alone, and from their own phone: it decides what every Margin on that Side carries.
     */
    setChargedToAnimals: protectedProcedure
      .use(requireOnly("owner", OWNER_ONLY))
      .use(requirePersonalSession())
      .input(
        z.object({ categoryId: z.string(), chargedToAnimals: z.boolean() })
      )
      .handler(async ({ context, input }) => {
        const existing = await context.db.query.moneyCategory.findFirst({
          where: { id: input.categoryId, farmId: context.farm.id },
          columns: {
            id: true,
            key: true,
            nameBn: true,
            direction: true,
            chargedToAnimals: true,
          },
        });
        if (!existing) {
          throw new ORPCError("NOT_FOUND", { message: "No such Category" });
        }
        if (
          input.chargedToAnimals &&
          !(mayBeEnteredByHand(existing.key) && mayBeChargedToAnimals(existing))
        ) {
          throw refusedByHand(
            "Wages, shed rent, utilities, repairs, shed hygiene, equipment, money coming in and money a record books are never the animals' to carry",
            "never_the_animals"
          );
        }
        await audited(context).write(
          {
            entity: "money_category",
            entityId: existing.id,
            action: "update",
            before: {
              nameBn: existing.nameBn,
              chargedToAnimals: existing.chargedToAnimals,
            },
            after: {
              nameBn: existing.nameBn,
              chargedToAnimals: input.chargedToAnimals,
            },
          },
          (tx) =>
            tx
              .update(moneyCategory)
              .set({ chargedToAnimals: input.chargedToAnimals })
              .where(eq(moneyCategory.id, existing.id))
        );
        return { chargedToAnimals: input.chargedToAnimals };
      }),

    /**
     * Marks a Category as paid every month — shed rent, electricity — or takes the mark off (CONTEXT.md: **Monthly
     * Cost**). From the farm's day of the month, a month with nothing entered under it is named to the Manager and the Owner,
     * from the month the mark goes on and never before it. Taken off and put back, it starts again from that day.
     *
     * The Owner's alone, and from their own phone: it decides what the Manager is chased for.
     */
    setPaidMonthly: protectedProcedure
      .use(requireOnly("owner", OWNER_ONLY))
      .use(requirePersonalSession())
      .input(z.object({ categoryId: z.string(), paidMonthly: z.boolean() }))
      .handler(async ({ context, input }) => {
        const existing = await context.db.query.moneyCategory.findFirst({
          where: { id: input.categoryId, farmId: context.farm.id },
          columns: {
            id: true,
            key: true,
            nameBn: true,
            direction: true,
            retiredAt: true,
            paidMonthlySince: true,
          },
        });
        if (!existing) {
          throw new ORPCError("NOT_FOUND", { message: "No such Category" });
        }
        if (input.paidMonthly && existing.key === "wages") {
          throw refusedByHand(
            "A wage is looked for by the person, not the Category",
            "wages_watched_by_person"
          );
        }
        if (input.paidMonthly && !mayBePaidMonthly(existing)) {
          throw refusedByHand(
            "Only money going out that no record books may be marked as paid every month",
            "never_monthly"
          );
        }
        if (input.paidMonthly && existing.retiredAt !== null) {
          throw refusedByHand(
            "A retired Category takes nothing new",
            "category_retired"
          );
        }
        // Marked again while it is marked keeps the day it was first marked: the months since are still owed.
        if (input.paidMonthly === (existing.paidMonthlySince !== null)) {
          return { paidMonthly: input.paidMonthly };
        }
        const paidMonthlySince = input.paidMonthly ? context.clock.now() : null;
        await audited(context).write(
          {
            entity: "money_category",
            entityId: existing.id,
            action: "update",
            before: {
              nameBn: existing.nameBn,
              paidMonthlySince: existing.paidMonthlySince,
            },
            after: { nameBn: existing.nameBn, paidMonthlySince },
          },
          (tx) =>
            tx
              .update(moneyCategory)
              .set({ paidMonthlySince })
              .where(eq(moneyCategory.id, existing.id))
        );
        return { paidMonthly: input.paidMonthly };
      }),

    /**
     * Retires a Category: nothing new goes under it, and everything entered under it keeps it. Never
     * removed. A Category a record books under is not the farm's to retire, and nor is Wages, which the
     * one-wage-a-month rule is kept by.
     */
    retire: protectedProcedure
      .use(requireRole("owner", "manager"))
      .use(requirePersonalSession())
      .input(z.object({ id: z.string() }))
      .handler(async ({ context, input }) => {
        await retireFromList(context, CATEGORIES, input.id, {
          refuseWhile: async (tx) => {
            const category = await tx.query.moneyCategory.findFirst({
              where: { id: input.id, farmId: context.farm.id },
              columns: { key: true },
            });
            if (category && !mayBeRetired(category.key)) {
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
          },
        });
        return { id: input.id };
      }),

    /** Puts a retired Category back: money may be entered under it again. */
    restore: protectedProcedure
      .use(requireRole("owner", "manager"))
      .use(requirePersonalSession())
      .input(z.object({ id: z.string() }))
      .handler(async ({ context, input }) => {
        await bringBackToList(context, CATEGORIES, input.id);
        return { id: input.id };
      }),
  },

  /**
   * Money no record catches, entered by hand: wages, electricity, repairs, manure sold. How much, the day,
   * the Category, who with, how it was paid, a note and a photo of the receipt. A wage names the person
   * and the month it pays for, once.
   *
   * The Manager's or the Owner's, from their own phone (the Owner may do anything the Manager does, the
   * Owner, 2026-09-17). Over the Approval Threshold it waits for the Owner as a record's money does —
   * unless the Owner entered it.
   */
  enter: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(
      z.object({
        categoryId: z.string(),
        amountMoney: amountInput,
        occurredOn: farmDay,
        counterparty: counterpartyInput,
        paymentMethod: paymentMethodInput,
        /** Which Farm Account mobile money or bank money went into or came out of, and its transaction ID. */
        farmAccountId: farmAccountIdInput,
        reference: referenceInput,
        note: noteInput.optional(),
        wageMonth: monthInput.optional(),
        side: sideInput.optional(),
        receipt: receiptInput.optional(),
        /** Whose hand the cash is in, where it is not the writer's: the Owner writing up the Manager's takings. */
        heldBy: z.string().optional(),
        /** Entered again knowing it looks like one already entered — two loads of bamboo from the same man, the same
         *  day, at the same price. */
        sameAgain: z.boolean().optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const occurredAt = enteredOn(input.occurredOn, now);
      let enteredKnowing: string | null = null;
      const wageMonth = input.wageMonth ?? null;
      const category = await categoryForEntered(
        context.db,
        context.farm.id,
        input.categoryId,
        { wageMonth, alreadyUnderIt: false }
      );
      const id = newId(now);
      let takenMoney = 0;
      await audited(context).write(
        {
          entity: "money_event",
          entityId: id,
          action: "create",
          after: async (tx) => {
            const entered = await readEntered(tx, context.farm.id, id);
            // The trail keeps that it was entered knowing, and against which.
            return entered && enteredKnowing
              ? { ...entered, enteredKnowing }
              : entered;
          },
        },
        async (tx) => {
          const counterpartyId = await counterpartyNamed(
            tx,
            context.farm.id,
            input.counterparty,
            now
          );
          // A wage is one a person a month already; anything else entered twice is asked about before it is kept.
          if (!wageMonth) {
            enteredKnowing = await askIfEnteredAlready(tx, context, {
              id,
              name: input.counterparty.name,
              amountMoney: input.amountMoney,
              occurredAt,
              sameAgain: input.sameAgain ?? false,
              now,
            });
          }
          await assertWageNotYetEntered(tx, context.farm.id, {
            counterpartyId,
            wageMonth,
            id,
          });
          // A wage takes the person's draws still open off the month's wage, the oldest first, and books what is paid
          // now: the draws went out as money of their own the day they were drawn.
          const draws = wageMonth
            ? await drawsToTake(
                tx,
                context.farm.id,
                counterpartyId,
                input.amountMoney
              )
            : { parts: [], takenMoney: 0 };
          ({ takenMoney } = draws);
          const heldBy = await handNamed(context, tx, input);
          await bookMoney(
            tx,
            bookingOf(
              context,
              context.roleUsed,
              now,
              accountSaid(["by_hand"], input)
            ),
            {
              source: "by_hand",
              sourceId: id,
              amountMoney: roundMoney(input.amountMoney - draws.takenMoney),
              occurredAt,
              counterpartyId,
              paymentMethod: input.paymentMethod,
              ...(heldBy === undefined ? {} : { heldBy }),
            },
            {
              id,
              category,
              note: input.note ?? null,
              wageMonth,
              side: input.side ?? null,
              drawsTakenMoney: draws.takenMoney,
            }
          );
          await takeDraws(tx, context.farm.id, id, draws.parts, now);
          if (input.receipt) {
            await keepReceipt(tx, context.farm.id, id, input.receipt, now);
          }
        }
      );
      return { id, drawsTakenMoney: takenMoney };
    }),

  /**
   * A **Wage Draw**: money a person takes ahead of payday, out of the hand that paid it, under Wages, and taken off
   * their next wage. The Manager's or the Owner's, from their own phone, as a wage is.
   */
  drawWage: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(
      z.object({
        counterparty: counterpartyInput,
        amountMoney: amountInput,
        drawnOn: farmDay,
        paymentMethod: paymentMethodInput,
        /** Which Farm Account mobile money or bank money came out of, and its transaction ID. */
        farmAccountId: farmAccountIdInput,
        reference: referenceInput,
        note: noteInput.optional(),
        /** Whose hand the cash came out of, where it is not the writer's: the Owner writing up the Manager's draw. */
        heldBy: z.string().optional(),
        /** Sent again knowing it looks like a draw already written: the same person, the same taka, the same day. */
        sameAgain: z.boolean().optional(),
        /** The Side the person works on, as their wage will say it: a draw is part of the wage. */
        side: sideInput.optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const drawnAt = enteredOn(input.drawnOn, now);
      let id = "";
      let enteredKnowing: string | null = null;
      await audited(context).write(
        {
          entity: "wage_draw",
          entityId: () => id,
          action: "create",
          after: async (tx) => {
            const drawn =
              (await tx.query.wageDraw.findFirst({ where: { id } })) ?? null;
            // The trail keeps that it was written knowing, and against which.
            return drawn && enteredKnowing
              ? { ...drawn, enteredKnowing }
              : drawn;
          },
        },
        async (tx) => {
          const counterpartyId = await counterpartyNamed(
            tx,
            context.farm.id,
            input.counterparty,
            now
          );
          // A draw written up twice — the Manager at noon, the Owner in the evening — came off payday twice: asked
          // about, as money entered by hand is, before it is kept.
          enteredKnowing = await askIfEnteredAlready(tx, context, {
            // What the Owner's notice of a draw written twice knowingly is about: the asking itself.
            id: newId(now),
            name: input.counterparty.name,
            amountMoney: input.amountMoney,
            occurredAt: drawnAt,
            sameAgain: input.sameAgain ?? false,
            now,
            source: "wage_draw",
          });
          ({ id } = await recordWageDraw(
            tx,
            bookingOf(
              context,
              context.roleUsed,
              now,
              accountSaid(["wage_draw"], input)
            ),
            {
              counterpartyId,
              amountMoney: input.amountMoney,
              drawnAt,
              note: input.note ?? null,
              side: input.side ?? null,
              paymentMethod: input.paymentMethod,
              heldBy: await handNamed(context, tx, input),
            }
          ));
        }
      );
      return { id };
    }),

  /** Each person with Wage Draws still owed, and each draw, the most owed first. */
  openDraws: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .handler(({ context }) => drawsByPerson(context.db, context.farm.id)),

  /**
   * Puts a Wage Draw right — its money with it. Taken back whole by putting it to nothing; never below what a payday
   * has already taken off it.
   */
  correctDraw: protectedProcedure
    .use(requireRole(...wageDrawCorrection.roles))
    .use(requirePersonalSession())
    .input(wageDrawCorrectionInput)
    .handler(({ context, input }) =>
      correct(context, wageDrawCorrection, input)
    ),

  /**
   * Puts right money entered by hand — a Correction like any other: a reason, the Role's Correction
   * Window, and the trail holding what it said. A note sent as nothing is cleared. A record's own money
   * is put right on the record, never here.
   */
  correctEntered: protectedProcedure
    .use(requireRole("owner", "manager"))
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
