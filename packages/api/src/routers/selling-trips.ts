import { uuidv7 } from "@OpenFarm/db/ids";
import { sellingTripAnimal } from "@OpenFarm/db/schema/fattening";
import { sellingTrip } from "@OpenFarm/db/schema/trip";
import {
  exitOf,
  farmDayOf,
  farmDaysBetween,
  shrinkOfMany,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../audit";
import { correct } from "../corrections/correction";
import {
  sellingTripCorrection,
  sellingTripCorrectionInput,
} from "../corrections/selling-trip";
import { protectedProcedure } from "../index";
import {
  farmAccountIdInput,
  paymentMethodInput,
  referenceInput,
} from "../money-inputs";
import { accountSaid, bookingOf } from "../money-store";
import { requireRole } from "../roles";
import { shrinkOfSales } from "../shrink-store";
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
  transportMoney: tripCostInput.optional(),
  /** The stall or the space, and keeping the men who went. */
  keepMoney: tripCostInput.optional(),
  /** Every Animal that stood on the lorry, by Tag Number. Sold or brought home again, and at least one:
   *  an outing that carried nobody is a lorry the farm did not hire. */
  animals: z.array(z.string().trim().min(1).max(32)).min(1).max(200),
  wentOn: z.coerce.date().optional(),
  paymentMethod: paymentMethodInput,
  /** Which Farm Account mobile money or bank money went into or came out of. */
  farmAccountId: farmAccountIdInput,
  /** Its transaction ID, or the cheque's or slip's number. */
  reference: referenceInput,
});

/** The states a beast on the Fattening side is in while she still stands here to be put on a lorry. */
const STANDING = ["quarantine", "fattening", "ready_for_sale"] as const;

export const sellingTripsRouter = {
  /**
   * The beasts a day's lorry may have carried, to tick: every one still standing on the Fattening side, and every one
   * sold that farm day — the day is often written up after the market, by when the ones sold off the lorry are gone
   * from the board. One sold on another day is not offered; she was not on this lorry to be sold.
   */
  whoCouldHaveGone: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ wentOn: z.coerce.date() }))
    .handler(async ({ context, input }) => {
      const day = farmDayOf(input.wentOn);
      const { from, until } = farmDaysBetween(day, day);
      const [standing, sold] = await Promise.all([
        context.db.query.animal.findMany({
          where: {
            farmId: context.farm.id,
            side: "fattening",
            state: { in: [...STANDING] },
          },
          columns: { tagNumber: true, state: true },
          with: { pen: { columns: { name: true } } },
          orderBy: { tagNumber: "asc" },
        }),
        context.db.query.sale.findMany({
          where: { farmId: context.farm.id, soldAt: { gte: from, lt: until } },
          columns: { id: true },
          with: { animal: { columns: { tagNumber: true } } },
          orderBy: { soldAt: "asc", id: "asc" },
        }),
      ]);
      return [
        ...standing.map((one) => ({
          tagNumber: one.tagNumber,
          penName: one.pen?.name ?? null,
          ready: one.state === "ready_for_sale",
          soldThatDay: false,
        })),
        ...sold.map((one) => ({
          tagNumber: one.animal.tagNumber,
          penName: null,
          ready: false,
          soldThatDay: true,
        })),
      ];
    }),

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
        columns: { sellingTripId: true, animalId: true },
      });
      // What those sold off each lorry lost between their last weighing and the sale's scale.
      const sold = await context.db.query.sale.findMany({
        where: {
          farmId: context.farm.id,
          animalId: { in: taken.map((one) => one.animalId) },
        },
        columns: { animalId: true, weightKg: true, soldAt: true },
      });
      const shrink = await shrinkOfSales(
        context.db,
        context.farm.id,
        sold.map((one) => ({
          animalId: one.animalId,
          weightKg: Number(one.weightKg),
          soldAt: one.soldAt,
        }))
      );
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
        costMoney: tripCostOf(one),
        /** What each part of it cost, which a Correction puts right one by one. */
        parts: { transportMoney: one.transportMoney, keepMoney: one.keepMoney },
        animals: carried.get(one.id) ?? 0,
        /** The weight those sold off it lost, together; nothing where none had both weights. */
        shrink: shrinkOfMany(
          taken
            .filter((beast) => beast.sellingTripId === one.id)
            .map((beast) => shrink.get(beast.animalId) ?? null)
        ),
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
        columns: {
          id: true,
          tagNumber: true,
          side: true,
          state: true,
          stateChangedAt: true,
        },
        with: {
          moves: {
            columns: { movedAt: true },
            orderBy: { movedAt: "asc" },
            limit: 1,
          },
        },
      });
      if (taken.length !== tags.length) {
        const found = new Set(taken.map((one) => one.tagNumber));
        const missing = tags.filter((one) => !found.has(one));
        throw new ORPCError("NOT_FOUND", {
          message: `No animal with tag ${missing.join(", ")}`,
        });
      }
      // Only who could have been on the lorry: a Fattening beast on the farm that farm day — here by its end, and not
      // gone before it began; one that came home and was sold another day paid for her place too. A carcass, or a bull
      // sold weeks before, once took a share of the day's cost from those really on it.
      const { from, until } = farmDaysBetween(
        farmDayOf(wentOn),
        farmDayOf(wentOn)
      );
      const couldNot = taken.filter((one) => {
        const came = one.moves[0]?.movedAt;
        const left = exitOf(one)?.at;
        const hereThatDay =
          came !== undefined && came < until && !(left && left < from);
        return !(one.side === "fattening" && hereThatDay);
      });
      if (couldNot.length > 0) {
        throw new ORPCError("BAD_REQUEST", {
          message: `Not on that day's lorry: ${couldNot.map((one) => one.tagNumber).join(", ")}`,
          data: {
            refusal: "not_on_that_lorry",
            tags: couldNot.map((one) => one.tagNumber).join(", "),
          },
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
            transportMoney: input.transportMoney ?? 0,
            keepMoney: input.keepMoney ?? 0,
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
            bookingOf(
              context,
              context.roleUsed,
              now,
              accountSaid(["selling_trip"], input)
            ),
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
