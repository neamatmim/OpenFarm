import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import { eidAnnouncement, intake } from "@OpenFarm/db/schema/fattening";
import type { EidBasis } from "@OpenFarm/domain";
import {
  eidsListed,
  expectedEidNear,
  farmDayOf,
  qurbaniFrom,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../audit";
import {
  aimedByWindow,
  announcementsOf,
  farmsNextEid,
  formerWindowsOf,
  intakesAimedAt,
} from "../eid-store";
import { farmDay } from "../farm-clock";
import { protectedProcedure } from "../index";
import { requireRole } from "../roles";

export const eidRouter = {
  /**
   * The Eid-ul-Adha the Farm is feeding towards: its three days, and whether they were announced, are expected by the
   * table, or are the calendar's guess past its end. Once announced, how many of the Farm's own animals are still
   * aimed at the day it was expected on — and how many of a Venture's, which move only by an Amendment.
   *
   * The Owner's and the Manager's, who buy towards it: the intake form and the Venture sheet default to it.
   */
  next: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(async ({ context }) => {
      const today = farmDayOf(context.clock.now());
      const window = await farmsNextEid(context.db, context.farm.id, today);
      const nothingBehind = {
        window,
        expectedDay: null,
        behind: 0,
        inVentures: 0,
      };
      if (!window) {
        return nothingBehind;
      }
      // An Eid the Farm has written anything in for — a day announced, or one taken back — may have animals aimed at a
      // day it is no longer on.
      const announced = await announcementsOf(context.db, context.farm.id);
      const expectedDay = [...announced.entries()].find(
        ([, one]) => one.days.at(-1) === window.start
      )?.[0];
      if (!expectedDay) {
        return nothingBehind;
      }
      const aimed = await intakesAimedAt(
        context.db,
        context.farm.id,
        formerWindowsOf(expectedDay, announced.get(expectedDay)?.days ?? [])
      );
      return {
        window,
        expectedDay,
        behind: aimed.own.length,
        inVentures: aimed.inVentures,
      };
    }),

  /**
   * The day the moon sighting committee announced for an Eid, written in by the Owner or the Manager. It stands in for
   * the day expected from then on; the animals already aimed at the expected day stay there until they are brought
   * along, which is its own act, so nobody's window moves without somebody saying so.
   *
   * Refused for a day that is no Eid near any the farm expects — a year typed wrong.
   */
  announce: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ day: farmDay }))
    .handler(async ({ context, input }) => {
      const expectedDay = expectedEidNear(input.day);
      if (!expectedDay) {
        throw new ORPCError("BAD_REQUEST", {
          message: "That day is no Eid-ul-Adha the farm expects",
          data: { refusal: "not_an_eid" },
        });
      }
      const known = await announcementsOf(context.db, context.farm.id);
      const already = known.get(expectedDay);
      if (!already?.withdrawn && already?.days.at(-1) === input.day) {
        return { expectedDay, day: input.day };
      }
      const now = context.clock.now();
      const id = newId(now);
      const row = {
        id,
        farmId: context.farm.id,
        day: input.day,
        expectedDay,
        announcedBy: context.actor.id,
        createdAt: now,
      };
      await audited(context).write(
        {
          entity: "eid_announcement",
          entityId: id,
          action: "create",
          after: { day: input.day, expectedDay },
        },
        (tx) => tx.insert(eidAnnouncement).values(row)
      );
      return { expectedDay, day: input.day };
    }),

  /**
   * The Farm's own animals still aimed at an Eid's expected day — or a day announced before a correction — moved to the
   * announced day, each with its own line in the trail. A Venture's animals stay: their window is the Venture's, moved
   * only by an Amendment its Investors sign. A window somebody typed for another market is left where it is.
   */
  bringAlong: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ expectedDay: farmDay }))
    .handler(async ({ context, input }) => {
      const announced = await announcementsOf(context.db, context.farm.id);
      const days = announced.get(input.expectedDay)?.days ?? [];
      // The day in force: the one announced, or — an announcement taken back — the day expected again.
      const inForce = days.at(-1);
      if (!inForce) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Nobody has announced that Eid yet",
          data: { refusal: "eid_not_announced" },
        });
      }
      const to = qurbaniFrom(inForce);
      const trail = audited(context);
      return await trail.write(
        {
          entity: "eid_announcement",
          entityId: input.expectedDay,
          action: "update",
          after: { day: inForce, expectedDay: input.expectedDay },
        },
        async (tx) => {
          const { own } = await intakesAimedAt(
            tx,
            context.farm.id,
            formerWindowsOf(input.expectedDay, days)
          );
          for (const row of own) {
            // oxlint-disable-next-line no-await-in-loop -- one transaction, one animal after another
            await tx
              .update(intake)
              .set({ targetWindowStart: to.start, targetWindowEnd: to.end })
              .where(eq(intake.id, row.id));
            // oxlint-disable-next-line no-await-in-loop -- each animal's move on her own line
            await trail.recordEvent(tx, {
              entity: "animal",
              entityId: row.animalId,
              action: "update",
              before: {
                targetWindow: {
                  start: row.targetWindowStart,
                  end: row.targetWindowEnd,
                },
              },
              after: { targetWindow: to },
            });
          }
          return { moved: own.length, window: to };
        }
      );
    }),

  /**
   * Every Eid on the Farm's list: the last one it sold into, the table's from here, and the calendar's guesses past it.
   * For each, the day the Farm is on and how it knows it, the day it was expected, how many animals are aimed at it —
   * the Farm's own and a Venture's — and how many are still aimed at a day it is no longer on.
   */
  list: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(async ({ context }) => {
      const today = farmDayOf(context.clock.now());
      const [announced, aimedAt, next] = await Promise.all([
        announcementsOf(context.db, context.farm.id),
        aimedByWindow(context.db, context.farm.id),
        farmsNextEid(context.db, context.farm.id, today),
      ]);
      return eidsListed(today).map(({ expectedDay, basis }) => {
        const written = announced.get(expectedDay);
        const inForce = written?.days.at(-1) ?? expectedDay;
        const isAnnounced = written !== undefined && !written.withdrawn;
        const window = qurbaniFrom(inForce);
        const said: EidBasis = isAnnounced ? "announced" : basis;
        return {
          expectedDay,
          window: { ...window, basis: said },
          /** Whether Qurbani is over for it, and whether it is the one the Farm is feeding towards. */
          past: window.end < today,
          next: next?.start === window.start,
          /** Whether a day was ever written in for it — so it may be taken back, or has been. */
          announced: isAnnounced,
          withdrawn: written?.withdrawn ?? false,
          aimed: aimedAt([window]),
          // Only an Eid the Farm has written a day in for can have animals on a day it is no longer on: one nobody
          // announced is on the day it was always on.
          behind: written
            ? aimedAt(formerWindowsOf(expectedDay, written.days))
            : { own: 0, inVentures: 0 },
        };
      });
    }),

  /**
   * Takes an announced day back: the Eid is on its expected day again, as nobody had announced it — a day written in
   * before the committee spoke, or for the wrong year. A row of its own, so the trail says what the Farm believed and
   * when. The animals brought along to the day taken back stay there until they are brought along again.
   */
  withdraw: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ expectedDay: farmDay }))
    .handler(async ({ context, input }) => {
      const announced = await announcementsOf(context.db, context.farm.id);
      const written = announced.get(input.expectedDay);
      if (!written || written.withdrawn) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Nobody has announced that Eid yet",
          data: { refusal: "eid_not_announced" },
        });
      }
      const now = context.clock.now();
      const id = newId(now);
      await audited(context).write(
        {
          entity: "eid_announcement",
          entityId: id,
          action: "update",
          before: { day: written.days.at(-1), expectedDay: input.expectedDay },
          after: {
            day: input.expectedDay,
            expectedDay: input.expectedDay,
            withdrawn: true,
          },
        },
        (tx) =>
          tx.insert(eidAnnouncement).values({
            id,
            farmId: context.farm.id,
            day: input.expectedDay,
            expectedDay: input.expectedDay,
            announcedBy: context.actor.id,
            withdrawn: true,
            createdAt: now,
          })
      );
      return { expectedDay: input.expectedDay };
    }),
};
