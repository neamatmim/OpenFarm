import { fatteningView, startOfFarmDay } from "@OpenFarm/domain";
import { z } from "zod";

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
          weighIns: {
            orderBy: { weighedAt: "asc" },
            limit: READINGS_READ,
            columns: { weightKg: true, weighedAt: true },
          },
        },
      });
      return rows.flatMap((row) => {
        // An animal on the fattening side that the farm did not buy in — one moved across from
        // the dairy — has no Intake to measure from. It belongs on the side, not on this board.
        if (!row.intake) {
          return [];
        }
        const { intake, weighIns, pen, ...animal } = row;
        return [
          {
            ...animal,
            penName: pen.name,
            targetWindow: {
              start: intake.targetWindowStart,
              end: intake.targetWindowEnd,
            },
            ...fatteningView(
              {
                weightKg: Number(intake.weightKg),
                arrivedAt: intake.arrivedAt,
                targetWeightKg: Number(intake.targetWeightKg),
              },
              weighIns.map((reading) => ({
                weightKg: Number(reading.weightKg),
                weighedAt: reading.weighedAt,
              })),
              startOfFarmDay(intake.targetWindowStart),
              now
            ),
          },
        ];
      });
    }),
};
