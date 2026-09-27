import { uuidv7 } from "@OpenFarm/db/ids";
import { bankRate } from "@OpenFarm/db/schema/returns";
import { farmDayOf } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../audit";
import { farmDay } from "../farm-clock";
import { protectedProcedure } from "../index";
import {
  returnsPage,
  runningSeasons,
  ventureReturns,
} from "../returns-store";
import { OWNER_ONLY, requireOnly, requirePersonalSession } from "../roles";

/**
 * What the money in the farm's cattle returned: the Owner's Returns page. Each Season of the Farm's own fattening
 * cattle and each Venture, worked as a Settlement is. The Owner's alone, as an animal's money is.
 */
export const returnsRouter = {
  page: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .handler(({ context }) =>
      returnsPage(context.db, context.farm, context.clock.now())
    ),

  /** The Seasons still going, for the strip above the Fattening board: the Owner's alone, as the animal prices are. */
  runningSeasons: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .handler(({ context }) =>
      runningSeasons(context.db, context.farm, context.clock.now())
    ),

  /** One Venture's returns, for the panel on its page: settled or still going; nothing before it has cattle. */
  venture: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .input(z.object({ ventureId: z.string() }))
    .handler(({ context, input }) =>
      ventureReturns(
        context.db,
        context.farm,
        input.ventureId,
        context.clock.now()
      )
    ),

  /**
   * A **Bank Rate** the Owner types: a rate a year, with what it is, from a day — today unless said, never a day still
   * to come. Never an edit: a rate put right is typed again from the same day, and the later one holds. The Owner's
   * alone, each an Audit Event.
   */
  setBankRate: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        perYear: z.number().min(0).max(100),
        note: z.string().trim().min(1).max(200),
        fromDay: farmDay.optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const today = farmDayOf(now);
      const fromDay = input.fromDay ?? today;
      if (fromDay > today) {
        throw new ORPCError("BAD_REQUEST", {
          message: "A bank's rate holds from a day that has come",
          data: { refusal: "bank_rate_from_the_future" },
        });
      }
      const id = uuidv7(now);
      const row = {
        id,
        farmId: context.farm.id,
        perYear: input.perYear.toFixed(2),
        note: input.note,
        fromDay,
        recordedBy: context.actor.id,
        recordedAt: now,
      };
      await audited(context).write(
        {
          entity: "bank_rate",
          entityId: id,
          action: "create",
          after: { perYear: input.perYear, note: input.note, fromDay },
        },
        (tx) => tx.insert(bankRate).values(row)
      );
      return { id, fromDay };
    }),
};
