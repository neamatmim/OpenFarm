import type { Mutation, QueryClient } from "@tanstack/react-query";

/**
 * The saves the app makes of its own accord whenever somebody opens it — raising the day's work, sweeping for work
 * gone late, carrying the evening's post — one after another. Refreshing after each would read the screen three
 * times over; whoever runs them refreshes once, when the last has gone.
 */
const OPENING_THE_APP: ReadonlySet<string> = new Set([
  "instances.ensureDue",
  "alerts.sweep",
  "alerts.digest",
]);

/**
 * Saves that change nothing anybody is reading: an Investor having looked at the Ventures offered to them. Refreshing
 * would take the "New" off the page they opened to read it on; it goes the next time they open it.
 */
const ONLY_LOOKED: ReadonlySet<string> = new Set(["portal.sawOffers"]);

/** A save's procedure, as oRPC keys it: `[["drugs", "purchase"], { type: "mutation" }]` is `drugs.purchase`. */
const procedureOf = (mutation: Pick<Mutation, "options">): string | null => {
  const path = mutation.options.mutationKey?.[0];
  return Array.isArray(path) ? path.join(".") : null;
};

/**
 * Does a save that went through refresh the screen? Every one the farm took does, but those the app makes on
 * opening and an Investor having only looked at what they are offered. One that only put an entry in the phone's Outbox does not: the farm has not been told yet, the screen
 * already shows what was written, and reading the farm now would take it back.
 */
export const refreshesTheScreen = (
  mutation: Pick<Mutation, "options">
): boolean => {
  const procedure = procedureOf(mutation);
  return (
    procedure !== null &&
    !OPENING_THE_APP.has(procedure) &&
    !ONLY_LOOKED.has(procedure)
  );
};

/**
 * After anything the farm has taken: everything read is out of date. What is on the screen is read again now, and
 * the rest the next time it is opened, rather than when its minute of freshness runs out.
 *
 * Everything rather than a list of what each save touches, because which reads a save moves is the server's
 * business and a screen that guessed has guessed wrong: buying medicine books money too, and the money list opened
 * straight after did not have it. Not waited for — the sheet closes when the farm says yes, and the page behind it
 * catches up a moment later.
 */
export const refreshTheScreen = (queryClient: QueryClient): void => {
  void queryClient.invalidateQueries();
};

/** The query client's own hook: every save that goes through refreshes the screen, once, whichever sheet made it. */
export const refreshAfterASave = (
  _data: unknown,
  _variables: unknown,
  _onMutateResult: unknown,
  mutation: Mutation<unknown, unknown, unknown>,
  context: { client: QueryClient }
): void => {
  if (refreshesTheScreen(mutation)) {
    refreshTheScreen(context.client);
  }
};
