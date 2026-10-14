import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { dispatch } from "@OpenFarm/db/schema/milk";
import {
  receivableAtTheGate,
  farmDayOf,
  farmDaysBetween,
  lactationSummary,
  lactationsOf,
  lactationView,
  roundLiters,
  tagNumberAsWritten,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../audit";
import {
  assertNoStatementCovers,
  besideInput,
  priceToFollowOf,
  recordStatement,
  statementBesideOf,
  statementInput,
  statementsOf,
  voidStatement,
} from "../buyer-statement-store";
import { correct, reasonInput } from "../corrections/correction";
import {
  dispatchCorrection,
  dispatchCorrectionInput,
} from "../corrections/dispatch";
import {
  assertNotLater,
  bookDispatchMoney,
  buyerInput,
  buyerOnTheDay,
  dispatchFields,
  dispatchesBetween,
  litersDispatched,
  milkBuyersOf,
  litersToBulkBetween,
  milkAccountOn,
  readDispatch,
  twoPlaces,
  worthOfDispatch,
} from "../dispatch-store";
import { farmDay } from "../farm-clock";
import { protectedProcedure } from "../index";
import { litersOf, milkDropsOn } from "../milk-store";
import {
  farmAccountIdInput,
  paymentMethodInput,
  referenceInput,
} from "../money-inputs";
import { accountSaid, bookingOf } from "../money-store";
import {
  receivableOrRefuse,
  owingNowOf,
  paidNowInput,
  promisedByInput,
  tellIfLentAfterWriteOff,
} from "../receivable-store";
import { refuse } from "../refuse";
import {
  OWNER_ONLY,
  requireOnly,
  requirePersonalSession,
  requireRole,
} from "../roles";
import { isPenInScope, requireLookUp } from "../scope";

/** How many of a cow's recent milkings to hand back; enough for a fortnight of two-a-day
 *  sessions, which is as far as a phone screen usefully goes. */
const RECENT_RECORDS = 30;

const sessionShape = {
  columns: {
    id: true,
    instanceId: true,
    penId: true,
    dueAt: true,
    bulkLiters: true,
    sumBulkLiters: true,
    differenceLiters: true,
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

export const milkRouter = {
  /**
   * Milk handed over to a buyer: when, how many liters, to whom, the delivery note, the price, and the fat
   * and SNF if the processor measured them.
   *
   * The Manager's to record, or the Owner's, who may do anything the Manager does (the Owner,
   * 2026-09-17). The buyer is a Counterparty found by name, whose address is what makes this the farm's
   * milk-buyer record.
   */
  dispatch: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(
      z
        .object({
          ...dispatchFields,
          /** Left out only where its price is to follow. */
          pricePerLiterMoney: dispatchFields.pricePerLiterMoney.optional(),
          /** Sent with its price to follow, for the buyer's statement to set: liters and no money until it does. */
          priceToFollow: z.literal(true).optional(),
          deliveryNote: dispatchFields.deliveryNote.optional(),
          fatPercent: dispatchFields.fatPercent.optional(),
          snfPercent: dispatchFields.snfPercent.optional(),
          note: dispatchFields.note.optional(),
          buyer: buyerInput,
          paymentMethod: paymentMethodInput,
          /** Which Farm Account mobile money or bank money went into or came out of. */
          farmAccountId: farmAccountIdInput,
          /** Its transaction ID, or the check's or slip's number. */
          reference: referenceInput,
          /** What the buyer paid there and then; left out, all of it. Less than the milk came to, and the rest is his
           *  Receivable. */
          paidNowMoney: paidNowInput.optional(),
          /** The day he promised to pay the rest by, when he named one. A milk buyer who pays on a round often does
           *  not, so it is never asked for. */
          promisedBy: promisedByInput.optional(),
        })
        // A price, or its price to follow: never both, never neither.
        .refine(
          (said) =>
            (said.pricePerLiterMoney === undefined) ===
            (said.priceToFollow === true),
          {
            message: "A price, or its price to follow",
            path: ["priceToFollow"],
          }
        )
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const recordedByRole = context.roleUsed;
      if (!recordedByRole) {
        throw new ORPCError("FORBIDDEN");
      }
      assertNotLater(input.dispatchedAt, now);
      const price = input.pricePerLiterMoney;
      // Milk whose price is to follow was paid nothing at the gate and is owed nothing yet: its statement sets both.
      if (price === undefined && (input.paidNowMoney ?? 0) > 0) {
        throw refuse(
          "price_to_follow_paid",
          "Nothing is paid at the gate for milk whose price is to follow"
        );
      }
      const receivable =
        price === undefined
          ? { receivableMoney: 0, promisedBy: null }
          : receivableOrRefuse(
              receivableAtTheGate({
                worthMoney: worthOfDispatch({
                  liters: input.liters,
                  pricePerLiterMoney: price,
                }),
                paidNowMoney: input.paidNowMoney,
                promisedBy: input.promisedBy,
                leftOn: farmDayOf(input.dispatchedAt),
                promiseRequired: false,
              })
            );
      const id = newId(now);
      await audited(context).write(
        {
          entity: "dispatch",
          reachesMoney: true,
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
          if (price === undefined) {
            await assertNoStatementCovers(
              tx,
              context.farm.id,
              buyer.buyerId,
              input.dispatchedAt
            );
          }
          await tx.insert(dispatch).values({
            id,
            farmId: context.farm.id,
            dispatchedAt: input.dispatchedAt,
            liters: input.liters.toFixed(2),
            ...buyer,
            deliveryNote: input.deliveryNote ?? null,
            pricePerLiterMoney: twoPlaces(price),
            fatPercent: twoPlaces(input.fatPercent),
            snfPercent: twoPlaces(input.snfPercent),
            ...receivable,
            note: input.note ?? null,
            recordedBy: context.actor.id,
            recordedByRole,
            recordedAt: now,
          });
          await bookDispatchMoney(
            tx,
            bookingOf(
              context,
              recordedByRole,
              now,
              accountSaid(["dispatch"], input)
            ),
            id,
            input.paymentMethod
          );
          await tellIfLentAfterWriteOff(
            tx,
            context.farm.id,
            {
              id,
              counterpartyId: buyer.buyerId,
              receivableMoney: receivable.receivableMoney,
            },
            now
          );
        }
      );
      return { id };
    }),

  /**
   * Puts a Dispatch right: the liters, the time, the buyer, the delivery note, the price, the fat or SNF. A
   * Correction like any other — a reason, the Role's Correction Window, the trail holding what it said.
   * A delivery note, a note, a fat or an SNF sent as nothing is cleared: a figure written against the wrong
   * lorry is put right by taking it away.
   *
   * The Manager's, as recording is, and the Owner's — whose Correction Window never closes (Owner, 2026-09-14: the
   * spec's "Owner always" over the matrix's read-only Owner).
   */
  correctDispatch: protectedProcedure
    .use(requireRole(...dispatchCorrection.roles))
    .input(dispatchCorrectionInput)
    .handler(({ context, input }) =>
      correct(context, dispatchCorrection, input)
    ),

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
      const [toBulkLiters, dispatches] = await Promise.all([
        litersToBulkBetween(context.db, context.farm.id, range),
        dispatchesBetween(context.db, context.farm.id, range),
      ]);
      // What each buyer still owes on it today, as his payments have left it.
      const owing = await owingNowOf(
        context.db,
        context.farm.id,
        dispatches.filter((one) => one.receivableMoney > 0).map((one) => one.id)
      );
      return {
        day: input.day,
        toBulkLiters,
        dispatchedLiters: litersDispatched(dispatches),
        dispatches: dispatches.map((one) => ({
          ...one,
          owingMoney: owing.get(one.id) ?? 0,
        })),
      };
    }),

  /** One Milking Session as the Manager reads it: the tank reading, what the cows account
   *  for, and every cow's liters with where they went. */
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
        session !== undefined && !isPenInScope(context.scope, session.penId);
      if (!session || outOfTheirPens) {
        throw new ORPCError("NOT_FOUND", {
          message: "Nothing has been milked in this session yet",
        });
      }
      return session;
    }),

  /** The farm's milk buyers of the last half year, each with his last price, his address and phone, and whether he takes
   *  his milk on credit — for the Dispatch sheet to fill in once he is picked. Whoever records the milk leaving reads it. */
  buyers: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(({ context }) =>
      milkBuyersOf(context.db, context.farm.id, context.clock.now())
    ),

  /**
   * The farm's **Buyer Statements**, the latest days first, each beside the farm's own milk to him in its days — his
   * liters against the farm's, and what it priced. The Manager's, who records them, and the Owner's.
   */
  statements: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(({ context }) => statementsOf(context.db, context.farm.id)),

  /** A statement as it is typed, beside the farm's own milk to him in its days, and what of it would be refused. */
  statementBeside: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(besideInput)
    .handler(({ context, input }) =>
      statementBesideOf(context.db, context.farm.id, input)
    ),

  /**
   * Records a buyer's statement and prices the milk sent him in its days with its price to follow, making what he owes
   * for it his Receivable (ADR 0030). The Manager's or the Owner's; in a month the Owner has closed, hers alone. Once
   * however often the phone sends it.
   */
  recordStatement: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(statementInput)
    .handler(({ context, input }) => recordStatement(context, input)),

  /** The Owner voids a wrong statement, with her reason: the milk it priced goes back to its price to follow. */
  voidStatement: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ id: z.string(), reason: reasonInput }))
    .handler(({ context, input }) => voidStatement(context, input)),

  /** A statement's photograph, read on its own so the list carries none. */
  statementPhoto: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const photo = await context.db.query.buyerStatementPhoto.findFirst({
        where: { statementId: input.id, farmId: context.farm.id },
        columns: { contentType: true, data: true },
      });
      if (!photo) {
        throw new ORPCError("NOT_FOUND", { message: "No photo kept" });
      }
      return photo;
    }),

  /**
   * Every buyer with milk whose price is still to follow, the longest waiting first, with how much of it is late: the
   * homes say so, and the Statements tab lists it.
   */
  priceToFollow: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(({ context }) =>
      priceToFollowOf(
        context.db,
        context.farm.id,
        farmDayOf(context.clock.now())
      )
    ),

  /** The week's milk: into the tank, out of the gate, still in the tank, and what nobody can account for. */
  account: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(async ({ context }) => ({
      ...(await milkAccountOn(
        context.db,
        context.farm.id,
        context.clock.now()
      )),
      /** The Owner's line, past which the week is told about. */
      linePercent: context.farm.milkUnaccountedPercent,
    })),

  /** Cows in milk giving well under their own week: the Manager's to look at, and the Vet's. */
  givingLess: protectedProcedure
    .use(requireRole("owner", "manager", "vet"))
    .handler(({ context }) =>
      milkDropsOn(context.db, context.farm, context.clock.now())
    ),

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
          tagNumber: tagNumberAsWritten(input.tagNumber),
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
              liters: true,
              destination: true,
              forced: true,
              lactationNumber: true,
              recordedAt: true,
            },
            orderBy: { recordedAt: "desc" },
            limit: RECENT_RECORDS,
          },
          calvings: { columns: { calvedAt: true, lactationNumber: true } },
          dryOffs: {
            columns: {
              lactationNumber: true,
              lactationStartedAt: true,
              driedAt: true,
            },
          },
        },
      });
      if (!beast) {
        throw new ORPCError("NOT_FOUND", {
          message: `No animal with tag ${input.tagNumber}`,
        });
      }
      requireLookUp(context.scope, beast);
      // Only what she gave in the Lactation she is in: an earlier one is a different curve,
      // and a total spanning both would be a number that means nothing.
      const records = beast.milkRecords.filter(
        (record) => record.lactationNumber === beast.lactationNumber
      );
      // The total is the whole Lactation, not the recent milkings the page lists: three hundred days of
      // two milkings a day is a few hundred small rows, read as liters alone.
      const wholeLactation = await context.db.query.milkRecord.findMany({
        where: {
          farmId: context.farm.id,
          animalId: beast.id,
          lactationNumber:
            beast.lactationNumber === null
              ? { isNull: true }
              : beast.lactationNumber,
        },
        columns: { liters: true, recordedAt: true },
      });
      return {
        tagNumber: beast.tagNumber,
        ...lactationView(beast, context.clock.now()),
        /** What she gave in it a farm day at a time: a day on average, her best day, and lately. */
        summary: lactationSummary(wholeLactation),
        /** Every Lactation the farm knows of hers, latest first: how long she milked, and how long she stood dry. */
        lactations: lactationsOf(beast, context.clock.now()),
        lactationLiters: roundLiters(
          wholeLactation.reduce(
            (total, record) => total + litersOf(record.liters),
            0
          )
        ),
        records,
      };
    }),
};
