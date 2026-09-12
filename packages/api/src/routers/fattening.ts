import { z } from "zod";

import { fatteningOf } from "../fattening-store";
import { protectedProcedure } from "../index";
import { requireRole } from "../roles";

/** A farm of this size holds a few hundred on the fattening side; a page is not a ledger. */
const BOARD_LIMIT = 500;

/** As many readings as a rate needs, plus room for the page to show a little history. */
const READINGS_READ = 12;

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
      const now = context.clock.now();
      const rows = await context.db.query.animal.findMany({
        where: {
          farmId: context.farm.id,
          side: "fattening",
          state: { in: ["quarantine", "fattening", "ready_for_sale"] },
          penId: input?.penId,
        },
        columns: { id: true, tagNumber: true, state: true, penId: true },
        limit: BOARD_LIMIT,
        with: {
          pen: { columns: { name: true } },
          intake: {
            columns: {
              weightKg: true,
              arrivedAt: true,
              targetWeightKg: true,
              targetWindowStart: true,
              targetWindowEnd: true,
            },
          },
          /** Newest first, because a `limit` on an ascending order takes her *first* readings
           *  and would leave the board a year behind her own page. Sorted back into order where
           *  the gain is worked out. */
          weighIns: {
            orderBy: { weighedAt: "desc", id: "desc" },
            limit: READINGS_READ,
            columns: { weightKg: true, weighedAt: true },
          },
        },
      });
      // A male calf weaned onto this side was never bought, so it has no Intake and no gain
      // since one — but it is standing in the pen being fed, and a board that left it out would
      // be hiding a whole cohort from the Owner. It appears with what is knowable about it.
      return rows.map(({ intake, weighIns, pen, ...animal }) => ({
        ...animal,
        penName: pen.name,
        targetWindow: intake
          ? { start: intake.targetWindowStart, end: intake.targetWindowEnd }
          : null,
        ...fatteningOf(intake, weighIns, now),
      }));
    }),
};
