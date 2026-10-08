import { uuidv7 } from "@OpenFarm/db/ids";
import { buyingTrip } from "@OpenFarm/db/schema/trip";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../audit";
import { assertTheHand } from "../cash-store";
import {
  buyingTripCorrection,
  buyingTripCorrectionInput,
} from "../corrections/buying-trip";
import { correct } from "../corrections/correction";
import { protectedProcedure } from "../index";
import {
  farmAccountIdInput,
  paymentMethodInput,
  referenceInput,
} from "../money-inputs";
import { accountSaid, bookingOf } from "../money-store";
import { requireRole } from "../roles";
import {
  bookTripMoney,
  readTrip,
  tripCostInput,
  tripCostOf,
} from "../trip-store";
import { whatTheFloatBought } from "../venture-store";

/** How many outings the form offers to put an arrival on. Newest first; a livestock market is written up the same week. */
const OFFERED = 20;

const recordInput = z.object({
  /** Where it went, as the farm says it: a livestock market's name, or a village's. */
  wentTo: z.string().trim().min(1).max(120),
  brokerMoney: tripCostInput.optional(),
  transportMoney: tripCostInput.optional(),
  /** Keeping the men who went: their food, and a night's lodging when the livestock market runs late. */
  keepMoney: tripCostInput.optional(),
  /** When the lorry went, for an outing written up the next morning. */
  wentOn: z.coerce.date().optional(),
  paymentMethod: paymentMethodInput,
  /** Which Farm Account mobile money or bank money went into or came out of. */
  farmAccountId: farmAccountIdInput,
  /** Whose hand paid the cash, where it was not the writer's: the Owner writing up the Manager's lorry. */
  heldBy: z.string().optional(),
  /** Its transaction ID, or the check's or slip's number. */
  reference: referenceInput,
});

export const buyingTripsRouter = {
  /**
   * The outings the farm has made lately, newest first, so an arrival can be put on the one it came home
   * on. Each says what it cost and how many animals name it.
   *
   * The Owner's and the Manager's, as buying is.
   */
  list: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(
      z
        .object({
          /** Instead of the latest outings, every one still holding this Venture's Float, however old — the
           *  ones it has to count home before it can finish buying or settle. */
          openFloatsOf: z.string().min(1).optional(),
        })
        .optional()
    )
    .handler(async ({ context, input }) => {
      const stillOut = input?.openFloatsOf
        ? await context.db.query.ventureMovement.findMany({
            where: {
              farmId: context.farm.id,
              ventureId: input.openFloatsOf,
              kind: "float_out",
              reconciledAt: { isNull: true },
            },
            columns: { buyingTripId: true },
          })
        : null;
      if (stillOut?.length === 0) {
        return [];
      }
      const rows = await context.db.query.buyingTrip.findMany({
        where: stillOut
          ? {
              farmId: context.farm.id,
              id: {
                in: stillOut.flatMap((one) =>
                  one.buyingTripId ? [one.buyingTripId] : []
                ),
              },
            }
          : { farmId: context.farm.id },
        orderBy: { wentOn: "desc", id: "desc" },
        limit: stillOut ? undefined : OFFERED,
        with: { intakes: { columns: { id: true } } },
      });
      // What each outing was given, and by whom. The Manager reads it because she is the one taking it
      // to the livestock market; she may see what is in her hand without being able to draw it.
      const floats = await context.db.query.ventureMovement.findMany({
        where: {
          farmId: context.farm.id,
          kind: "float_out",
          buyingTripId: { in: rows.map((one) => one.id) },
        },
        with: { venture: { columns: { name: true } } },
      });
      const given = new Map(
        floats.flatMap((one) =>
          one.buyingTripId
            ? [
                [
                  one.buyingTripId,
                  {
                    amountMoney: one.amountMoney,
                    ventureId: one.ventureId,
                    ventureName: one.venture?.name ?? "",
                    /** When it was reconciled, or null while it is still out at the livestock market. */
                    reconciledAt: one.reconciledAt,
                  },
                ] as const,
              ]
            : []
        )
      );
      // The outings the Owner handed the Farm's own Float for: every animal on one is the Farm's.
      const farmFloats = await context.db.query.handover.findMany({
        where: {
          farmId: context.farm.id,
          float: "out",
          buyingTripId: { in: rows.map((one) => one.id) },
        },
        columns: { buyingTripId: true },
      });
      const farmFloated = new Set(
        farmFloats.flatMap((one) =>
          one.buyingTripId ? [one.buyingTripId] : []
        )
      );
      // What each funded outing has bought, worked out by the one function that also refuses a count
      // that does not balance — so the sheet and the refusal can never disagree.
      const bought = new Map(
        await Promise.all(
          [...given].map(async ([tripId, float]) => {
            const sum = await whatTheFloatBought(context.db, context.farm.id, {
              buyingTripId: tripId,
              ventureId: float.ventureId,
            });
            return [tripId, sum.animalsMoney + sum.tripMoney] as const;
          })
        )
      );
      return rows.map((one) => {
        const float = given.get(one.id);
        return {
          id: one.id,
          wentTo: one.wentTo,
          wentOn: one.wentOn,
          costMoney: tripCostOf(one),
          /** What each part of it cost, which a Correction puts right one by one. */
          parts: {
            brokerMoney: one.brokerMoney,
            transportMoney: one.transportMoney,
            keepMoney: one.keepMoney,
          },
          animals: one.intakes.length,
          /** Whether its Float — a Venture's, or the Farm's own — has been counted home: it then takes no animal
           *  and no change to what it cost. */
          countedHome:
            one.floatReconciledAt !== null ||
            (float?.reconciledAt ?? null) !== null,
          /** Whether the Owner handed the Farm's own Float for it: every animal it brings home is then the Farm's. */
          farmFloat: farmFloated.has(one.id),
          /** The Buying Float this outing was given, where one was. */
          float: float
            ? { ...float, boughtMoney: bought.get(one.id) ?? 0 }
            : null,
        };
      });
    }),

  /**
   * One outing recorded: where it went and what it cost beyond the animals themselves. Its cost is split
   * evenly across the Animals whose Intakes name it — and charged to nobody, and said so, while none do.
   *
   * The Manager's, as recording an arrival is; the Owner may do anything the Manager does.
   */
  record: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(recordInput)
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const wentOn = input.wentOn ?? now;
      if (wentOn.getTime() > now.getTime()) {
        throw new ORPCError("BAD_REQUEST", {
          message: "A lorry cannot have gone tomorrow",
          data: { refusal: "went_in_the_future" },
        });
      }
      const id = uuidv7(now);
      await audited(context).write(
        {
          entity: "buying_trip",
          entityId: id,
          action: "create",
          after: (tx) => readTrip(tx, context.farm.id, id),
        },
        async (tx) => {
          await tx.insert(buyingTrip).values({
            id,
            farmId: context.farm.id,
            wentTo: input.wentTo,
            brokerMoney: input.brokerMoney ?? 0,
            transportMoney: input.transportMoney ?? 0,
            keepMoney: input.keepMoney ?? 0,
            wentOn,
            recordedBy: context.actor.id,
            recordedByRole: context.roleUsed,
            createdAt: now,
          });
          await bookTripMoney(
            tx,
            bookingOf(
              context,
              context.roleUsed,
              now,
              accountSaid(["buying_trip"], input)
            ),
            id,
            input.paymentMethod,
            await assertTheHand(
              tx,
              context.farm.id,
              { id: context.actor.id, roles: context.roles },
              input.heldBy
            )
          );
        }
      );
      return { id };
    }),

  /**
   * Puts right what an outing cost, or where it went — and with it its Money Event, rather than a second
   * one. A Correction like any other: a reason, the Role's Correction Window, and the trail holding what it
   * said before. Every Animal that came home on it is re-charged at once, because no share is stored.
   */
  correct: protectedProcedure
    .use(requireRole(...buyingTripCorrection.roles))
    .input(buyingTripCorrectionInput)
    .handler(({ context, input }) =>
      correct(context, buyingTripCorrection, input)
    ),
};
