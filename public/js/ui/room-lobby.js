import { $ } from "./dom.js";
import { confirmAction } from "./dialogs.js";

let lastSettings = "",
  clockState = null,
  receivedAt = 0;
function timeText(ms) {
  if (ms === null) return "∞";
  const seconds = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
function renderClock() {
  if (!clockState) return;
  const { clock, game, phase, settings, serverNow } = clockState;
  const elapsed =
    phase === "playing" && clock.turnStarted !== null
      ? Math.max(
          0,
          serverNow - clock.turnStarted + performance.now() - receivedAt,
        )
      : 0;
  $("game-clock").textContent = ["w", "b"]
    .map((color) => {
      let left = clock.remaining[color];
      if (left !== null && game.turn === color) left -= elapsed;
      return `${color === "w" ? "백" : "흑"} ${timeText(left)}`;
    })
    .join(" · ");
  if (phase === "playing" && settings.turnSeconds)
    $("game-clock").textContent +=
      ` · 착수 ${timeText(settings.turnSeconds * 1000 - elapsed)}`;
}
export function renderLobby({ room, connected, pending }) {
  if (clockState !== room) {
    clockState = room;
    receivedAt = performance.now();
  }
  $("game-clock").hidden =
    !room ||
    (!room.settings.totalSeconds && !room.settings.turnSeconds) ||
    room.phase === "waiting";
  const preparing = room?.phase === "waiting";
  $("room-setup").hidden = !preparing;
  $("board").inert = !!preparing;
  document.querySelector(".arena").classList.toggle("preparing", !!preparing);
  if (!room) return;
  renderClock();
  const waiting = room.phase === "waiting";
  const editable = waiting && !room.ready.length && connected && !pending;
  $("ready-game").hidden = !room.color || !waiting;
  $("ready-game").textContent = room.ready.includes(room.color)
    ? "준비 취소"
    : "준비";
  $("ready-game").disabled = !connected || pending || !!room.colorRequest;
  $("host-controls").hidden = !room.isHost;
  $("room-settings").hidden = !waiting;
  $("assign-form").hidden = !waiting;
  $("stop-game").hidden = room.phase !== "playing";
  $("prepare-game").hidden = room.phase !== "finished";
  for (const id of ["stop-game", "prepare-game"])
    $(id).disabled = !connected || pending;
  for (const element of $("room-settings").elements)
    element.disabled = !editable || !room.isHost;
  $("save-settings").hidden = !room.isHost;
  $("setup-ready-status").textContent = ["w", "b"]
    .map(
      (color) =>
        `${color === "w" ? "백" : "흑"} · ${!room.players[color] ? "입장 대기" : room.ready.includes(color) ? "준비 완료" : "준비 대기"}`,
    )
    .join(" / ");
  for (const element of $("assign-form").elements) element.disabled = !editable;
  const key = JSON.stringify([room.code, room.settings]);
  if (key !== lastSettings) {
    lastSettings = key;
    $("turn-seconds").value = room.settings.turnSeconds;
    $("total-minutes").value = room.settings.totalSeconds / 60;
    $("increment-seconds").value = room.settings.incrementSeconds;
  }
  const s = room.settings;
  $("time-settings-summary").textContent =
    `총 ${s.totalSeconds ? timeText(s.totalSeconds * 1000) : "무제한"} · +${s.incrementSeconds}초${s.turnSeconds ? ` · 수당 ${s.turnSeconds}초` : ""}`;
  const selected = $("assign-player").value;
  $("assign-player").replaceChildren();
  for (const entry of room.queue.filter((p) => p.online)) {
    const option = document.createElement("option");
    option.value = entry.id;
    option.textContent = `${entry.position}. ${entry.name}`;
    $("assign-player").append(option);
  }
  if (
    [...$("assign-player").options].some((option) => option.value === selected)
  )
    $("assign-player").value = selected;
  $("assign-submit").disabled = !editable || !$("assign-player").options.length;
}
export function bindLobby({ send, getRoom }) {
  setInterval(renderClock, 100);
  $("ready-game").onclick = () =>
    send({ type: "ready", ready: !getRoom().ready.includes(getRoom().color) });
  $("room-settings").onsubmit = (event) => {
    event.preventDefault();
    send({
      type: "settings",
      settings: {
        turnSeconds: Number($("turn-seconds").value),
        totalSeconds: Math.round(Number($("total-minutes").value) * 60),
        incrementSeconds: Number($("increment-seconds").value),
      },
    });
  };
  $("assign-form").onsubmit = (event) => {
    event.preventDefault();
    send({
      type: "assign-player",
      color: $("assign-color").value,
      playerId: $("assign-player").value,
    });
  };
  $("stop-game").onclick = () =>
    confirmAction("대국을 중단할까요?", "승패 없이 종료합니다.", () =>
      send({ type: "stop-game" }),
    );
  $("prepare-game").onclick = () => send({ type: "prepare-game" });
}
