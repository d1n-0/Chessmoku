import { WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { newGame, other } from "../../shared/game.js";

export const defaultSettings = () => ({
  turnSeconds: 0,
  totalSeconds: 0,
  incrementSeconds: 0,
});

export function initializeRoom(room) {
  room.settings ||= defaultSettings();
  room.order ||= [
    ...Object.values(room.tokens).filter(Boolean),
    ...room.queue.map((p) => p.token),
  ];
  room.ids ||= {};
  for (const token of room.order) room.ids[token] ||= randomUUID();
  room.hostToken ||= room.order[0];
  room.phase ||= room.game.result
    ? "finished"
    : room.game.ply
      ? "playing"
      : "waiting";
  room.ready ||= [];
  room.clock ||= { remaining: { w: null, b: null }, turnStarted: null };
}
export function registerPlayer(room, token) {
  room.order.push(token);
  if (!room.hostToken) room.hostToken = token;
  room.ids[token] = randomUUID();
}
export function removePlayer(room, token) {
  room.order = room.order.filter((value) => value !== token);
  delete room.ids[token];
  if (room.hostToken === token) room.hostToken = room.order[0] || null;
}
export function waitingRoom(room) {
  room.game = newGame();
  room.phase = "waiting";
  room.ready = [];
  room.rematch = [];
  room.colorRequest = null;
  room.undoRequest = null;
  room.clock = { remaining: { w: null, b: null }, turnStarted: null };
  room.version++;
}
export function finishRoom(room) {
  room.phase = "finished";
  room.ready = [];
  room.undoRequest = null;
  room.colorRequest = null;
  room.clock.turnStarted = null;
}
export function clockExpired(room, now = Date.now()) {
  if (room.phase !== "playing" || room.clock.turnStarted === null) return false;
  const elapsed = Math.max(0, now - room.clock.turnStarted);
  const color = room.game.turn;
  const remaining = room.clock.remaining[color];
  if (
    (remaining !== null && elapsed >= remaining) ||
    (room.settings.turnSeconds > 0 &&
      elapsed >= room.settings.turnSeconds * 1000)
  ) {
    if (remaining !== null)
      room.clock.remaining[color] = Math.max(0, remaining - elapsed);
    room.game.result = { winner: other(color), reason: "timeout", line: [] };
    finishRoom(room);
    room.version++;
    return true;
  }
  return false;
}
export function chargeClock(room, color, now = Date.now()) {
  if (room.clock.turnStarted !== null && room.clock.remaining[color] !== null)
    room.clock.remaining[color] = Math.max(
      0,
      room.clock.remaining[color] - Math.max(0, now - room.clock.turnStarted),
    );
}
export function handleLobby(room, socket, message, { attach }) {
  const color = socket.color;
  const token = color
    ? room.tokens[color]
    : room.queue.find((p) => p.socket === socket)?.token;
  if (message.type === "ready") {
    if (!color) throw new Error("지정된 플레이어만 준비할 수 있습니다.");
    if (room.phase !== "waiting" || room.colorRequest)
      throw new Error("준비할 수 없는 상태입니다.");
    if (message.ready === true) {
      if (!room.ready.includes(color)) room.ready.push(color);
    } else room.ready = room.ready.filter((c) => c !== color);
    if (
      room.ready.length === 2 &&
      room.sockets.w?.readyState === WebSocket.OPEN &&
      room.sockets.b?.readyState === WebSocket.OPEN
    ) {
      room.phase = "playing";
      const remaining = room.settings.totalSeconds
        ? room.settings.totalSeconds * 1000
        : null;
      room.clock = {
        remaining: { w: remaining, b: remaining },
        turnStarted: Date.now(),
      };
    }
    return;
  }
  if (room.hostToken !== token) throw new Error("방장만 사용할 수 있습니다.");
  if (message.type === "stop-game") {
    if (room.phase !== "playing") throw new Error("진행 중인 대국이 없습니다.");
    chargeClock(room, room.game.turn);
    room.game.result = { winner: null, reason: "stopped", line: [] };
    finishRoom(room);
    room.version++;
    return;
  }
  if (message.type === "prepare-game") {
    if (room.phase !== "finished")
      throw new Error("대국 종료 후 새 대국을 준비하세요.");
    waitingRoom(room);
    return;
  }
  if (room.phase !== "waiting" || room.ready.length)
    throw new Error(
      "모두 준비를 취소한 뒤 변경하세요. 진행 중이면 먼저 대국을 중단하세요.",
    );
  if (message.type === "settings") {
    const settings = message.settings;
    for (const [key, max] of [
      ["turnSeconds", 3600],
      ["totalSeconds", 86400],
      ["incrementSeconds", 600],
    ]) {
      if (
        !Number.isInteger(settings?.[key]) ||
        settings[key] < 0 ||
        settings[key] > max
      )
        throw new Error("시간 설정 범위를 확인하세요.");
    }
    if (!settings.totalSeconds && settings.incrementSeconds)
      throw new Error("추가 시간은 총 시간을 설정해야 사용할 수 있습니다.");
    room.settings = Object.fromEntries(
      Object.keys(defaultSettings()).map((key) => [key, settings[key]]),
    );
    room.version++;
    return;
  }
  if (message.type === "assign-player") {
    if (!["w", "b"].includes(message.color))
      throw new Error("흑 또는 백을 선택하세요.");
    const index = room.queue.findIndex(
      (entry) => room.ids[entry.token] === message.playerId,
    );
    if (index < 0 || room.queue[index].socket?.readyState !== WebSocket.OPEN)
      throw new Error("접속 중인 대기자를 선택하세요.");
    const [entry] = room.queue.splice(index, 1);
    const displacedToken = room.tokens[message.color];
    const displacedSocket = room.sockets[message.color];
    room.tokens[message.color] = entry.token;
    room.sockets[message.color] = null;
    if (displacedToken) {
      room.queue.push({ token: displacedToken, socket: null });
      if (displacedSocket) attach(displacedSocket, room, null, displacedToken);
    }
    attach(entry.socket, room, message.color);
    waitingRoom(room);
  }
}
