import { uuidv7 } from "@OpenFarm/db/ids";
import { buyingTrip } from "@OpenFarm/db/schema/fattening";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../audit";
import {
  buyingTripCorrection,
  buyingTripCorrectionInput,
} from "../corrections/buying-trip";
import { correct } from "../corrections/correction";
import { protectedProcedure } from "../index";
import { paymentMethodInput } from "../money-inputs";
import { bookingOf } from "../money-store";
import { requireRole } from "../roles";
import {
  bookTripMoney,
  readTrip,
  tripCostInput,
  tripCostOf,
} from "../trip-store";

/** How many outings the form offers to put an arrival on. Newest first; a haat is written up the same week. */
const OFFERED = 20;

const recordInput = z.object({
  /** Where it went, as the farm says it: a haat's name, or a village's. */
  wentTo: z.string().trim().min(1).max(120),
  brokerBdt: tripCostInput.optional(),
  transportBdt: tripCostInput.optional(),
  /** Keeping the men who went: their food, and a night's lodging when the haat runs late. */
  keepBdt: tripCostInput.optional(),
  /** When the lorry went, for an outing written up the next morning. */
  wentOn: z.coerce.date().optional(),
  paymentMethod: paymentMethodInput,
});

export const tripsRouter = {
  /**
   * The outings the farm has made lately, newest first, so an arrival can be put on the one it came home
   * on. Each says what it cost and how many animals name it.
   *
   * The Owner's and the Manager's, as buying is.
   */
  list: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(async ({ context }) => {
      const rows = await context.db.query.buyingTrip.findMany({
        where: { farmId: context.farm.id },
        orderBy: { wentOn: "desc", id: "desc" },
        limit: OFFERED,
        with: { intakes: { columns: { id: true } } },
      });
      return rows.map((one) => ({
        id: one.id,
        wentTo: one.wentTo,
        wentOn: one.wentOn,
        costBdt: tripCostOf(one),
        animals: one.intakes.length,
      }));
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
            brokerBdt: (input.brokerBdt ?? 0).toFixed(2),
            transportBdt: (input.transportBdt ?? 0).toFixed(2),
            keepBdt: (input.keepBdt ?? 0).toFixed(2),
            wentOn,
            recordedBy: context.actor.id,
            recordedByRole: context.roleUsed,
            createdAt: now,
          });
          await bookTripMoney(
            tx,
            bookingOf(context, context.roleUsed, now),
            id,
            input.paymentMethod
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
