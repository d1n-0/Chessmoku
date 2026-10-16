import { WebSocket } from "ws";
import { other } from "../../shared/game.js";

export function playerName(value) {
  if (typeof value !== "string") throw new Error("이름을 입력하세요.");
  const name = value.trim();
  if (!name || [...name].length > 16 || /[\p{C}]/u.test(name))
    throw new Error("이름은 1~16자로 입력하세요.");
  return name;
}

// Swap sessions atomically: credentials follow people, not board colors.
function swapColors(room) {
  [room.tokens.w, room.tokens.b] = [room.tokens.b, room.tokens.w];
  [room.sockets.w, room.sockets.b] = [room.sockets.b, room.sockets.w];
  for (const color of ["w", "b"]) {
    if (room.sockets[color]) room.sockets[color].color = color;
  }
  room.colorRequest = null;
  room.undoRequest = null;
  room.rematch = [];
  room.version++;
}

export function handleColorRequest(room, color, message) {
  if (room.game.ply || room.game.result)
    throw new Error("색상은 새 대국의 첫 수를 두기 전에 정할 수 있습니다.");
  if (message.type === "choose-color") {
    if (!["w", "b"].includes(message.color))
      throw new Error("흑 또는 백을 선택하세요.");
    if (message.color === color) {
      if (room.colorRequest === color) room.colorRequest = null;
      return;
    }
    if (!room.tokens[other(color)]) swapColors(room);
    else {
      if (!room.sockets[other(color)])
        throw new Error("상대가 연결될 때까지 기다려 주세요.");
      if (room.colorRequest && room.colorRequest !== color)
        throw new Error("상대의 색상 변경 요청에 먼저 응답하세요.");
      room.colorRequest = color;
    }
  } else {
    if (!room.colorRequest) throw new Error("색상 변경 요청이 없습니다.");
    if (message.accept === true) {
      if (room.colorRequest === color)
        throw new Error("상대만 요청을 수락할 수 있습니다.");
      if (!room.sockets[other(color)])
        throw new Error("상대가 연결될 때까지 기다려 주세요.");
      swapColors(room);
    } else room.colorRequest = null;
  }
}

export function yieldSeat(room, socket, { attach, promote }) {
  if (!room.queue.some((entry) => entry.socket?.readyState === WebSocket.OPEN))
    throw new Error("접속 중인 대기자가 없습니다.");
  const color = socket.color;
  const token = room.tokens[color];
  room.tokens[color] = null;
  room.sockets[color] = null;
  room.colorRequest = null;
  room.undoRequest = null;
  room.rematch = [];
  // Promote the next waiter before appending the departing player.
  promote(room);
  room.queue.push({ token, socket: null });
  attach(socket, room, null, token);
}
