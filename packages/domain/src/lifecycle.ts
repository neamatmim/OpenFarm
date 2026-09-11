/** Which half of the farm an Animal belongs to. Exactly one at a time. */
export const SIDES = ["dairy", "fattening"] as const;
export type Side = (typeof SIDES)[number];

/** Where an Animal is in its lifecycle. Exactly one at a time. */
export const STATES = [
  // dairy
  "calf",
  "heifer",
  "pregnant_heifer",
  "milking",
  "dry",
  // fattening
  "quarantine",
  "fattening",
  "ready_for_sale",
  // exits
  "sold",
  "died",
  "culled",
] as const;
export type AnimalState = (typeof STATES)[number];

/** An Animal that has left the farm. Its history stays; nothing may change it further. */
export const EXIT_STATES = ["sold", "died", "culled"] as const;
export type ExitState = (typeof EXIT_STATES)[number];

const DAIRY_STATES = [
  "calf",
  "heifer",
  "pregnant_heifer",
  "milking",
  "dry",
] as const;
const FATTENING_STATES = ["quarantine", "fattening", "ready_for_sale"] as const;

export const isExitState = (state: AnimalState): state is ExitState =>
  (EXIT_STATES as readonly string[]).includes(state);

/** The Side a State belongs to; exits belong to neither and keep the Animal's last Side. */
export const sideOfState = (state: AnimalState): Side | null => {
  if ((DAIRY_STATES as readonly string[]).includes(state)) {
    return "dairy";
  }
  if ((FATTENING_STATES as readonly string[]).includes(state)) {
    return "fattening";
  }
  return null;
};

/** Where a *newly arriving* Animal may be registered: dairy-born calves, and bought-in
 *  animals that arrive either in quarantine or — a bought-in pregnant heifer — straight
 *  into the herd. The opening register is different: it records a herd that already
 *  exists, so it accepts any live State (see LIVE_STATES). */
export const ENTRY_STATES = [
  "calf",
  "heifer",
  "pregnant_heifer",
  "quarantine",
] as const;

/** Every State an Animal still on the farm can be in. */
export const LIVE_STATES = [...DAIRY_STATES, ...FATTENING_STATES] as const;

const TRANSITIONS: Record<AnimalState, readonly AnimalState[]> = {
  calf: ["heifer", "fattening"],
  heifer: ["pregnant_heifer", "fattening"],
  pregnant_heifer: ["milking", "heifer", "fattening"],
  milking: ["dry", "fattening"],
  dry: ["milking", "fattening"],
  quarantine: ["fattening"],
  fattening: ["ready_for_sale"],
  ready_for_sale: ["fattening"],
  sold: [],
  died: [],
  culled: [],
};

/** Every non-exit State may end in an exit. */
export const allowedNextStates = (from: AnimalState): readonly AnimalState[] =>
  isExitState(from) ? [] : [...TRANSITIONS[from], ...EXIT_STATES];

export const canTransition = (from: AnimalState, to: AnimalState): boolean =>
  allowedNextStates(from).includes(to);

/** The State an Animal takes when it is moved to the other Side. Moving to Fattening puts a
 *  dairy animal on feed; moving back to Dairy is not a Release 1 flow. */
export const stateAfterSideChange = (
  from: AnimalState,
  toSide: Side
): AnimalState | null => {
  if (isExitState(from) || sideOfState(from) === toSide) {
    return null;
  }
  return toSide === "fattening" ? "fattening" : null;
};
