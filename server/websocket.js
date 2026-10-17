import { clockExpired } from "./rooms/lifecycle.js";
import { WebSocketServer } from "ws";
import { createRoomConnections } from "./rooms/connections.js";
import { createRoomService } from "./rooms/service.js";

export function attachWebSocketServer(server, { rooms, persist }) {
  const wss = new WebSocketServer({ server, maxPayload: 4096 });
  const connections = createRoomConnections({ rooms, persist });
  const { send, detach } = connections;
  const handleMessage = createRoomService({ rooms, ...connections });
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
  const timer = setInterval(() => {
    for (const room of rooms.values())
      if (clockExpired(room)) connections.commit(room);
  }, 250);
  timer.unref();
  server.on("close", () => clearInterval(timer));
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
        !room.queue.some((entry) => entry.socket) &&
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
