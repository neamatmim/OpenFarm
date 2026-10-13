import { tagNumberAsWritten } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

/** As many animals as one act may be done for at once: a Pen, a shed at Eid — never the whole herd by a slip. */
export const MANY_AT_ONCE = 200;

/** One of several the farm would not do it for, and why, in the refusal's own word. */
export interface RefusedOne {
  tagNumber: string;
  refusal: string;
  /** Under her meat Withdrawal: the moment she is fit. */
  fitOn?: string | null;
}

/**
 * Why one animal of several was refused, as the farm's word for it — never the server's English, so the page says it in
 * the reader's language. Anything thrown that is not a refusal is not hers to answer for, and goes on up.
 */
export const refusedOne = (tag: string, error: unknown): RefusedOne => {
  if (!(error instanceof ORPCError)) {
    throw error;
  }
  const tagNumber = tagNumberAsWritten(tag);
  const data = (error.data ?? {}) as {
    refusal?: string;
    fitOn?: string | null;
  };
  const refusal =
    data.refusal ??
    (error.code === "NOT_FOUND" ? "no_such_animal" : String(error.code));
  return data.fitOn === undefined
    ? { tagNumber, refusal }
    : { tagNumber, refusal, fitOn: data.fitOn };
};
