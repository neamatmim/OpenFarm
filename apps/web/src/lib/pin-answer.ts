/** What became of a PIN sent to the farm: no answer — no signal, or a farm that could not answer — the phone taken off
 *  the farm's list, or a refusal the farm gave and the person is told. */
export type PinAnswer = "no_signal" | "revoked" | "refused";

/** The farm's codes that mean "not now" rather than "no": a server that fell over, was restarting or timed out on a
 *  weak signal. An oRPC error on the client carries its code and no HTTP status. */
const NOT_NOW = new Set([
  "TIMEOUT",
  "INTERNAL_SERVER_ERROR",
  "NOT_IMPLEMENTED",
  "BAD_GATEWAY",
  "SERVICE_UNAVAILABLE",
  "GATEWAY_TIMEOUT",
]);

/**
 * What the farm made of a PIN Switch that failed — or of a Move or a sighting sent while the phone thought it had
 * signal. Only a phone the farm never answered falls back to what it holds: a wrong PIN, a lockout, a person who may not
 * work here or a phone the Manager revoked was answered, and is said — letting the person in on the cached roster would
 * hand their work to an Outbox the farm will refuse.
 */
export const pinAnswerOf = (error: unknown): PinAnswer => {
  const answered = error as {
    code?: unknown;
    data?: { refusal?: unknown };
  } | null;
  const code = answered?.code;
  if (typeof code !== "string" || NOT_NOW.has(code)) {
    return "no_signal";
  }
  return answered?.data?.refusal === "phone_revoked" ? "revoked" : "refused";
};
