import { tagNumberAsWritten } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

/** One of several the farm did not do it for, and why, in the refusal's own word. */
export interface RefusedOne {
  tagNumber: string;
  refusal: string;
  /** Under her meat Withdrawal: the moment she is fit. */
  fitOn?: string | null;
}

/** The farm's word for one of several that went wrong in a way with no word of its own: said, never the server's code. */
const NOT_DONE = "could_not_be_done";

/**
 * Why one animal of several was not done, as the farm's word for it — never the server's English, so the screen says it
 * in the reader's language. Whatever went wrong with her is hers alone: the answer still names everybody done and not,
 * so the Manager knows what is left rather than a whole batch going silent over one animal.
 */
export const refusedOne = (tag: string, error: unknown): RefusedOne => {
  const tagNumber = tagNumberAsWritten(tag);
  if (!(error instanceof ORPCError)) {
    return { tagNumber, refusal: NOT_DONE };
  }
  const data = (error.data ?? {}) as {
    refusal?: string;
    fitOn?: string | null;
  };
  const refusal =
    data.refusal ?? (error.code === "NOT_FOUND" ? "no_such_animal" : NOT_DONE);
  return data.fitOn === undefined
    ? { tagNumber, refusal }
    : { tagNumber, refusal, fitOn: data.fitOn };
};

/** The tags asked for, each once, as the farm writes them: "F-12" and "f-0012" are one animal, done once. */
export const eachOnce = <T>(
  asked: readonly T[],
  tagOf: (one: T) => string
): T[] => {
  const seen = new Set<string>();
  return asked.filter((one) => {
    const tag = tagNumberAsWritten(tagOf(one));
    if (seen.has(tag)) {
      return false;
    }
    seen.add(tag);
    return true;
  });
};
