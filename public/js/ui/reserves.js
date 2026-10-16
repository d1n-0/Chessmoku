import { NAMES, TYPES, colorName } from "/shared/game.js";
import { $, asset } from "./dom.js";

export function renderReserves({ game, selection, mode, room, canAct }) {
  const c = mode === "online" && room ? room.color : game.turn;
  $("reserve-color").textContent =
    `${colorName(c)}${mode === "online" && room ? " · 나" : ""}`;
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
