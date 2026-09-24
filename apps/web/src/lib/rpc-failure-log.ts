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
    return {
      cause: { name: cause.name, message: cause.message, stack: cause.stack },
    };
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
 * unexpected error behind a 500 its name, message and stack, which is what anybody reading the log needs.
 */
export const logLineOf = (failure: unknown): Record<string, unknown> => {
  if (!(failure instanceof ORPCError)) {
    return failure instanceof Error
      ? { name: failure.name, message: failure.message, stack: failure.stack }
      : { failure: typeof failure };
  }
  const refusal = (failure.data as { refusal?: unknown } | undefined)?.refusal;
  return {
    code: failure.code,
    message: failure.message,
    ...(typeof refusal === "string" ? { refusal } : {}),
    ...causeOf(failure.cause),
  };
};

/** The one way the farm's API handlers write a failure to the log. */
export const logTheFailure = (failure: unknown): void => {
  console.error("rpc failure", logLineOf(failure));
};
