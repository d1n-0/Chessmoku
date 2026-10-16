import { NAMES, TYPES, colorName, other } from "/shared/game.js";
import { $, asset } from "./dom.js";

export function renderReserves({ game, selection, mode, room, canAct }) {
  const c = mode === "online" && room?.color ? room.color : game.turn;
  $("reserve-color").textContent =
    `${colorName(c)}${mode === "online" && room?.color ? " · 나" : ""}`;
  const opponent = other(c);
  $("opponent-color").textContent =
    `${colorName(opponent)}${room?.color ? " · 상대" : ""}`;
  $("opponent-reserves").replaceChildren();
  for (const type of TYPES) {
    const piece = document.createElement("div");
    piece.className = "held-piece";
    piece.dataset.type = type;
    piece.setAttribute(
      "aria-label",
      `${colorName(opponent)} ${NAMES[type]} 보관, ${game.reserves[opponent][type]}개`,
    );
    piece.innerHTML = `<img src="${asset(opponent, type)}" alt=""><span>${game.reserves[opponent][type]}</span>`;
    $("opponent-reserves").append(piece);
  }
  $("reserves").replaceChildren();
  for (const type of TYPES) {
    const b = document.createElement("button");
    b.className = "reserve" + (selection?.type === type ? " selected" : "");
    b.dataset.type = type;
    b.disabled = !canAct || game.reserves[c][type] === 0;
    b.setAttribute(
      "aria-label",
      `${colorName(c)} ${NAMES[type]} 배치, ${game.reserves[c][type]}개`,
    );
    b.setAttribute("aria-pressed", String(selection?.type === type));
    b.innerHTML = `<span class="count">${game.reserves[c][type]}</span><img src="${asset(c, type)}" alt=""><span class="name">${NAMES[type]}</span>`;
    $("reserves").append(b);
  }
}
