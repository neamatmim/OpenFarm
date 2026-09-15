import { ORPCError } from "@orpc/server";

/**
 * An entry that was true when it was written and is not true now: the animal has been sold,
 * the work has been signed off, the cow has already been recorded. A phone out of signal
 * writes these honestly, so they are kept and put in front of a person rather than refused
 * (ADR 0002). Marked so a batch can tell them from an entry that was never valid at all —
 * a Step no Version has, an animal the farm has never heard of — which is the client's to
 * keep and fix.
 */
export const lateEntry = (message: string, data: object = {}) =>
  new ORPCError("CONFLICT", { message, data: { ...data, late: true } });

/** Was this refused because the world moved, rather than because the entry was wrong? */
export const isLate = (error: unknown): boolean =>
  error instanceof ORPCError &&
  (error.data as { late?: boolean } | undefined)?.late === true;
