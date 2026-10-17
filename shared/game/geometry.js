import { validSquare } from "./constants.js";

export function canMove(game, from, to) {
  if (!validSquare(from) || !validSquare(to) || from === to) return false;
  const p = game.board[from],
    target = game.board[to];
  if (!p || target?.color === p.color) return false;
  const x = from % 8,
    y = Math.floor(from / 8),
    dx = (to % 8) - x,
    dy = Math.floor(to / 8) - y;
  const ax = Math.abs(dx),
    ay = Math.abs(dy);
  if (p.type === "n") return ax * ay === 2;
  if (p.type === "k") return Math.max(ax, ay) === 1;
  if (p.type === "p") {
    const dir = p.color === "w" ? -1 : 1;
    if (target) return ax === 1 && dy === dir;
    if (dx !== 0) return false;
    if (dy === dir) return true;
    return (
      !p.moved &&
      y === (p.color === "w" ? 6 : 1) &&
      dy === 2 * dir &&
      !game.board[from + 8 * dir]
    );
  }
  if (
    !(
      (p.type === "r" && (dx === 0 || dy === 0)) ||
      (p.type === "b" && ax === ay) ||
      (p.type === "q" && (dx === 0 || dy === 0 || ax === ay))
    )
  )
    return false;
  const sx = Math.sign(dx),
    sy = Math.sign(dy);
  for (let step = 1; step < Math.max(ax, ay); step++)
    if (game.board[(y + sy * step) * 8 + x + sx * step]) return false;
  return true;
}
