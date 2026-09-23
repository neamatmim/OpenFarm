import { z } from "zod";

import { outOfTheirBand } from "../band-store";
import { protectedProcedure } from "../index";
import { fatteningRows } from "../ready-store";
import { requireRole } from "../roles";

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
