import { ORPCError } from "@orpc/server";

/**
 * A refusal said again with the line of a grid it came from, counted from one, so the Owner is told which line to put
 * right. Anything that is not a refusal goes on as it was.
 */
export const onRow = (error: unknown, row: number): unknown =>
  error instanceof ORPCError
    ? new ORPCError(error.code, {
        message: error.message,
        data: { ...(error.data as object | undefined), row },
      })
    : error;

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
