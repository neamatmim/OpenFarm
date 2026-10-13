import { eq } from "@OpenFarm/db/operators";
import { farm } from "@OpenFarm/db/schema/farm";
import { EXIT_STATES, farmDayOf } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../audit";
import type { Tx } from "../audit";
import { farmDay } from "../farm-clock";
import { goingLiveOf } from "../going-live-store";
import { protectedProcedure } from "../index";
import {
  OWNER_ONLY,
  requireOnly,
  requirePersonalSession,
  requireRole,
} from "../roles";

/** The Owner's two words on going live, as the trail keeps them. */
const readWord = async (tx: Tx, farmId: string) => {
  const row = await tx.query.farm.findFirst({
    where: { id: farmId },
    columns: {
      openingCount: true,
      openingCountRegister: true,
      openingCountedOn: true,
      paperPutAwayOn: true,
    },
  });
  return row ? { ...row } : null;
};

/** A day said for going live that has not come yet: what the Owner says happened, happened. */
const refuseTheFuture = (day: string, now: Date, refusal: string) => {
  if (day > farmDayOf(now)) {
    throw new ORPCError("BAD_REQUEST", {
      message: "That day has not come yet",
      data: { refusal },
    });
  }
};

export const goingLiveRouter = {
  /**
   * Where the farm stands on its way to running on the app: what the go-live checklist asks, as far as the farm's own
   * records can answer it, the steps of setting it up still left, and the Owner's word on the herd counted in and the
   * paper put away. The Owner's and the Manager's, who between them do it.
   */
  get: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(({ context }) =>
      goingLiveOf(context.db, context.farm.id, context.clock.now())
    ),

  /**
   * The Owner's **Opening Count**: how many animals were counted standing on the farm on the day, kept beside how many
   * the register holds as it is written down. Kept whether or not they agree — a count one short is the farm's to go
   * and find — and the opening register counts as put in only when they do.
   */
  countOpening: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({ counted: z.number().int().min(0).max(100_000), day: farmDay })
    )
    .handler(async ({ context, input }) => {
      const farmId = context.farm.id;
      refuseTheFuture(input.day, context.clock.now(), "counted_in_the_future");
      const onRegister = await audited(context).write(
        {
          entity: "farm",
          entityId: farmId,
          action: "update",
          before: (tx) => readWord(tx, farmId),
          after: (tx) => readWord(tx, farmId),
        },
        async (tx) => {
          const animals = await tx.query.animal.findMany({
            where: { farmId, state: { notIn: [...EXIT_STATES] } },
            columns: { id: true },
          });
          await tx
            .update(farm)
            .set({
              openingCount: input.counted,
              openingCountRegister: animals.length,
              openingCountedOn: input.day,
            })
            .where(eq(farm.id, farmId));
          return animals.length;
        }
      );
      return {
        counted: input.counted,
        onRegister,
        agrees: input.counted === onRegister,
      };
    }),

  /**
   * The Owner's word that the paper register was put away on a day: the thirty days without paper are counted from it.
   * Said again — the paper came back, and went away again — the count starts again from the new day.
   */
  putPaperAway: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ day: farmDay }))
    .handler(async ({ context, input }) => {
      const farmId = context.farm.id;
      refuseTheFuture(input.day, context.clock.now(), "put_away_in_the_future");
      await audited(context).write(
        {
          entity: "farm",
          entityId: farmId,
          action: "update",
          before: (tx) => readWord(tx, farmId),
          after: (tx) => readWord(tx, farmId),
        },
        (tx) =>
          tx
            .update(farm)
            .set({ paperPutAwayOn: input.day })
            .where(eq(farm.id, farmId))
      );
      return { on: input.day };
    }),
};
