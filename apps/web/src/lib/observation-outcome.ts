import type { Outcome, OutcomeState } from "@OpenFarm/api/observation-outcome";

/** An Observation as the list holds it: what became of it, or nothing — and nothing at all from a list a phone kept
 *  from before Observations said. */
interface WithOutcome {
  outcome?: Pick<Outcome, "state"> | null;
}

/** What became of an Observation, or nothing when it raised no work and no Vet answered it — or it was kept from before
 *  it could say. */
export const outcomeOf = <T extends WithOutcome>(
  row: T
): NonNullable<T["outcome"]> | null => row.outcome ?? null;

/** Whether the work an Observation raised is still owed: the Manager's "which are still open?". */
export const stillToSeeTo = (row: WithOutcome): boolean =>
  outcomeOf(row)?.state === "open";

/** How each outcome is drawn: owed in the warning color, done quietly, the Vet's answer as news, the rest as said. */
export const OUTCOME_TONE: Record<
  OutcomeState,
  "warning" | "success" | "danger" | "neutral" | "info"
> = {
  open: "warning",
  done: "success",
  missed: "danger",
  called_off: "neutral",
  diagnosed: "info",
};
