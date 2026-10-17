import { newGame } from "./state.js";
import { applyAction } from "./actions.js";

// Replay validates saved moves and reconstructs undo states. Versionless saves
// used an empty board, so their original opening must remain intact.
export function replayLocalGame(saved) {
  const undoStack = [];
  let game = newGame({
    legacy: saved.rulesVersion !== 2,
    rules: saved.rulesVersion === 3 ? saved.rules : undefined,
  });
  for (const move of saved.history) {
    undoStack.push(game);
    const action =
      move.kind === "swap"
        ? { kind: "swap" }
        : move.kind === "place"
          ? { kind: move.kind, type: move.type, to: move.to }
          : { kind: move.kind, from: move.from, to: move.to };
    game = applyAction(game, action);
  }
  if (saved.result?.reason === "resign") game.result = saved.result;
  return { game, undoStack };
}
