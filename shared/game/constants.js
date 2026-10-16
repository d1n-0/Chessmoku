export const SIZE = 8;
export const TYPES = ["p", "n", "b", "r", "q", "k"];
export const NAMES = {
  p: "폰",
  n: "나이트",
  b: "비숍",
  r: "룩",
  q: "퀸",
  k: "킹",
};
export const colorName = (c) => (c === "w" ? "백" : "흑");
export const other = (c) => (c === "w" ? "b" : "w");
export const squareName = (i) => "abcdefgh"[i % 8] + (8 - Math.floor(i / 8));

export const validSquare = (i) =>
  Number.isInteger(i) && i >= 0 && i < SIZE * SIZE;
