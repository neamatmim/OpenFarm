import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { farmDay } from "./farm-clock";

/**
 * The Lot a box of medicine or a bag of feed came in, as the purchase that brought it writes it down: the Lot
 * Number printed on it, and the last day it says it may be used. Both may be left out — hay has neither, and
 * the box of a product bought before the farm asked had neither written down.
 */
export const lotFields = {
  lotNumber: z.string().trim().min(1).max(60).optional(),
  expiresOn: farmDay.optional(),
};

/**
 * Refuses a Lot that had already expired on the day it came in. Buying stock past its day is a mistake worth
 * stopping at the door: once it is in the store it is counted, costed and given like the rest.
 */
export const assertNotExpiredWhenBought = (
  expiresOn: string | undefined,
  cameInOn: string
) => {
  // Named, and this way round, because both are the farm's own days written as YYYY-MM-DD, which sort as text.
  const expiredBeforeItCame = expiresOn !== undefined && expiresOn < cameInOn;
  if (expiredBeforeItCame) {
    throw new ORPCError("BAD_REQUEST", {
      message: "That lot had expired before it came in",
      data: { refusal: "expired_when_bought" },
    });
  }
};
