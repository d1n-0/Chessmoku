export function newGame({ legacy = false } = {}) {
  const board = Array(64).fill(null);
  if (!legacy) {
    board[60] = { type: "k", color: "w", moved: false };
    board[4] = { type: "k", color: "b", moved: false };
  }
  return {
    rulesVersion: legacy ? 1 : 2,
    board,
    reserves: {
      w: { p: 8, r: 2, b: 2, n: 2, k: legacy ? 1 : 0, q: 1 },
      b: { p: 8, r: 2, b: 2, n: 2, k: legacy ? 1 : 0, q: 1 },
    },
    turn: "w",
    ply: 0,
    history: [],
    result: null,
    last: null,
  };
}
