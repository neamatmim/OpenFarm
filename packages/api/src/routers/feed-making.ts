import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { z } from "zod";

import { correct } from "../corrections/correction";
import {
  feedMakingCorrection,
  feedMakingCorrectionInput,
} from "../corrections/feed-making";
import { farmDay } from "../farm-clock";
import {
  makeFeed,
  makingInputs,
  makingsOf,
  takeOutOfThePit,
} from "../feed-making-store";
import { protectedProcedure } from "../index";
import { requireRole } from "../roles";
import { quantityInput } from "../stock-store";

/**
 * Feed made on the farm (CONTEXT.md **Feed Making**, ADR 0030): a home-mixed concentrate, or silage. The store's, so
 * the Manager's to record and the Owner's, who may do anything the Manager does; it carries prices, so never the barn
 * staff's or the Vet's.
 */
export const feedMakingRouter = {
  /** Every making, newest first, with what went in, what came out and what a unit of it came to. */
  list: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(({ context }) =>
      makingsOf(context.db, context.farm, context.clock.now())
    ),

  /**
   * Makes feed: so much of each input out of the store, and — for a mix made the same day — so much of the made feed in,
   * worth what went in. Silage is packed without what came out, which is said when the pit is opened (`cameOut`).
   * Carries the id the screen made for it, so a second tap is the same making.
   */
  make: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(
      z.object({
        id: z.string().uuid().optional(),
        outputFeedItemId: z.string(),
        madeOn: farmDay,
        inputs: makingInputs,
        cameOut: z.object({ quantity: quantityInput }).optional(),
        /** For silage: when it should be ready to open. */
        readyOn: farmDay.optional(),
        note: z.string().trim().max(200).optional(),
      })
    )
    .handler(({ context, input }) =>
      makeFeed(context, {
        ...input,
        id: input.id ?? newId(context.clock.now()),
      })
    ),

  /** Silage opened: what came out of the pit, and the day, into the store. */
  cameOut: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(
      z.object({ id: z.string(), quantity: quantityInput, cameOutOn: farmDay })
    )
    .handler(({ context, input }) => takeOutOfThePit(context, input)),

  /**
   * Puts a making right — what went in, the day, what came out — or voids one never made: a Correction with a reason,
   * in the Role's Correction Window, the trail keeping what it said before.
   */
  correct: protectedProcedure
    .use(requireRole(...feedMakingCorrection.roles))
    .input(feedMakingCorrectionInput)
    .handler(({ context, input }) =>
      correct(context, feedMakingCorrection, input)
    ),
};
