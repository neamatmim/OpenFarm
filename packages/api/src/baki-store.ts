import type { BakiAtTheGate, BakiOutcome } from "@OpenFarm/domain";
import { isBakiRefusal } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

/** The farm day a buyer promised to pay what he still owed by. */
export { farmDay as promisedByInput } from "./farm-clock";

/** What a buyer paid there and then, in taka to the poisha. Nothing is a buyer who took it all on Baki. */
export const paidNowInput = z.number().min(0).max(100_000_000);

/** What a buyer owed as it left, or the refusal the reader is told in their own words. */
export const bakiOrRefuse = (outcome: BakiOutcome): BakiAtTheGate => {
  if (isBakiRefusal(outcome)) {
    throw new ORPCError("BAD_REQUEST", {
      message: `The farm will not write that Baki down: ${outcome.refusal}`,
      data: { refusal: outcome.refusal },
    });
  }
  return outcome;
};
