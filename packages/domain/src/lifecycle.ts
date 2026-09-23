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
export type LiveState = (typeof LIVE_STATES)[number];

/** Whether an Animal in this State is still on the farm. */
export const isLiveState = (state: AnimalState): state is LiveState =>
  (LIVE_STATES as readonly AnimalState[]).includes(state);

const TRANSITIONS: Record<AnimalState, readonly AnimalState[]> = {
  // No Dairy State leads to Fattening here: crossing Sides is a Move into a Pen on the other Side, and she takes the
  // State it gives her then (`stateAfterSideChange`). A change of State alone would leave her on Fattening in a dairy
  // Pen with no Move to say how she got there.
  calf: ["heifer"],
  heifer: ["pregnant_heifer"],
  pregnant_heifer: ["milking", "heifer"],
  milking: ["dry"],
  dry: ["milking"],
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

/**
 * The States a person may simply set her to, from where she is: every allowed next State but the ones that are the
 * end of a record of their own. Sold is a Sale, with its buyer and its price; died and culled are a Mortality, with
 * the cause and what became of her; Ready for Sale is confirmed against her Withdrawals on its own page. Set as a
 * bare State, each would be a fact with none of what makes it one, and the farm refuses them.
 *
 * Empty for a Fattening animal, whose every next step is one of those — and for one that has left.
 */
export const statesSetByHand = (from: AnimalState): readonly AnimalState[] =>
  allowedNextStates(from).filter(
    (to) => !isExitState(to) && to !== "ready_for_sale"
  );

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

/**
 * How a carcass left the farm. Said here as well as in the schema because the database package
 * depends on nothing; keep the two in step, as milk's destinations are.
 *
 * The burial rule is six feet, and which of these it was is what an inspector asks.
 */
export const DISPOSALS = ["buried", "burned"] as const;
export type Disposal = (typeof DISPOSALS)[number];

/** Why she left the herd: she died, or the farm culled her. */
export const MORTALITY_KINDS = ["died", "culled"] as const;
export type MortalityKind = (typeof MORTALITY_KINDS)[number];

/** The cause a calving writes for a calf born dead: a word the farm's papers put into the reader's language,
 *  rather than whatever words the person at the calving would have used. */
export const STILLBIRTH = "stillbirth";
