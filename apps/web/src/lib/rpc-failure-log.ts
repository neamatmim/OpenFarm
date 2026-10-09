import { aFailureWasSeen } from "@OpenFarm/api/failures-seen";
import { asLogged } from "@OpenFarm/api/thrown";
import { ORPCError, ValidationError } from "@orpc/server";

/** What caused a failure, as much of it as may be written down: which fields failed, or the error that was thrown. */
const causeOf = (cause: unknown): Record<string, unknown> => {
  if (cause instanceof ValidationError) {
    return {
      failedFields: cause.issues.map((issue) => ({
        path: (issue.path ?? [])
          .map((step) =>
            typeof step === "object" && step !== null && "key" in step
              ? String(step.key)
              : String(step)
          )
          .join("."),
        message: issue.message,
      })),
    };
  }
  if (cause instanceof Error) {
    return { cause: asLogged(cause) };
  }
  return {};
};

/**
 * What a call that failed puts in the server's log: what went wrong, never what was sent.
 *
 * oRPC hands a failure to the log whole, and a failure carries what caused it — a validation failure carries the
 * very input that failed, which on `portal.join` or a staff password code is somebody's password in plain text, and
 * on an answer that failed its own check is somebody's NID or bank account. So the log keeps the error's code, its
 * message and its refusal; for a validation failure only which fields failed and why; and for the
 * unexpected error behind a 500 its name, message and stack, which is what anybody reading the log needs — less the
 * values a failed query was sent, which drizzle writes into both, and which on an Investor's or a nominee's row are their
 * NID, bank account and phone.
 */
export const logLineOf = (failure: unknown): Record<string, unknown> => {
  if (!(failure instanceof ORPCError)) {
    return asLogged(failure);
  }
  const refusal = (failure.data as { refusal?: unknown } | undefined)?.refusal;
  return {
    code: failure.code,
    message: failure.message,
    ...(typeof refusal === "string" ? { refusal } : {}),
    ...causeOf(failure.cause),
  };
};

/** Whether a failure is the server's own — something thrown that nothing expected, answered as a 500 — rather than
 *  the farm refusing what it was sent, which is the farm working. */
export const isTheServersOwn = (failure: unknown): boolean =>
  !(failure instanceof ORPCError) || failure.code === "INTERNAL_SERVER_ERROR";

/** The one way the farm's API handlers write a failure to the log. The server's own are also counted, for its timer
 *  to tell the Owner when there are too many in an hour. */
export const logTheFailure = (failure: unknown): void => {
  console.error("rpc failure", logLineOf(failure));
  if (isTheServersOwn(failure)) {
    aFailureWasSeen();
  }
};
