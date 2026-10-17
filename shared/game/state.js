import { validateRules } from "./options.js";
export function newGame({ legacy = false, rules } = {}) {
  const options = rules === undefined ? null : validateRules(rules);
  const preset = options ? options.presetKings : !legacy;
  const board = Array(64).fill(null);
  if (preset) {
    board[options?.whiteKing ?? 60] = { type: "k", color: "w", moved: false };
    board[options?.blackKing ?? 4] = { type: "k", color: "b", moved: false };
  }
  return {
    rulesVersion: options ? 3 : legacy ? 1 : 2,
    ...(options ? { rules: options, seats: { w: 1, b: 2 } } : {}),
    board,
    reserves: {
      w: { p: 8, r: 2, b: 2, n: 2, k: preset ? 0 : 1, q: 1 },
      b: { p: 8, r: 2, b: 2, n: 2, k: preset ? 0 : 1, q: 1 },
    },
    turn: "w",
    ply: 0,
    history: [],
    result: null,
    last: null,
  };
}
