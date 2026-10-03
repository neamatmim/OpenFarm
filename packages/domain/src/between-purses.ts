import type { AnimalState } from "./lifecycle";
import { isExitState } from "./lifecycle";

/** Why an animal cannot be moved between purses by an Internal Sale, as the farm refuses it. */
export type BetweenPursesRefusal =
  | "not_a_fattening_animal"
  | "not_a_ventures_animal"
  | "she_is_gone"
  | "she_is_ready_for_sale"
  | "never_weighed";

/**
 * Why an Internal Sale would not take her, or nothing: a Venture owns bought-in Fattening animals still being fattened,
 * and a price is struck on her weight, so one never weighed has none. The farm refuses on it, in this order; the screen
 * offers the move only where it says nothing. Whether she is weighed is asked only where it is known.
 */
export const whyNotBetweenPurses = (
  her: { side: string; source: string; state: AnimalState },
  { weighed }: { weighed?: boolean } = {}
): BetweenPursesRefusal | null => {
  if (her.side !== "fattening") {
    return "not_a_fattening_animal";
  }
  if (her.source !== "bought") {
    return "not_a_ventures_animal";
  }
  if (isExitState(her.state)) {
    return "she_is_gone";
  }
  if (her.state === "ready_for_sale") {
    return "she_is_ready_for_sale";
  }
  return weighed === false ? "never_weighed" : null;
};
