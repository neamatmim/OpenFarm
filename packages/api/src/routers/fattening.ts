import { eq } from "@OpenFarm/db/operators";
import { farm } from "@OpenFarm/db/schema/farm";
import { z } from "zod";

import { pricesOnTheSide } from "../animal-price-store";
import { audited } from "../audit";
import { outOfTheirBand } from "../band-store";
import { protectedProcedure } from "../index";
import { fatteningRows } from "../ready-store";
import {
  OWNER_ONLY,
  requireOnly,
  requirePersonalSession,
  requireRole,
} from "../roles";

export const fatteningRouter = {
  /**
   * The fattening side at a glance: what each animal weighs, how fast it is gaining, and
   * whether that makes its target weight before its Target Window opens.
   *
   * The Owner's and the Manager's (roles matrix: Intake / Sale is `R` to the Owner and `C R U`
   * to the Manager). Every figure is worked out from Intake and Weigh-ins — nothing here was
   * typed by anybody, which is the point: a projection somebody typed is an opinion.
   */
  board: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ penId: z.string().optional() }).optional())
    .handler(async ({ context, input }) => {
      const rows = await fatteningRows(
        context.db,
        context.farm.id,
        {
          penId: input?.penId,
          states: ["quarantine", "fattening", "ready_for_sale"],
        },
        context.clock.now()
      );
      // A male calf weaned onto this side was never bought, so it has no Intake and no gain
      // since one — but it is standing in the pen being fed, and a board that left it out would
      // be hiding a whole cohort from the Owner. It appears with what is knowable about it.
      return rows.map(
        ({ window: _window, setAside: _aside, view, ...rest }) => ({
          ...rest,
          ...view,
        })
      );
    }),

  /**
   * Every animal on the fattening side priced for the Owner: what she has cost so far, her break-even price a kilo,
   * and what she might fetch at the low and the high price a kilo — her Venture's, or the farm's market price for the
   * farm's own — with what each leaves over her cost (`pricesOnTheSide`). The Owner's alone, as an animal's money is:
   * the Manager reads what she weighs, not what she made.
   */
  prices: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .handler(
      async ({ context }) =>
        await pricesOnTheSide(context.db, context.farm, context.clock.now())
    ),

  /**
   * What a kilo of live weight is fetching, low and high, as the Owner judges the market: what the farm's own animals
   * are priced at. The Owner's guess, changed as the market moves, each change an Audit Event.
   */
  setMarketPrice: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z
        .object({
          lowBdtPerKg: z.number().positive().max(100_000),
          highBdtPerKg: z.number().positive().max(100_000),
        })
        .refine((one) => one.lowBdtPerKg <= one.highBdtPerKg, {
          message: "The low price is above the high one",
          path: ["lowBdtPerKg"],
        })
    )
    .handler(async ({ context, input }) => {
      const setAt = context.clock.now();
      await audited(context).write(
        {
          entity: "farm",
          entityId: context.farm.id,
          action: "update",
          before: {
            marketLowBdtPerKg: context.farm.marketLowBdtPerKg,
            marketHighBdtPerKg: context.farm.marketHighBdtPerKg,
          },
          after: {
            marketLowBdtPerKg: input.lowBdtPerKg,
            marketHighBdtPerKg: input.highBdtPerKg,
          },
        },
        (tx) =>
          tx
            .update(farm)
            .set({
              marketLowBdtPerKg: input.lowBdtPerKg,
              marketHighBdtPerKg: input.highBdtPerKg,
              marketPriceSetAt: setAt,
            })
            .where(eq(farm.id, context.farm.id))
      );
      return { setAt };
    }),

  /**
   * The bulls the scale says are in the wrong Pen for their size — grown past the weight band of their Pen's Ration,
   * or not yet up to it — each with the Pens whose Ration their weight fits. The Owner's and the Manager's, who move
   * them.
   */
  outOfBand: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(
      async ({ context }) => await outOfTheirBand(context.db, context.farm.id)
    ),
};
