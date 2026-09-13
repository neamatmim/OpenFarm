import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { FEED_IN_KINDS, feedIn } from "@OpenFarm/db/schema/feed";
import { startOfFarmDay } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../audit";
import { counterpartyNamed } from "../counterparty-store";
import { farmDay } from "../farm-clock";
import { protectedProcedure } from "../index";
import { requireRole } from "../roles";
import { stockOnHand } from "../stock-store";

const supplierInput = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().max(300).optional(),
  phone: z.string().trim().max(40).optional(),
});

export const stockRouter = {
  /**
   * What is in the store, Feed Item by Feed Item, and what a unit of each cost.
   *
   * The Owner's to read and the Manager's to keep (roles matrix: Feed stock — Owner R, Manager C R
   * U). Barn Staff and the Vet see none of it: it carries prices, and money is never theirs.
   */
  onHand: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(({ context }) => stockOnHand(context.db, context.farm.id)),

  /**
   * Feed coming into the store: a Purchase — how much, what the lot cost, and who from — or a Harvest
   * from the farm's own fields, which has neither a price nor a supplier.
   *
   * The Manager's to record. A purchase without a price or a supplier is not a purchase anybody could
   * account for, and a harvest with a price is money that never changed hands; both are refused rather
   * than guessed at.
   */
  receive: protectedProcedure
    .use(requireRole("manager"))
    .input(
      z.object({
        feedItemId: z.string(),
        kind: z.enum(FEED_IN_KINDS),
        quantity: z.number().positive().max(1_000_000),
        priceBdt: z.number().positive().max(100_000_000).optional(),
        supplier: supplierInput.optional(),
        receivedOn: farmDay,
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const recordedByRole = context.roleUsed;
      if (!recordedByRole) {
        throw new ORPCError("FORBIDDEN");
      }
      const bought = input.kind === "purchase";
      if (bought && !(input.priceBdt && input.supplier)) {
        throw new ORPCError("BAD_REQUEST", {
          message: "A purchase names what it cost and who it came from",
          data: { refusal: "purchase_needs_price_and_supplier" },
        });
      }
      if (!bought && (input.priceBdt || input.supplier)) {
        throw new ORPCError("BAD_REQUEST", {
          message: "A harvest comes from the farm's own fields, at no price",
          data: { refusal: "harvest_has_no_price" },
        });
      }
      const receivedOn = startOfFarmDay(input.receivedOn);
      if (receivedOn > now) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Feed cannot have come in on a day that has not come yet",
        });
      }
      const item = await context.db.query.feedItem.findFirst({
        where: { id: input.feedItemId, farmId: context.farm.id },
        columns: { id: true, retiredAt: true },
      });
      if (!item) {
        throw new ORPCError("NOT_FOUND", { message: "No such feed" });
      }
      const id = newId(now);
      await audited(context).write(
        {
          entity: "feed_in",
          entityId: id,
          action: "create",
          after: async (tx) =>
            (await tx.query.feedIn.findFirst({ where: { id } })) ?? null,
        },
        async (tx) => {
          await tx.insert(feedIn).values({
            id,
            farmId: context.farm.id,
            feedItemId: item.id,
            kind: input.kind,
            quantity: input.quantity.toFixed(1),
            priceBdt: input.priceBdt?.toFixed(2) ?? null,
            counterpartyId: input.supplier
              ? await counterpartyNamed(
                  tx,
                  context.farm.id,
                  input.supplier,
                  now
                )
              : null,
            receivedOn,
            recordedBy: context.actor.id,
            recordedByRole,
            recordedAt: now,
          });
        }
      );
      return { id };
    }),
};
