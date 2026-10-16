import { NAMES, squareName } from "/shared/game.js";
import { $, asset } from "./dom.js";

export function renderHistory({ game }) {
  const el = $("history");
  el.replaceChildren();
  $("move-count").textContent = `${game.ply}수`;
  if (!game.history.length) {
    el.innerHTML = '<div class="empty-history">—</div>';
    return;
  }
  for (let i = 0; i < game.history.length; i += 2) {
    const row = document.createElement("div");
    row.className = "history-row";
    const num = document.createElement("span");
    num.textContent = i / 2 + 1;
    row.append(num);
    for (const m of [game.history[i], game.history[i + 1]]) {
      const span = document.createElement("span");
      span.className = "move";
      if (m) {
        span.innerHTML = `<img src="${asset(m.color, m.type)}" alt="${NAMES[m.type]}"> ${m.kind === "place" ? "＋" : squareName(m.from) + (m.captured ? "×" : "→")}${squareName(m.to)}`;
        span.title =
          m.kind === "place"
            ? "배치"
            : m.captured
              ? `${NAMES[m.captured]} 포획`
              : "이동";
      }
      row.append(span);
    }
    el.append(row);
  }
  el.scrollTop = el.scrollHeight;
}
