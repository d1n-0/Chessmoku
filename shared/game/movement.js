import { TYPES, other, validSquare } from "./constants.js";
import { canMove as geometricMove } from "./geometry.js";

function previousTurn(game, color) {
  return game.history?.findLast((move) =>
    game.seats ? move.seat === game.seats[color] : move.color === color,
  );
}
export function canSwap(game) {
  return (
    !game.result &&
    !!game.rules?.swapPlies &&
    game.ply < game.rules.swapPlies &&
    !(
      game.rules.kingFirst &&
      !game.rules.presetKings &&
      game.reserves[game.turn].k > 0
    )
  );
}
export function actionAllowed(game, action) {
  const actor = game.turn,
    rules = game.rules;
  if (action.kind === "swap") return canSwap(game);
  if (!validSquare(action.to)) return false;
  if (
    rules?.kingFirst &&
    !rules.presetKings &&
    game.reserves[actor].k > 0 &&
    !(action.kind === "place" && action.type === "k")
  )
    return false;
  if (action.kind === "place") {
    if (
      !TYPES.includes(action.type) ||
      !game.reserves[actor][action.type] ||
      game.board[action.to]
    )
      return false;
  } else if (action.kind === "move") {
    if (
      game.board[action.from]?.color !== actor ||
      !geometricMove(game, action.from, action.to)
    )
      return false;
    const previous = previousTurn(game, actor);
    if (
      previous?.kind === "place" &&
      previous.to === action.from &&
      game.board[action.from].dropPly === previous.ply &&
      (rules?.noImmediateMove ||
        (rules?.noImmediateCapture && game.board[action.to]))
    )
      return false;
  } else return false;
  if (!rules) return true;
  const early = game.ply < rules.noCheckPlies;
  if (!early && !(action.kind === "place" && rules.noDropCheck)) return true;
  if (early && game.board[action.to]?.type === "k") return false;
  const board = game.board.slice();
  if (action.kind === "place")
    board[action.to] = { type: action.type, color: actor, moved: false };
  else {
    board[action.to] = { ...board[action.from], moved: true };
    board[action.from] = null;
  }
  const king = board.findIndex(
    (p) => p?.color === other(actor) && p.type === "k",
  );
  if (king < 0) return true;
  const next = { ...game, board };
  return early
    ? !board.some(
        (p, from) => p?.color === actor && geometricMove(next, from, king),
      )
    : !geometricMove(next, action.to, king);
}
export function canMove(game, from, to) {
  // Public movement queries retain their geometry semantics for non-active colors.
  return game.board[from]?.color === game.turn
    ? actionAllowed(game, { kind: "move", from, to })
    : geometricMove(game, from, to);
}
export function legalTargets(game, selection) {
  if (!selection || game.result) return [];
  return Array.from({ length: 64 }, (_, to) => to).filter((to) =>
    actionAllowed(
      game,
      selection.type
        ? { kind: "place", type: selection.type, to }
        : { kind: "move", from: selection.from, to },
    ),
  );
}
