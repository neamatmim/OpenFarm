/** What became of a PIN sent to the farm: no answer — no signal, or a farm that could not answer — the phone taken off
 *  the farm's list, or a refusal the farm gave and the person is told. */
export type PinAnswer = "no_signal" | "revoked" | "refused";

/** Answers that mean "not now" rather than "no": a request that timed out on a weak signal. */
const NOT_NOW = new Set([408]);

/**
 * What the farm made of a PIN Switch that failed. Only a phone the farm never answered falls back to the roster it
 * holds: a wrong PIN, a lockout, a person who may not work here or a phone the Manager revoked was answered, and is
 * said — letting the person in on the cached roster would hand their work to an Outbox the farm will refuse.
 */
export const pinAnswerOf = (error: unknown): PinAnswer => {
  const answered = error as {
    status?: number;
    data?: { refusal?: unknown };
  } | null;
  const status = answered?.status;
  const refused =
    typeof status === "number" &&
    status >= 400 &&
    status < 500 &&
    !NOT_NOW.has(status);
  if (!refused) {
    return "no_signal";
  }
  return answered?.data?.refusal === "phone_revoked" ? "revoked" : "refused";
};
