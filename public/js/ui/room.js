import { colorName } from "/shared/game.js";
import { $ } from "./dom.js";
import { renderLobby, bindLobby } from "./room-lobby.js";
import { confirmAction } from "./dialogs.js";

export function renderRoom({ room, connected, pending }) {
  $("save-name").hidden = !room;
  $("save-name").disabled = !connected || pending;
  renderLobby({ room, connected, pending });
  if (!room) return;
  $("room-players").replaceChildren();
  for (const color of ["w", "b"]) {
    const player = room.players[color];
    const item = document.createElement("li");
    item.textContent = `${colorName(color)} · ${player?.name || "입장 대기"}${room.color === color ? " · 나" : ""}${player?.host ? " · 방장" : ""}${room.ready.includes(color) && room.phase === "waiting" ? " · 준비" : ""}${player && !room.online[color] ? " · 재접속 대기" : ""}`;
    $("room-players").append(item);
  }
  $("queue-status").textContent = room.color
    ? `대기 ${room.queue.length}명`
    : `대기 ${room.queuePosition}번`;
  $("room-queue").replaceChildren();
  for (const entry of room.queue) {
    const item = document.createElement("li");
    item.textContent = `대기 ${entry.position} · ${entry.name}${entry.position === room.queuePosition ? " · 나" : ""}${entry.host ? " · 방장" : ""}${entry.online ? "" : " · 재접속 대기"}`;
    $("room-queue").append(item);
  }
  $("color-controls").hidden = !room.color;
  for (const [id, color] of [
    ["choose-white", "w"],
    ["choose-black", "b"],
  ]) {
    $(id).setAttribute("aria-pressed", String(room.color === color));
    $(id).disabled =
      !connected ||
      pending ||
      room.phase !== "waiting" ||
      !!room.ready.length ||
      !!room.game.ply ||
      !!room.game.result ||
      !!room.colorRequest;
  }
  const requested = !!room.colorRequest;
  const ownRequest = room.colorRequest === room.color;
  $("color-status").hidden = !requested;
  $("color-status").textContent = ownRequest
    ? "색상 변경 응답 대기"
    : "상대가 색상 변경을 요청했습니다.";
  $("color-response").hidden = !requested || ownRequest;
  $("cancel-color").hidden = !requested || !ownRequest;
  for (const id of ["accept-color", "reject-color", "cancel-color"])
    $(id).disabled = !connected || pending;
  $("yield-seat").hidden =
    !room.color || !room.queue.some((entry) => entry.online);
  $("yield-seat").disabled = !connected || pending;
}

export function bindRoomControls({ send, getRoom }) {
  bindLobby({ send, getRoom });
  $("name-form").onsubmit = (event) => {
    event.preventDefault();
    if (getRoom()) send({ type: "rename", name: $("player-name").value });
  };
  $("choose-white").onclick = () => send({ type: "choose-color", color: "w" });
  $("choose-black").onclick = () => send({ type: "choose-color", color: "b" });
  $("accept-color").onclick = () =>
    send({ type: "color-response", accept: true });
  for (const id of ["reject-color", "cancel-color"])
    $(id).onclick = () => send({ type: "color-response", accept: false });
  $("yield-seat").onclick = () =>
    confirmAction(
      "대기자에게 자리를 양보할까요?",
      "현재 대국을 끝내고 대기열의 마지막으로 이동합니다.",
      () => send({ type: "yield-seat" }),
    );
}
