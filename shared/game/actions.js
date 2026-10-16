import { TYPES, other, validSquare } from "./constants.js";
import { canMove } from "./movement.js";
import { findFive } from "./victory.js";

function hasAction(g) {
  if (g.board.some((p) => !p) && TYPES.some((t) => g.reserves[g.turn][t] > 0))
    return true;
  return g.board.some(
    (p, i) => p?.color === g.turn && g.board.some((_, j) => canMove(g, i, j)),
  );
}
export function applyAction(state, action, actor = state.turn) {
  if (state.result) throw new Error("이미 종료된 대국입니다.");
  if (actor !== state.turn) throw new Error("자신의 차례에만 둘 수 있습니다.");
  if (!action || !validSquare(action.to))
    throw new Error("올바른 칸을 선택하세요.");
  const g = structuredClone(state),
    to = action.to;
  let type,
    captured = null;
  if (action.kind === "place") {
    type = action.type;
    if (!TYPES.includes(type) || g.reserves[actor][type] < 1)
      throw new Error("배치할 기물이 없습니다.");
    if (g.board[to]) throw new Error("빈 칸에만 배치할 수 있습니다.");
    g.reserves[actor][type]--;
    g.board[to] = { type, color: actor, moved: false };
  } else if (action.kind === "move") {
    if (
      !validSquare(action.from) ||
      g.board[action.from]?.color !== actor ||
      !canMove(g, action.from, to)
    )
      throw new Error("이동할 수 없는 칸입니다.");
    type = g.board[action.from].type;
    captured = g.board[to];
    if (captured) g.reserves[actor][captured.type]++;
    g.board[to] = { ...g.board[action.from], moved: true };
    g.board[action.from] = null;
  } else throw new Error("알 수 없는 행동입니다.");
  g.ply++;
  g.last = { ...action, color: actor };
  g.history.push({
    ply: g.ply,
    color: actor,
    type,
    kind: action.kind,
    from: action.kind === "move" ? action.from : null,
    to,
    captured: captured?.type ?? null,
  });
  const line = findFive(g.board, actor);
  if (captured?.type === "k")
    g.result = { winner: actor, reason: "king", line: [] };
  else if (line) g.result = { winner: actor, reason: "five", line };
  g.turn = other(actor);
  if (!g.result && !hasAction(g))
    g.result = { winner: null, reason: "stalemate", line: [] };
  return g;
}
