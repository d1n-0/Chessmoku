import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newGame,
  applyAction,
  legalTargets,
  canSwap,
  validateRules,
} from "../shared/game.js";
import { replayLocalGame } from "../shared/game/replay.js";
const place = (g, type, to) => applyAction(g, { kind: "place", type, to });
const move = (g, from, to) => applyAction(g, { kind: "move", from, to });

test("custom king positions, empty opening, validation and king-first placement", () => {
  const preset = newGame({ rules: { whiteKing: 63, blackKing: 0 } });
  assert.equal(preset.board[63].color, "w");
  assert.equal(preset.board[0].color, "b");
  assert.equal(preset.reserves.w.k, 0);
  assert.throws(() => validateRules({ whiteKing: 0, blackKing: 0 }));
  assert.throws(() => validateRules({ swapPlies: -1 }));
  assert.throws(() => validateRules({ presetKings: "false" }));
  let g = newGame({
    rules: { presetKings: false, kingFirst: true, swapPlies: 10 },
  });
  assert.equal(g.board.filter(Boolean).length, 0);
  assert.deepEqual(legalTargets(g, { type: "p" }), []);
  assert.equal(canSwap(g), false);
  assert.throws(() => place(g, "p", 48));
  g = place(g, "k", 60);
  assert.throws(() => place(g, "r", 0));
  g = place(g, "k", 4);
  assert.equal(canSwap(g), true);
  assert.ok(legalTargets(g, { type: "p" }).length);
  assert.equal(newGame({ rules: { presetKings: false } }).reserves.b.k, 1);
});

test("drop-check ban uses geometric attacks and blocking, but allows checks by movement", () => {
  let g = newGame({ rules: { noDropCheck: true } });
  for (const [type, to] of [
    ["r", 0],
    ["b", 11],
    ["n", 10],
    ["p", 11],
  ]) {
    assert.throws(() => place(g, type, to));
    assert.equal(legalTargets(g, { type }).includes(to), false);
  }
  g = place(g, "r", 8);
  g = place(g, "p", 16);
  g = move(g, 8, 0);
  assert.equal(g.board[0].type, "r");
  const blocked = newGame({ rules: { noDropCheck: true } });
  blocked.board[2] = { type: "p", color: "b", moved: false };
  assert.doesNotThrow(() => place(blocked, "r", 0));
});

test("opening check ban covers discovered attacks and king capture, ending at N plies", () => {
  const g = newGame({ rules: { noCheckPlies: 3 } });
  assert.throws(() => place(g, "r", 0));
  g.board[0] = { type: "r", color: "w", moved: false };
  g.board[2] = { type: "b", color: "w", moved: false };
  assert.throws(() => move(g, 2, 9));
  g.board[2] = null;
  assert.throws(() => move(g, 0, 4));
  g.ply = 3;
  assert.equal(move(g, 0, 4).result.reason, "king");
});

test("recent drop restrictions last for that player's next turn and distinguish capture from movement", () => {
  for (const noImmediateMove of [false, true]) {
    let g = newGame({ rules: { noImmediateCapture: true, noImmediateMove } });
    g = place(g, "r", 0);
    g = place(g, "p", 8);
    assert.throws(() => move(g, 0, 8));
    if (noImmediateMove) assert.throws(() => move(g, 0, 1));
    else assert.doesNotThrow(() => move(g, 0, 1));
    g = place(g, "p", 48);
    g = place(g, "p", 16);
    assert.doesNotThrow(() => move(g, 0, 8));
  }
});

test("swap consumes one action, hands the next action to the other person and replays", () => {
  let g = newGame({ rules: { swapPlies: 3, whiteKing: 63, blackKing: 7 } });
  g = place(g, "p", 48);
  assert.equal(g.seats[g.turn], 2);
  g = applyAction(g, { kind: "swap" });
  assert.equal(g.ply, 2);
  assert.equal(g.turn, "b");
  assert.equal(g.seats[g.turn], 1);
  assert.equal(g.board[48].color, "w");
  g = place(g, "p", 16);
  assert.equal(canSwap(g), false);
  assert.throws(() => applyAction(g, { kind: "swap" }));
  const replay = replayLocalGame(g);
  assert.deepEqual(replay.game, g);
  assert.equal(replay.undoStack[1].seats.b, 2);
  assert.equal(replay.undoStack[1].turn, "b");
});

test("all offered targets pass the same rule validation as authoritative actions", () => {
  let g = newGame({
    rules: {
      presetKings: false,
      kingFirst: true,
      noDropCheck: true,
      noCheckPlies: 6,
      noImmediateMove: true,
      swapPlies: 8,
    },
  });
  for (let i = 0; i < 8 && !g.result; i++) {
    const choices = [];
    for (const type of ["k", "p", "r", "b", "n", "q"])
      for (const to of legalTargets(g, { type }))
        choices.push({ kind: "place", type, to });
    for (const [from, piece] of g.board.entries())
      if (piece?.color === g.turn)
        for (const to of legalTargets(g, { from }))
          choices.push({ kind: "move", from, to });
    for (const action of choices)
      assert.doesNotThrow(() => applyAction(g, action));
    g = applyAction(g, choices[i % choices.length]);
  }
});
