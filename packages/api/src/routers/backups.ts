import type { Database } from "@OpenFarm/db";
import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, isNull } from "@OpenFarm/db/operators";
import { DRILL_STANDS, restoreDrill } from "@OpenFarm/db/schema/backup";
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

/**
 * Whoever was the Owner or a Manager on a farm day — whether or not they still are, or still sign in — by name: those a
 * drill done that day may be said to be done by.
 */
const drillDoersOn = async (
  db: Pick<Database, "query">,
  farmId: string,
  day: string
): Promise<{ id: string; name: string }[]> => {
  const from = startOfFarmDay(day);
  const until = new Date(from.getTime() + DAY_MS);
  const held = await db.query.roleAssignment.findMany({
    where: {
      farmId,
      role: { in: ["owner", "manager"] },
      createdAt: { lt: until },
      OR: [{ revokedAt: { isNull: true } }, { revokedAt: { gte: from } }],
    },
    columns: { userId: true },
    with: { user: { columns: { id: true, name: true } } },
    orderBy: { userId: "asc" },
  });
  const people = new Map<string, string>();
  for (const one of held) {
    if (one.user) {
      people.set(one.user.id, one.user.name);
    }
  }
  return [...people]
    .map(([id, name]) => ({ id, name }))
    .toSorted(
      (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
    );
};

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
   * The farm's Restore Drills that stand — none put right by another — latest day first, and when the next is due: a
   * quarter after the latest day one was done, or — never drilled — a quarter after the first good copy. Whoever reads
   * the copies reads these.
   */
  drills: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(async ({ context }) => {
      const now = context.clock.now();
      const [rows, standing] = await Promise.all([
        context.db.query.restoreDrill.findMany({
          where: { farmId: context.farm.id, ...DRILL_STANDS },
          orderBy: { doneOn: "desc", recordedAt: "desc", id: "desc" },
          limit: DRILLS_SHOWN,
          with: {
            doer: { columns: { name: true } },
            recorder: { columns: { name: true } },
          },
        }),
        drillStandingOf(context.db, context.farm.id, now),
      ]);
      const drills = rows.map((row) => ({
        id: row.id,
        doneOn: farmDayOf(row.doneOn),
        wentWell: row.wentWell,
        backupUsed: row.backupUsed,
        note: row.note,
        doneByName: row.doer.name,
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

  /** Who may be said to have done a drill on a day: whoever was the Owner or a Manager then, whether or not they still
   *  are, or still sign in. The form offers these, and the farm takes no other. */
  drillDoers: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ doneOn: farmDay }))
    .handler(({ context, input }) =>
      drillDoersOn(context.db, context.farm.id, input.doneOn)
    ),

  /**
   * Writes a Restore Drill down: the day it was done, whether it went well, which copy was restored, who did it, and a
   * note — which a drill that went badly must have, saying what was missing (the runbook: do not tidy it away). The
   * Owner's or a Manager's to write. Never edited: one written down wrong is put right by another written in its place
   * (`puttingRight`), which it then no longer stands beside.
   */
  recordDrill: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(
      z.object({
        doneOn: farmDay,
        wentWell: z.boolean(),
        backupUsed: z.string().trim().max(200).optional(),
        note: z.string().trim().max(1000).optional(),
        /** Who did it, when it was not the one writing it down: whoever was the Owner or a Manager that day. */
        doneBy: z.string().optional(),
        /** The drill this one puts right, written down wrong. */
        puttingRight: z.string().optional(),
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
      // The one writing it down runs the farm now; another is named only if they ran it on the day.
      const doneBy = input.doneBy ?? context.actor.id;
      if (input.doneBy !== undefined) {
        const doers = await drillDoersOn(
          context.db,
          context.farm.id,
          input.doneOn
        );
        if (!doers.some((one) => one.id === input.doneBy)) {
          throw new ORPCError("BAD_REQUEST", {
            message:
              "A drill is done by whoever was the Owner or a Manager that day",
            data: { refusal: "drill_done_by_who_runs_the_farm" },
          });
        }
      }
      const id = uuidv7(now);
      const row = {
        id,
        farmId: context.farm.id,
        doneOn: startOfFarmDay(input.doneOn),
        wentWell: input.wentWell,
        backupUsed: input.backupUsed || null,
        note: input.note || null,
        doneBy,
        recordedBy: context.actor.id,
        recordedAt: now,
      };
      await audited(context).write(
        {
          entity: "restore_drill",
          entityId: id,
          action: "create",
          after: {
            ...row,
            doneOn: input.doneOn,
            puttingRight: input.puttingRight ?? null,
          },
        },
        async (tx) => {
          await tx.insert(restoreDrill).values(row);
          if (input.puttingRight !== undefined) {
            // Only one still standing: a drill put right once is put right, and the second would stand on nothing.
            const [putRight] = await tx
              .update(restoreDrill)
              .set({ putRightBy: id })
              .where(
                and(
                  eq(restoreDrill.id, input.puttingRight),
                  eq(restoreDrill.farmId, context.farm.id),
                  isNull(restoreDrill.putRightBy)
                )
              )
              .returning({ id: restoreDrill.id });
            if (!putRight) {
              throw new ORPCError("BAD_REQUEST", {
                message:
                  "That drill has already been put right, or is not this farm's",
                data: { refusal: "drill_already_put_right" },
              });
            }
          }
        }
      );
      return { id };
    }),
};
