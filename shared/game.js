// Public rules API. Domain modules have no browser, network, or storage dependencies.
export {
  SIZE,
  TYPES,
  NAMES,
  colorName,
  other,
  squareName,
} from "./game/constants.js";
export { newGame } from "./game/state.js";
export { canMove, legalTargets } from "./game/movement.js";
export { findFive } from "./game/victory.js";
export { applyAction } from "./game/actions.js";
