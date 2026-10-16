import { test } from "node:test";
import assert from "node:assert/strict";
import { newGame, applyAction } from "../shared/game.js";
import {
  VARIANTS,
  setup,
  actions,
  immediate,
  step,
  positionKey,
  lineWin,
} from "../scripts/balance.mjs";
const p = (type, color = "w") => ({ type, color, moved: false });
test("balance laboratory detects capture completing five and does not break its own line", () => {
  const g = newGame();
  for (const i of [24, 25, 26, 27]) g.board[i] = p("p");
  g.board[28] = p("n", "b");
  g.board[36] = p("r");
  const a = immediate(g, VARIANTS.kings5);
  assert.deepEqual(a, { kind: "move", from: 36, to: 28 });
  assert.equal(applyAction(g, a).result.reason, "five");
  g.board[36] = null;
  g.board[27] = p("r");
  assert.equal(immediate(g, VARIANTS.kings5), null);
});
test("all variant openings conserve armies and enforce the declared opening", () => {
  for (const variant of Object.keys(VARIANTS)) {
    const g = setup(variant);
    for (const color of ["w", "b"])
      assert.equal(
        g.board.filter((p) => p?.color === color).length +
          Object.values(g.reserves[color]).reduce((a, b) => a + b),
        16,
      );
  }
  const g = setup("whitePawnHome5");
  assert(
    actions(g, VARIANTS.whitePawnHome5).every(
      (a) => a.kind === "place" && a.type === "p" && a.to >= 32,
    ),
  );
  const n = step(
    g,
    actions(g, VARIANTS.whitePawnHome5)[0],
    VARIANTS.whitePawnHome5,
  );
  assert(
    actions(n, VARIANTS.whitePawnHome5).some(
      (a) => a.kind === "place" && a.type === "q" && a.to >= 32,
    ),
  );
  assert.equal(setup("fixedWhite5").turn, "b");
  assert.equal(setup("fixedWhite5").ply, 1);
});
test("fast transitions agree with production engine over seeded random games", () => {
  let seed = 53;
  const random = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
  for (const variant of Object.keys(VARIANTS)) {
    const v = VARIANTS[variant];
    let g = setup(variant);
    for (let i = 0; i < 60; i++) {
      const list = actions(g, v);
      if (!list.length) break;
      const a = list[Math.floor(random() * list.length)];
      const actual = applyAction({ ...g, history: [] }, a);
      const fast = step(g, a, v);
      assert.deepEqual(fast.board, actual.board);
      assert.deepEqual(fast.reserves, actual.reserves);
      assert.equal(fast.turn, actual.turn);
      if (v.k === 5) assert.equal(!!fast.result, !!actual.result);
      g = fast;
      if (g.result) break;
    }
  }
});
test("immediate wins match exhaustive enumeration including occupied targets", () => {
  let seed = 89;
  const random = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
  for (const variant of ["kings5", "kings4", "whitePawnHome5", "homeDrops5"]) {
    const v = VARIANTS[variant];
    for (let trial = 0; trial < 10; trial++) {
      let g = setup(variant);
      for (let turn = 0; turn < 20; turn++) {
        const list = actions(g, v);
        const brute = list.find((a) => step(g, a, v).result);
        assert.equal(!!immediate(g, v), !!brute);
        if (brute) break;
        g = step(g, list[Math.floor(random() * list.length)], v);
      }
    }
  }
});
test("repetition keys include reserves, turn and pawn history but ignore irrelevant rook history", () => {
  const g = setup("kings5"),
    n = structuredClone(g);
  n.reserves.w.p--;
  assert.notEqual(positionKey(g), positionKey(n));
  n.reserves.w.p++;
  n.turn = "b";
  assert.notEqual(positionKey(g), positionKey(n));
  n.turn = "w";
  g.board[52] = p("p");
  n.board[52] = p("p");
  n.board[52].moved = true;
  assert.notEqual(positionKey(g), positionKey(n));
  g.board[52] = p("r");
  n.board[52] = p("r");
  n.board[52].moved = true;
  assert.equal(positionKey(g), positionKey(n));
});

test("search is invariant under color swap and rank reflection with equal random streams", async () => {
  const { choose, random, PROFILES } = await import("../scripts/balance.mjs");
  const reflect = (g) => ({
    ...g,
    turn: g.turn === "w" ? "b" : "w",
    board: Array.from({ length: 64 }, (_, i) => {
      const p = g.board[i ^ 56];
      return p ? { ...p, color: p.color === "w" ? "b" : "w" } : null;
    }),
    reserves: { w: { ...g.reserves.b }, b: { ...g.reserves.w } },
  });
  let g = setup("kings5");
  for (let turn = 0; turn < 12; turn++) {
    const reflected = reflect(g);
    for (const depth of [1, 2, 3]) {
      const a = choose(
        g,
        VARIANTS.kings5,
        PROFILES.balanced,
        random(98765),
        depth,
        new Map(),
        4,
      );
      const b = choose(
        reflected,
        VARIANTS.kings5,
        PROFILES.balanced,
        random(98765),
        depth,
        new Map(),
        4,
      );
      // Immediate wins can have multiple equivalent choices; compare their outcome.
      if (immediate(g, VARIANTS.kings5)) {
        assert(step(g, a, VARIANTS.kings5).result);
        assert(step(reflected, b, VARIANTS.kings5).result);
      } else
        assert.deepEqual(b, {
          ...a,
          to: a.to ^ 56,
          ...(a.from === undefined ? {} : { from: a.from ^ 56 }),
        });
    }
    const a = choose(
      g,
      VARIANTS.kings5,
      PROFILES.balanced,
      random(turn * 1234 + 7),
      1,
      new Map(),
      4,
    );
    g = step(g, a, VARIANTS.kings5);
    if (g.result) break;
  }
});
