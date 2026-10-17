import { test } from "node:test";
import assert from "node:assert/strict";
import { newGame } from "../shared/game.js";
import {
  initializeRoom,
  clockExpired,
  chargeClock,
} from "../server/rooms/lifecycle.js";

function room() {
  const r = {
    game: newGame(),
    tokens: { w: "a", b: "b" },
    queue: [],
    version: 0,
  };
  initializeRoom(r);
  r.phase = "playing";
  r.clock = { remaining: { w: 5000, b: 5000 }, turnStarted: 1000 };
  return r;
}
test("total and per-turn deadlines use the earlier limit and stop at the boundary", () => {
  for (const turnSeconds of [0, 2, 10]) {
    const r = room();
    r.settings.turnSeconds = turnSeconds;
    const deadline =
      1000 + Math.min(5000, turnSeconds ? turnSeconds * 1000 : Infinity);
    assert.equal(clockExpired(r, deadline - 1), false);
    assert.equal(clockExpired(r, deadline), true);
    assert.equal(r.game.result.winner, "b");
    assert.equal(clockExpired(r, deadline + 1000), false);
    assert.equal(r.version, 1);
  }
});
test("unlimited games do not time out and charging affects only the active player", () => {
  const r = room();
  chargeClock(r, "w", 2500);
  assert.equal(r.clock.remaining.w, 3500);
  assert.equal(r.clock.remaining.b, 5000);
  r.clock.remaining = { w: null, b: null };
  assert.equal(clockExpired(r, 1e12), false);
  r.settings.turnSeconds = 3;
  assert.equal(clockExpired(r, 4000), true);
});

test("undo retains spent time and removes the reverted move's increment", async () => {
  const { applyAction } = await import("../shared/game.js");
  const { handleUndo } = await import("../server/rooms/undo.js");
  const r = room();
  r.game = applyAction(r.game, { kind: "place", type: "p", to: 48 });
  r.settings.incrementSeconds = 2;
  r.clock = {
    remaining: { w: 61000, b: 60000 },
    turnStarted: Date.now() - 1000,
  };
  r.sockets = { w: { readyState: 1 }, b: { readyState: 1 } };
  handleUndo(r, "w", { type: "undo-request", version: r.version });
  handleUndo(r, "b", {
    type: "undo-response",
    id: r.undoRequest.id,
    accept: true,
  });
  assert.equal(r.clock.remaining.w, 59000);
  assert.ok(r.clock.remaining.b <= 59000 && r.clock.remaining.b > 58000);
  assert.equal(r.game.turn, "w");
  assert.equal(r.game.ply, 0);
});

test("persisted running clocks keep their deadlines across repository reloads", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { createRoomRepository } = await import(
    "../server/rooms/repository.js"
  );
  const dir = mkdtempSync(join(tmpdir(), "chessmoku-clock-reload-"));
  try {
    const repository = createRoomRepository(dir);
    const r = room();
    r.code = "ABCDEF";
    r.settings.turnSeconds = 3;
    repository.rooms.set(r.code, r);
    repository.persist();
    const restored = createRoomRepository(dir).rooms.get(r.code);
    assert.equal(restored.clock.turnStarted, 1000);
    assert.equal(restored.phase, "playing");
    assert.equal(restored.hostToken, "a");
    assert.equal(clockExpired(restored, 4000), true);
    assert.equal(restored.game.result.reason, "timeout");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
