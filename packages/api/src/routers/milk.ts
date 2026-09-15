import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import { dispatch } from "@OpenFarm/db/schema/milk";
import type { PaymentMethod } from "@OpenFarm/db/schema/money";
import {
  farmDaysBetween,
  lactationView,
  mayCorrect,
  roundLitres,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import { correctionWindows, reasonInput, refusalData } from "../corrections";
import { counterpartyNamed } from "../counterparty-store";
import {
  dispatchesBetween,
  litresDispatched,
  litresToBulkBetween,
} from "../dispatch-store";
import { farmDay } from "../farm-clock";
import { protectedProcedure } from "../index";
import { litresOf } from "../milk-store";
import {
  correctedPaymentMethodInput,
  paymentMethodInput,
} from "../money-inputs";
import type { Booking } from "../money-store";
import { bookMoney, bookingOf, moneySnapshotOf } from "../money-store";
import { requireRole } from "../roles";
import { assertOnTheirCases } from "../visiting-store";

/** How many of a cow's recent milkings to hand back; enough for a fortnight of two-a-day
 *  sessions, which is as far as a phone screen usefully goes. */
const RECENT_RECORDS = 30;

const sessionShape = {
  columns: {
    id: true,
    instanceId: true,
    penId: true,
    dueAt: true,
    bulkLitres: true,
    sumBulkLitres: true,
    differenceLitres: true,
    tolerancePercent: true,
    flaggedAt: true,
  },
  with: {
    pen: {
      columns: { name: true },
      with: { shed: { columns: { name: true } } },
    },
  },
} as const;

const buyerInput = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().max(300).optional(),
  phone: z.string().trim().max(40).optional(),
});

const dispatchFields = {
  dispatchedAt: z.coerce.date(),
  litres: z.number().positive().max(100_000),
  challan: z.string().trim().min(1).max(60),
  pricePerLitreBdt: z.number().positive().max(10_000),
  fatPercent: z.number().min(0).max(20),
  snfPercent: z.number().min(0).max(20),
  note: z.string().trim().min(1).max(300),
};

/** The Dispatch as the trail records it either side of a change. */
const readDispatch = async (tx: Tx, id: string) => {
  const row = await tx.query.dispatch.findFirst({ where: { id } });
  return row
    ? { ...row, money: await moneySnapshotOf(tx, row.farmId, "dispatch", id) }
    : null;
};

/** Books a Dispatch's milk sale as it now stands: its litres at its price, to its buyer. */
const bookDispatchMoney = async (
  tx: Tx,
  booking: Booking,
  id: string,
  paymentMethod: PaymentMethod | undefined
) => {
  const row = await tx.query.dispatch.findFirst({ where: { id } });
  if (row) {
    await bookMoney(tx, booking, {
      source: "dispatch",
      sourceId: row.id,
      amountBdt: Number(row.litres) * Number(row.pricePerLitreBdt),
      occurredAt: row.dispatchedAt,
      counterpartyId: row.buyerId,
      paymentMethod,
    });
  }
};

/** Milk has not left before now. */
const assertNotLater = (dispatchedAt: Date, now: Date) => {
  if (dispatchedAt > now) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Milk cannot have left later than now",
      data: { refusal: "dispatched_in_the_future" },
    });
  }
};

/** A figure as the record keeps it: two decimals, as text. */
const twoPlaces = (value: number | null | undefined) =>
  value === undefined || value === null ? null : value.toFixed(2);

/** The buyer as the Dispatch keeps them: the Counterparty, and their name and address as the farm has
 *  them on the day the milk left. */
const buyerOnTheDay = async (
  tx: Tx,
  farmId: string,
  said: z.infer<typeof buyerInput>,
  now: Date
) => {
  const buyerId = await counterpartyNamed(tx, farmId, said, now);
  const buyer = await tx.query.counterparty.findFirst({
    where: { id: buyerId },
    columns: { name: true, address: true },
  });
  return {
    buyerId,
    buyerName: buyer?.name ?? said.name,
    buyerAddress: buyer?.address ?? null,
  };
};

/** Only the fields a Correction names: a field left out stays as it was, a field sent as nothing is
 *  cleared. */
const correctedFields = (input: {
  dispatchedAt?: Date;
  litres?: number;
  challan?: string | null;
  pricePerLitreBdt?: number;
  fatPercent?: number | null;
  snfPercent?: number | null;
  note?: string | null;
}) => ({
  ...(input.dispatchedAt === undefined
    ? {}
    : { dispatchedAt: input.dispatchedAt }),
  ...(input.litres === undefined ? {} : { litres: input.litres.toFixed(2) }),
  ...(input.challan === undefined ? {} : { challan: input.challan }),
  ...(input.pricePerLitreBdt === undefined
    ? {}
    : { pricePerLitreBdt: input.pricePerLitreBdt.toFixed(2) }),
  ...(input.fatPercent === undefined
    ? {}
    : { fatPercent: twoPlaces(input.fatPercent) }),
  ...(input.snfPercent === undefined
    ? {}
    : { snfPercent: twoPlaces(input.snfPercent) }),
  ...(input.note === undefined ? {} : { note: input.note }),
});

export const milkRouter = {
  /**
   * Milk handed over to a buyer: when, how many litres, to whom, the challan, the price, and the fat
   * and SNF if the processor measured them.
   *
   * The Manager's to record (roles matrix: Dispatch — Manager C R U, Owner R). The buyer is a
   * Counterparty found by name, whose address is what makes this the farm's milk-buyer record.
   */
  dispatch: protectedProcedure
    .use(requireRole("manager"))
    .input(
      z.object({
        ...dispatchFields,
        challan: dispatchFields.challan.optional(),
        fatPercent: dispatchFields.fatPercent.optional(),
        snfPercent: dispatchFields.snfPercent.optional(),
        note: dispatchFields.note.optional(),
        buyer: buyerInput,
        paymentMethod: paymentMethodInput,
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const recordedByRole = context.roleUsed;
      if (!recordedByRole) {
        throw new ORPCError("FORBIDDEN");
      }
      assertNotLater(input.dispatchedAt, now);
      const id = newId(now);
      await audited(context).write(
        {
          entity: "dispatch",
          entityId: id,
          action: "create",
          after: (tx) => readDispatch(tx, id),
        },
        async (tx) => {
          const buyer = await buyerOnTheDay(
            tx,
            context.farm.id,
            input.buyer,
            now
          );
          await tx.insert(dispatch).values({
            id,
            farmId: context.farm.id,
            dispatchedAt: input.dispatchedAt,
            litres: input.litres.toFixed(2),
            ...buyer,
            challan: input.challan ?? null,
            pricePerLitreBdt: input.pricePerLitreBdt.toFixed(2),
            fatPercent: twoPlaces(input.fatPercent),
            snfPercent: twoPlaces(input.snfPercent),
            note: input.note ?? null,
            recordedBy: context.actor.id,
            recordedByRole,
            recordedAt: now,
          });
          await bookDispatchMoney(
            tx,
            bookingOf(context, recordedByRole, now),
            id,
            input.paymentMethod
          );
        }
      );
      return { id };
    }),

  /**
   * Puts a Dispatch right: the litres, the time, the buyer, the challan, the price, the fat or SNF. A
   * Correction like any other — a reason, the Role's Correction Window, the trail holding what it said.
   * A challan, a note, a fat or an SNF sent as nothing is cleared: a figure written against the wrong
   * lorry is put right by taking it away.
   *
   * The Manager's, as recording is, and the Owner's — whose Correction Window never closes (Owner, 2026-09-14: the
   * spec's "Owner always" over the matrix's read-only Owner).
   */
  correctDispatch: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(
      z.object({
        id: z.string(),
        dispatchedAt: dispatchFields.dispatchedAt.optional(),
        litres: dispatchFields.litres.optional(),
        buyer: buyerInput.optional(),
        challan: dispatchFields.challan.nullable().optional(),
        pricePerLitreBdt: dispatchFields.pricePerLitreBdt.optional(),
        fatPercent: dispatchFields.fatPercent.nullable().optional(),
        snfPercent: dispatchFields.snfPercent.nullable().optional(),
        note: dispatchFields.note.nullable().optional(),
        paymentMethod: correctedPaymentMethodInput,
        reason: reasonInput,
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const existing = await context.db.query.dispatch.findFirst({
        where: { id: input.id, farmId: context.farm.id },
        columns: { id: true, recordedBy: true, recordedAt: true },
      });
      if (!existing) {
        throw new ORPCError("NOT_FOUND", { message: "No such dispatch" });
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
      if (input.dispatchedAt !== undefined) {
        assertNotLater(input.dispatchedAt, now);
      }
      const audit = audited(context);
      const previous = await audit.latestEventFor(
        context.db,
        "dispatch",
        existing.id
      );
      await audit.write(
        {
          entity: "dispatch",
          entityId: existing.id,
          action: "correct",
          reason: input.reason,
          roleUsed: verdict.role,
          supersedesId: previous?.id,
          before: (tx) => readDispatch(tx, existing.id),
          after: (tx) => readDispatch(tx, existing.id),
        },
        async (tx) => {
          await tx
            .update(dispatch)
            .set({
              ...correctedFields(input),
              ...(input.buyer === undefined
                ? {}
                : await buyerOnTheDay(tx, context.farm.id, input.buyer, now)),
            })
            .where(eq(dispatch.id, existing.id));
          await bookDispatchMoney(
            tx,
            bookingOf(context, verdict.role, now),
            existing.id,
            input.paymentMethod
          );
        }
      );
      return { id: existing.id };
    }),

  /**
   * One farm day of milk leaving: what the day's Milk Records sent to Bulk, what the Dispatches handed
   * over, and each Dispatch — side by side, so milk that went into the tank and milk that left the
   * farm are not two stories nobody lines up.
   *
   * The tank counts the Sessions due that day and the Dispatches count the milk that left that day, so
   * last evening's milk collected this morning is in yesterday's tank and today's Dispatch.
   */
  day: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ day: farmDay }))
    .handler(async ({ context, input }) => {
      const range = farmDaysBetween(input.day, input.day);
      const [toBulkLitres, dispatches] = await Promise.all([
        litresToBulkBetween(context.db, context.farm.id, range),
        dispatchesBetween(context.db, context.farm.id, range),
      ]);
      return {
        day: input.day,
        toBulkLitres,
        dispatchedLitres: litresDispatched(dispatches),
        dispatches,
      };
    }),

  /** One Milking Session as the Manager reads it: the tank reading, what the cows account
   *  for, and every cow's litres with where they went. */
  session: protectedProcedure
    .use(requireRole("owner", "manager", "staff"))
    .input(z.object({ instanceId: z.string() }))
    .handler(async ({ context, input }) => {
      const session = await context.db.query.milkingSession.findFirst({
        where: { farmId: context.farm.id, instanceId: input.instanceId },
        ...sessionShape,
        with: {
          ...sessionShape.with,
          records: {
            with: { animal: { columns: { tagNumber: true } } },
            orderBy: { recordedAt: "asc" },
          },
        },
      });
      // Barn Staff read the milkings of the Pens they work, as they read those Pens' animals.
      const outOfTheirPens =
        context.roleUsed === "staff" &&
        session !== undefined &&
        !context.penIds.includes(session.penId);
      if (!session || outOfTheirPens) {
        throw new ORPCError("NOT_FOUND", {
          message: "Nothing has been milked in this session yet",
        });
      }
      return session;
    }),

  /** The Manager's queue: Sessions whose tank reading did not match the cows. */
  flagged: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(({ context }) =>
      context.db.query.milkingSession.findMany({
        where: { farmId: context.farm.id, flaggedAt: { isNotNull: true } },
        ...sessionShape,
        orderBy: { dueAt: "desc" },
        limit: 50,
      })
    ),

  /** One cow's lactation as the system derives it — never as anyone typed it. */
  forAnimal: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet", { visitingVet: true }))
    .input(z.object({ tagNumber: z.string().trim().min(1).max(32) }))
    .handler(async ({ context, input }) => {
      const beast = await context.db.query.animal.findFirst({
        where: {
          farmId: context.farm.id,
          tagNumber: input.tagNumber.toUpperCase(),
        },
        columns: {
          id: true,
          tagNumber: true,
          state: true,
          lactationNumber: true,
          lactationStartedAt: true,
          milkWithdrawalUntil: true,
        },
        with: {
          milkRecords: {
            columns: {
              litres: true,
              destination: true,
              forced: true,
              lactationNumber: true,
              recordedAt: true,
            },
            orderBy: { recordedAt: "desc" },
            limit: RECENT_RECORDS,
          },
        },
      });
      if (!beast) {
        throw new ORPCError("NOT_FOUND", {
          message: `No animal with tag ${input.tagNumber}`,
        });
      }
      assertOnTheirCases(context, beast.id);
      // Only what she gave in the Lactation she is in: an earlier one is a different curve,
      // and a total spanning both would be a number that means nothing.
      const records = beast.milkRecords.filter(
        (record) => record.lactationNumber === beast.lactationNumber
      );
      // The total is the whole Lactation, not the recent milkings the page lists: three hundred days of
      // two milkings a day is a few hundred small rows, read as litres alone.
      const wholeLactation = await context.db.query.milkRecord.findMany({
        where: {
          farmId: context.farm.id,
          animalId: beast.id,
          lactationNumber:
            beast.lactationNumber === null
              ? { isNull: true }
              : beast.lactationNumber,
        },
        columns: { litres: true },
      });
      return {
        tagNumber: beast.tagNumber,
        ...lactationView(beast, context.clock.now()),
        lactationLitres: roundLitres(
          wholeLactation.reduce(
            (total, record) => total + litresOf(record.litres),
            0
          )
        ),
        records,
      };
    }),
};
