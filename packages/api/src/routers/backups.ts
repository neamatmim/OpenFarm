import { z } from "zod";

import { protectedProcedure } from "../index";
import { requireRole } from "../roles";

/** How many nights of history a screen shows. Enough to see a run of failures, which is the
 *  thing worth seeing. */
const RECENT = 30;

/** A day without a copy. */
const DAY_MS = 24 * 60 * 60 * 1000;

export const backupsRouter = {
  /**
   * Whether the farm is being copied off the machine it lives on, and when it last was.
   *
   * Written by the nightly job, read here, so "are the backups running?" is a question the
   * app answers rather than one somebody has to find a console for. A farm that has not been
   * copied for two nights is a farm one disk away from losing its own records.
   */
  recent: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(
      z
        .object({ limit: z.number().int().min(1).max(RECENT).default(RECENT) })
        .default({ limit: RECENT })
    )
    .handler(async ({ context, input }) => {
      const runs = await context.db.query.backupRun.findMany({
        orderBy: { startedAt: "desc" },
        limit: input.limit,
      });
      const lastGood = runs.find((run) => run.ok === "yes");
      const since = lastGood
        ? context.clock.now().getTime() - lastGood.startedAt.getTime()
        : null;
      return {
        runs,
        lastGoodAt: lastGood?.startedAt ?? null,
        /** Whole days since the last copy that worked — days, not nights: a copy taken at
         *  eleven and read at one in the morning is two hours old, not a night. Null when
         *  there has never been one, which is a different and worse thing than a gap. */
        daysSince: since === null ? null : Math.floor(since / DAY_MS),
      };
    }),
};
