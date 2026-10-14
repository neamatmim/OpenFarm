import { ORPCError } from "@orpc/server";

/**
 * Refusals that are about the whole of what was sent, never one line of it: the Settlement not approved, the Owner's
 * own Advance still out, a Venture that takes no capital now. Said with a line, they would send the Owner to put right
 * a line that is not wrong.
 */
const OF_THE_WHOLE: ReadonlySet<string> = new Set([
  "not_yet_approved",
  "advance_comes_first",
  "venture_wrong_state",
]);

/**
 * A refusal said again with the line of a grid it came from, counted from one, so the Owner is told which line to put
 * right. A refusal of the whole of it, and anything that is not a refusal, goes on as it was.
 */
export const onRow = (error: unknown, row: number): unknown => {
  if (!(error instanceof ORPCError)) {
    return error;
  }
  const data = error.data as { refusal?: unknown } | undefined;
  if (typeof data?.refusal === "string" && OF_THE_WHOLE.has(data.refusal)) {
    return error;
  }
  return new ORPCError(error.code, {
    message: error.message,
    data: { ...data, row },
  });
};

/** The same reference, as one transfer is read: its letters' case and the spaces around it are not another transfer. */
export const asOneReference = (reference: string) =>
  reference.trim().toLowerCase();

/**
 * Refuses a grid that names the same transfer on two lines, before anything is read: one transfer is one payment. The
 * refusal names the second line it is written on.
 */
export const assertEachReferenceOnce = (
  lines: readonly { reference: string }[],
  refusal: string
) => {
  const seen = new Set<string>();
  for (const [index, line] of lines.entries()) {
    const said = asOneReference(line.reference);
    if (seen.has(said)) {
      throw new ORPCError("BAD_REQUEST", {
        message: "The same reference is on two lines",
        data: { refusal, row: index + 1 },
      });
    }
    seen.add(said);
  }
};
