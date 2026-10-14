import { uuidv7 } from "@OpenFarm/db/ids";
import { restoreDrill } from "@OpenFarm/db/schema/backup";
import { farmDayOf, startOfFarmDay } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../audit";
import { farmDay } from "../farm-clock";
import { protectedProcedure } from "../index";
import { requireRole } from "../roles";
import { drillStandingOf } from "../the-machinery-notices";

/** How many drills the page lists: two years of quarters. */
const DRILLS_SHOWN = 8;

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
  list: protectedProcedure
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

  /**
   * The farm's Restore Drills, newest first, and when the next is due: a quarter after the last, or — never drilled — a
   * quarter after the first good copy. Whoever reads the copies reads these.
   */
  drills: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(async ({ context }) => {
      const now = context.clock.now();
      const [rows, standing] = await Promise.all([
        context.db.query.restoreDrill.findMany({
          where: { farmId: context.farm.id },
          orderBy: { doneOn: "desc", recordedAt: "desc", id: "desc" },
          limit: DRILLS_SHOWN,
          with: { recorder: { columns: { name: true } } },
        }),
        drillStandingOf(context.db, context.farm.id, now),
      ]);
      const drills = rows.map((row) => ({
        id: row.id,
        doneOn: farmDayOf(row.doneOn),
        wentWell: row.wentWell,
        backupUsed: row.backupUsed,
        note: row.note,
        recordedByName: row.recorder.name,
        recordedAt: row.recordedAt,
      }));
      return {
        drills,
        last: drills[0] ?? null,
        /** The farm day the next is due; null while there is no good copy to restore. */
        dueOn: standing.dueOn,
        overdue: standing.overdue,
      };
    }),

  /**
   * Writes a Restore Drill down: the day it was done, whether it went well, which copy was restored, and a note — which
   * a drill that went badly must have, saying what was missing (the runbook: do not tidy it away). The Owner's or a
   * Manager's, who did it between them. Never edited: one written wrong is written again, and the latest stands.
   */
  recordDrill: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(
      z.object({
        doneOn: farmDay,
        wentWell: z.boolean(),
        backupUsed: z.string().trim().max(200).optional(),
        note: z.string().trim().max(1000).optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      if (input.doneOn > farmDayOf(now)) {
        throw new ORPCError("BAD_REQUEST", {
          message: "A drill is written down once it is done",
          data: { refusal: "drill_not_done_yet" },
        });
      }
      if (!(input.wentWell || input.note)) {
        throw new ORPCError("BAD_REQUEST", {
          message: "A drill that did not go well says what went wrong",
          data: { refusal: "drill_says_what_went_wrong" },
        });
      }
      const id = uuidv7(now);
      const row = {
        id,
        farmId: context.farm.id,
        doneOn: startOfFarmDay(input.doneOn),
        wentWell: input.wentWell,
        backupUsed: input.backupUsed || null,
        note: input.note || null,
        recordedBy: context.actor.id,
        recordedAt: now,
      };
      await audited(context).write(
        {
          entity: "restore_drill",
          entityId: id,
          action: "create",
          after: { ...row, doneOn: input.doneOn },
        },
        (tx) => tx.insert(restoreDrill).values(row)
      );
      return { id };
    }),
};
