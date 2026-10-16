import { legalTargets, NAMES, colorName, squareName } from "/shared/game.js";
import { $, asset } from "./dom.js";

export function renderBoard({ game, selection, flipped, canAct }) {
  const targets = canAct ? legalTargets(game, selection) : [];
  const board = $("board");
  board.replaceChildren();
  for (let display = 0; display < 64; display++) {
    const i = flipped ? 63 - display : display,
      p = game.board[i],
      b = document.createElement("button");
    b.type = "button";
    b.dataset.square = i;
    b.className =
      "square" +
      ((Math.floor(i / 8) + (i % 8)) % 2 ? " dark" : "") +
      (p ? " occupied" : "") +
      (targets.includes(i) ? " target" : "") +
      (selection?.from === i ? " selected" : "") +
      (game.last && (game.last.to === i || game.last.from === i)
        ? " last"
        : "") +
      (game.result?.line.includes(i) ? " winning" : "");
    b.setAttribute(
      "aria-label",
      `${squareName(i)} ${p ? colorName(p.color) + " " + NAMES[p.type] : "빈 칸"}`,
    );
    b.setAttribute("aria-pressed", String(selection?.from === i));
    if (p) {
      const img = document.createElement("img");
      img.src = asset(p.color, p.type);
      img.alt = "";
      img.draggable = false;
      b.append(img);
    }
    if (display % 8 === 0) {
      const span = document.createElement("span");
      span.className = "coord rank";
      span.textContent = 8 - Math.floor(i / 8);
      b.append(span);
    }
    if (display >= 56) {
      const span = document.createElement("span");
      span.className = "coord file";
      span.textContent = "abcdefgh"[i % 8];
      b.append(span);
    }
    board.append(b);
  }
}
