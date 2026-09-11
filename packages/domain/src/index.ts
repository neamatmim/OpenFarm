export type { AnimalState, ExitState, Side } from "./lifecycle";
export {
  ENTRY_STATES,
  EXIT_STATES,
  LIVE_STATES,
  SIDES,
  STATES,
  allowedNextStates,
  canTransition,
  isExitState,
  sideOfState,
  stateAfterSideChange,
} from "./lifecycle";
export type { TagPrefix } from "./tag-number";
export {
  TAG_PREFIXES,
  formatTagNumber,
  isTagNumber,
  parseTagNumber,
  prefixForOrigin,
} from "./tag-number";
