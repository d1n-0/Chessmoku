import { TYPES, other, validSquare } from "./constants.js";
import { canMove, legalTargets, actionAllowed, canSwap } from "./movement.js";
import { findFive } from "./victory.js";

function hasAction(g) {
  if (canSwap(g)) return true;
  return (
    TYPES.some(
      (type) =>
        g.reserves[g.turn][type] > 0 && legalTargets(g, { type }).length,
    ) ||
    g.board.some(
      (p, from) => p?.color === g.turn && legalTargets(g, { from }).length,
    )
  );
}
export function applyAction(state, action, actor = state.turn) {
  if (state.result) throw new Error("이미 종료된 대국입니다.");
  if (actor !== state.turn) throw new Error("자신의 차례에만 둘 수 있습니다.");
  if (action?.kind === "swap") {
    if (!canSwap(state)) throw new Error("지금은 흑백을 교환할 수 없습니다.");
    const g = structuredClone(state);
    g.ply++;
    g.history.push({
      ply: g.ply,
      color: actor,
      seat: g.seats[actor],
      kind: "swap",
      type: null,
      from: null,
      to: null,
      captured: null,
    });
    [g.seats.w, g.seats.b] = [g.seats.b, g.seats.w];
    g.last = { kind: "swap", color: actor };
    // The opponent inherits the active color, so leaving the color to move
    // unchanged gives the next action to the other person.
    if (!hasAction(g))
      g.result = { winner: null, reason: "stalemate", line: [] };
    return g;
  }
  if (!action || !validSquare(action.to))
    throw new Error("올바른 칸을 선택하세요.");
  if (state.rules && !actionAllowed(state, action))
    throw new Error("이 행동은 이동 규칙 또는 방의 세부 규칙에 어긋납니다.");
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
    g.board[to] = {
      type,
      color: actor,
      moved: false,
      ...(g.rules ? { dropPly: g.ply + 1 } : {}),
    };
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
    ...(g.seats ? { seat: g.seats[actor] } : {}),
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
