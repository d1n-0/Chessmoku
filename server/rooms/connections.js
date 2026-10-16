import { WebSocket } from "ws";
import { newGame } from "../../shared/game.js";

export function createRoomConnections({ rooms, persist }) {
  const send = (socket, message) => {
    if (socket?.readyState === WebSocket.OPEN)
      socket.send(JSON.stringify(message));
  };
  function broadcast(room) {
    const recipients = [
      ...["w", "b"].map((color) => ({
        socket: room.sockets[color],
        color,
        position: null,
      })),
      ...room.queue.map((entry, index) => ({
        socket: entry.socket,
        color: null,
        position: index + 1,
      })),
    ];
    for (const { socket, color, position } of recipients) {
      send(socket, {
        type: "state",
        code: room.code,
        color,
        queuePosition: position,
        queue: room.queue.map((entry, index) => ({
          position: index + 1,
          online: entry.socket?.readyState === WebSocket.OPEN,
        })),
        game: room.game,
        version: room.version,
        joined: !!room.tokens.w && !!room.tokens.b,
        online: {
          w: room.sockets.w?.readyState === WebSocket.OPEN,
          b: room.sockets.b?.readyState === WebSocket.OPEN,
        },
        rematch: room.rematch,
      });
    }
  }
  function commit(room) {
    room.updated = Date.now();
    persist();
    broadcast(room);
  }
  function detach(socket) {
    const room = rooms.get(socket.room);
    if (room) {
      if (socket.color && room.sockets[socket.color] === socket)
        room.sockets[socket.color] = null;
      const entry = room.queue.find((entry) => entry.socket === socket);
      if (entry) entry.socket = null;
      broadcast(room);
    }
    socket.room = null;
    socket.color = null;
  }
  function attach(socket, room, color, token = room.tokens[color]) {
    detach(socket);
    const entry = color
      ? null
      : room.queue.find((entry) => entry.token === token);
    const old = color ? room.sockets[color] : entry.socket;
    if (color) room.sockets[color] = socket;
    else entry.socket = socket;
    socket.room = room.code;
    socket.color = color;
    if (old && old !== socket) old.close(4001, "Connected elsewhere");
    send(socket, { type: "session", code: room.code, color, token });
  }
  // A dropped network connection does not surrender a player's seat.
  // Only connected waiters are promoted; offline waiters retain their order.
  function promote(room) {
    let changed = false;
    for (const color of ["w", "b"]) {
      if (room.tokens[color]) continue;
      const index = room.queue.findIndex(
        (entry) => entry.socket?.readyState === WebSocket.OPEN,
      );
      if (index < 0) break;
      const [entry] = room.queue.splice(index, 1);
      room.tokens[color] = entry.token;
      attach(entry.socket, room, color);
      changed = true;
    }
    if (changed) {
      room.game = newGame();
      room.version++;
      room.rematch = [];
    }
  }
  return { send, broadcast, commit, detach, attach, promote };
}
