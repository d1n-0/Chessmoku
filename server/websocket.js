import { WebSocketServer, WebSocket } from "ws";
import { createRoomService } from "./rooms/service.js";

export function attachWebSocketServer(server, { rooms, persist }) {
  const wss = new WebSocketServer({ server, maxPayload: 4096 });
  const send = (socket, value) => {
    if (socket?.readyState === WebSocket.OPEN)
      socket.send(JSON.stringify(value));
  };
  const broadcast = (room) => {
    for (const color of ["w", "b"])
      send(room.sockets[color], {
        type: "state",
        code: room.code,
        color,
        game: room.game,
        version: room.version,
        joined: !!room.tokens.b,
        online: {
          w: room.sockets.w?.readyState === 1,
          b: room.sockets.b?.readyState === 1,
        },
        rematch: room.rematch,
      });
  };
  const commit = (room) => {
    room.updated = Date.now();
    persist();
    broadcast(room);
  };
  const detach = (socket) => {
    const room = rooms.get(socket.room);
    if (room && room.sockets[socket.color] === socket) {
      room.sockets[socket.color] = null;
      broadcast(room);
    }
    socket.room = null;
  };
  const attach = (socket, room, color) => {
    detach(socket);
    const old = room.sockets[color];
    room.sockets[color] = socket;
    socket.room = room.code;
    socket.color = color;
    if (old && old !== socket) old.close(4001, "Connected elsewhere");
    send(socket, {
      type: "session",
      code: room.code,
      color,
      token: room.tokens[color],
    });
    commit(room);
  };
  const handleMessage = createRoomService({
    rooms,
    attach,
    detach,
    commit,
    send,
  });
  wss.on("connection", (socket, req) => {
    // Reject cross-site browser connections; CLI clients have no Origin.
    if (req.headers.origin) {
      try {
        if (new URL(req.headers.origin).host !== req.headers.host) {
          socket.close(1008);
          return;
        }
      } catch {
        socket.close(1008);
        return;
      }
    }
    socket.alive = true;
    socket.on("pong", () => (socket.alive = true));
    let count = 0,
      windowStart = Date.now();
    socket.on("message", (buffer) => {
      try {
        if (Date.now() - windowStart > 10000) {
          count = 0;
          windowStart = Date.now();
        }
        if (++count > 40)
          throw new Error("요청이 너무 많습니다. 잠시 기다려 주세요.");
        const message = JSON.parse(buffer.toString());
        if (!message || typeof message !== "object")
          throw new Error("잘못된 요청입니다.");
        handleMessage(socket, message);
      } catch (e) {
        send(socket, {
          type: "error",
          message: e instanceof SyntaxError ? "잘못된 요청입니다." : e.message,
        });
      }
    });
    socket.on("close", () => detach(socket));
    socket.on("error", () => {});
  });
  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (!socket.alive) socket.terminate();
      else {
        socket.alive = false;
        socket.ping();
      }
    }
    let changed = false;
    for (const [code, room] of rooms) {
      if (
        !room.sockets.w &&
        !room.sockets.b &&
        Date.now() - room.updated > 86400000
      ) {
        rooms.delete(code);
        changed = true;
      }
    }
    if (changed) persist();
  }, 30000);
  heartbeat.unref();
  server.on("close", () => clearInterval(heartbeat));
  return wss;
}
