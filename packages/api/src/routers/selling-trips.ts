import { uuidv7 } from "@OpenFarm/db/ids";
import { sellingTripAnimal } from "@OpenFarm/db/schema/fattening";
import { sellingTrip } from "@OpenFarm/db/schema/trip";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../audit";
import { correct } from "../corrections/correction";
import {
  sellingTripCorrection,
  sellingTripCorrectionInput,
} from "../corrections/selling-trip";
import { protectedProcedure } from "../index";
import { paymentMethodInput } from "../money-inputs";
import { bookingOf } from "../money-store";
import { requireRole } from "../roles";
import {
  bookSellingTripMoney,
  readSellingTrip,
  tripCostInput,
  tripCostOf,
} from "../trip-store";

/** How many outings the farm is offered when it looks back at them. Newest first. */
const OFFERED = 20;

const recordInput = z.object({
  /** Where it went, as the farm says it. */
  wentTo: z.string().trim().min(1).max(120),
  transportBdt: tripCostInput.optional(),
  /** The stall or the space, and keeping the men who went. */
  keepBdt: tripCostInput.optional(),
  /** Every Animal that stood on the lorry, by Tag Number. Sold or brought home again, and at least one:
   *  an outing that carried nobody is a lorry the farm did not hire. */
  animals: z.array(z.string().trim().min(1).max(32)).min(1).max(200),
  wentOn: z.coerce.date().optional(),
  paymentMethod: paymentMethodInput,
});

export const sellingTripsRouter = {
  /** The outings the farm has made to sell, newest first. The Owner's and the Manager's. */
  list: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(async ({ context }) => {
      const rows = await context.db.query.sellingTrip.findMany({
        where: { farmId: context.farm.id },
        orderBy: { wentOn: "desc", id: "desc" },
        limit: OFFERED,
      });
      const taken = await context.db.query.sellingTripAnimal.findMany({
        where: { sellingTripId: { in: rows.map((one) => one.id) } },
        columns: { sellingTripId: true },
      });
      const carried = new Map<string, number>();
      for (const one of taken) {
        carried.set(
          one.sellingTripId,
          (carried.get(one.sellingTripId) ?? 0) + 1
        );
      }
      return rows.map((one) => ({
        id: one.id,
        wentTo: one.wentTo,
        wentOn: one.wentOn,
        costBdt: tripCostOf(one),
        animals: carried.get(one.id) ?? 0,
      }));
    }),

  /**
   * One outing to sell recorded: where the lorry went, what the day cost, and every Animal that stood on
   * it. Who was taken is written down rather than read back from who sold, because the ones that came home
   * again paid for their place too.
   *
   * The Manager's, as selling is; the Owner may do anything the Manager does.
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
      // The same beast ticked twice is one beast on the lorry.
      const tags = [...new Set(input.animals.map((one) => one.toUpperCase()))];
      const taken = await context.db.query.animal.findMany({
        where: { farmId: context.farm.id, tagNumber: { in: tags } },
        columns: { id: true, tagNumber: true },
      });
      if (taken.length !== tags.length) {
        const found = new Set(taken.map((one) => one.tagNumber));
        const missing = tags.filter((one) => !found.has(one));
        throw new ORPCError("NOT_FOUND", {
          message: `No animal with tag ${missing.join(", ")}`,
        });
      }
      const id = uuidv7(now);
      await audited(context).write(
        {
          entity: "selling_trip",
          entityId: id,
          action: "create",
          after: (tx) => readSellingTrip(tx, context.farm.id, id),
        },
        async (tx) => {
          await tx.insert(sellingTrip).values({
            id,
            farmId: context.farm.id,
            wentTo: input.wentTo,
            transportBdt: (input.transportBdt ?? 0).toFixed(2),
            keepBdt: (input.keepBdt ?? 0).toFixed(2),
            wentOn,
            recordedBy: context.actor.id,
            recordedByRole: context.roleUsed,
            createdAt: now,
          });
          await tx
            .insert(sellingTripAnimal)
            .values(
              taken.map((one) => ({ sellingTripId: id, animalId: one.id }))
            );
          await bookSellingTripMoney(
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
   * Puts right what a selling outing cost, or where it went — and with it its Money Event, rather than a
   * second one. Every Animal taken on it carries her share of the new figure at once.
   */
  correct: protectedProcedure
    .use(requireRole(...sellingTripCorrection.roles))
    .input(sellingTripCorrectionInput)
    .handler(({ context, input }) =>
      correct(context, sellingTripCorrection, input)
    ),
};
