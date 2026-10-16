export function findFive(board, color) {
  for (let i = 0; i < 64; i++) {
    if (board[i]?.color !== color) continue;
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
      [1, 1],
      [1, -1],
    ]) {
      const line = [];
      for (let n = 0; n < 5; n++) {
        const x = (i % 8) + dx * n,
          y = Math.floor(i / 8) + dy * n;
        if (
          x < 0 ||
          x > 7 ||
          y < 0 ||
          y > 7 ||
          board[y * 8 + x]?.color !== color
        )
          break;
        line.push(y * 8 + x);
      }
      if (line.length === 5) return line;
    }
  }
  return null;
}
