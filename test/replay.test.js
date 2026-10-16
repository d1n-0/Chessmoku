import { test } from "node:test";
import assert from "node:assert/strict";
import { newGame, applyAction } from "../shared/game.js";
import { replayLocalGame } from "../shared/game/replay.js";

test("saved history reconstructs the same game and independent undo positions", () => {
  const start = newGame();
  const first = applyAction(start, { kind: "place", type: "r", to: 0 });
  const saved = applyAction(first, { kind: "place", type: "p", to: 63 });
  const restored = replayLocalGame(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(restored.game, saved);
  assert.deepEqual(restored.undoStack, [start, first]);
  restored.game.board[0] = null;
  assert.equal(restored.undoStack[1].board[0].type, "r");
});

test("versionless legacy saves keep their original opening and resignation", () => {
  const saved = applyAction(newGame({ legacy: true }), {
    kind: "place",
    type: "q",
    to: 60,
  });
  delete saved.rulesVersion;
  saved.result = { winner: "w", reason: "resign", line: [] };
  const restored = replayLocalGame(saved);
  assert.equal(restored.game.board[60].type, "q");
  assert.equal(restored.game.board[4], null);
  assert.equal(restored.game.reserves.w.k, 1);
  assert.deepEqual(restored.game.result, saved.result);
});

test("invalid saved moves are rejected instead of restoring an unvalidated board", () => {
  assert.throws(
    () =>
      replayLocalGame({
        rulesVersion: 2,
        history: [{ kind: "place", type: "q", to: 60 }],
      }),
    /빈 칸/,
  );
});
