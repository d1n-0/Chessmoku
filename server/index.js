import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "node:http";
import { randomBytes, randomInt } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { newGame, applyAction, other } from "../shared/game.js";

export function createApp({ dataDir = process.env.DATA_DIR || "./data" } = {}) {
  mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, "rooms.json"),
    rooms = new Map();
  try {
    for (const room of JSON.parse(readFileSync(file, "utf8")))
      rooms.set(room.code, { ...room, sockets: { w: null, b: null } });
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const persist = () => {
    writeFileSync(
      file + ".tmp",
      JSON.stringify([...rooms.values()].map(({ sockets, ...r }) => r)),
      { mode: 0o600 },
    );
    renameSync(file + ".tmp", file);
  };
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'",
    );
    next();
  });
  app.get("/health", (_, res) => res.json({ ok: true }));
  const root = fileURLToPath(new URL("../", import.meta.url));
  app.use("/shared", express.static(path.join(root, "shared")));
  app.use(express.static(path.join(root, "public")));
  const server = createServer(app),
    wss = new WebSocketServer({ server, maxPayload: 4096 });
  const send = (ws, value) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(value));
  };
  const broadcast = (r) => {
    for (const color of ["w", "b"])
      send(r.sockets[color], {
        type: "state",
        code: r.code,
        color,
        game: r.game,
        version: r.version,
        joined: !!r.tokens.b,
        online: {
          w: r.sockets.w?.readyState === 1,
          b: r.sockets.b?.readyState === 1,
        },
        rematch: r.rematch,
      });
  };
  const commit = (r) => {
    r.updated = Date.now();
    persist();
    broadcast(r);
  };
  const detach = (ws) => {
    const r = rooms.get(ws.room);
    if (r && r.sockets[ws.color] === ws) {
      r.sockets[ws.color] = null;
      broadcast(r);
    }
    ws.room = null;
  };
  const attach = (ws, r, color) => {
    detach(ws);
    const old = r.sockets[color];
    r.sockets[color] = ws;
    ws.room = r.code;
    ws.color = color;
    if (old && old !== ws) old.close(4001, "Connected elsewhere");
    send(ws, { type: "session", code: r.code, color, token: r.tokens[color] });
    commit(r);
  };
  wss.on("connection", (ws, req) => {
    // Reject cross-site browser connections; CLI clients have no Origin.
    if (req.headers.origin) {
      try {
        if (new URL(req.headers.origin).host !== req.headers.host) {
          ws.close(1008);
          return;
        }
      } catch {
        ws.close(1008);
        return;
      }
    }
    ws.alive = true;
    ws.on("pong", () => (ws.alive = true));
    let count = 0,
      windowStart = Date.now();
    ws.on("message", (buffer) => {
      try {
        if (Date.now() - windowStart > 10000) {
          count = 0;
          windowStart = Date.now();
        }
        if (++count > 40)
          throw new Error("요청이 너무 많습니다. 잠시 기다려 주세요.");
        const msg = JSON.parse(buffer.toString());
        if (!msg || typeof msg !== "object")
          throw new Error("잘못된 요청입니다.");
        if (msg.type === "create") {
          if (ws.room) throw new Error("현재 방을 나간 뒤 새 방을 만드세요.");
          if (rooms.size >= 1000)
            throw new Error("방이 가득 찼습니다. 잠시 후 다시 시도하세요.");
          const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
          let code;
          do {
            code = Array.from(
              { length: 6 },
              () => alphabet[randomInt(alphabet.length)],
            ).join("");
          } while (rooms.has(code));
          const r = {
            code,
            tokens: { w: randomBytes(24).toString("hex"), b: null },
            game: newGame(),
            version: 0,
            rematch: [],
            updated: Date.now(),
            sockets: { w: null, b: null },
          };
          rooms.set(code, r);
          attach(ws, r, "w");
          return;
        }
        if (msg.type === "join" || msg.type === "resume") {
          if (ws.room) throw new Error("이미 방에 입장했습니다.");
          const r = rooms.get(String(msg.code).toUpperCase());
          if (!r) throw new Error("방을 찾을 수 없습니다. 코드를 확인하세요.");
          if (msg.type === "resume") {
            const color = ["w", "b"].find(
              (c) => r.tokens[c] && r.tokens[c] === msg.token,
            );
            if (!color) throw new Error("재접속 정보가 올바르지 않습니다.");
            attach(ws, r, color);
            return;
          }
          if (r.tokens.b) throw new Error("이미 두 명이 입장한 방입니다.");
          r.tokens.b = randomBytes(24).toString("hex");
          attach(ws, r, "b");
          return;
        }
        const r = rooms.get(ws.room),
          color = ws.color;
        if (!r || r.sockets[color] !== ws)
          throw new Error("먼저 방에 입장하세요.");
        if (msg.type === "leave") {
          if (r.tokens.b && !r.game.result) {
            r.game.result = {
              winner: other(color),
              reason: "resign",
              line: [],
            };
            r.version++;
          }
          detach(ws);
          commit(r);
          send(ws, { type: "left" });
          return;
        }
        if (msg.type === "action") {
          if (!r.sockets[other(color)] || !r.tokens.b)
            throw new Error("상대가 연결될 때까지 기다려 주세요.");
          if (msg.version !== r.version)
            throw new Error("대국 상태가 바뀌었습니다. 다시 선택하세요.");
          r.game = applyAction(r.game, msg.action, color);
          r.version++;
        } else if (msg.type === "resign") {
          if (r.game.result || !r.tokens.b)
            throw new Error("진행 중인 대국이 없습니다.");
          r.game.result = { winner: other(color), reason: "resign", line: [] };
          r.version++;
        } else if (msg.type === "rematch") {
          if (!r.game.result)
            throw new Error("대국 종료 후 다시 대국할 수 있습니다.");
          if (!r.rematch.includes(color)) r.rematch.push(color);
          if (r.rematch.length === 2) {
            r.game = newGame();
            r.version++;
            r.rematch = [];
          }
        } else throw new Error("알 수 없는 요청입니다.");
        commit(r);
      } catch (e) {
        send(ws, {
          type: "error",
          message: e instanceof SyntaxError ? "잘못된 요청입니다." : e.message,
        });
      }
    });
    ws.on("close", () => detach(ws));
    ws.on("error", () => {});
  });
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.alive) ws.terminate();
      else {
        ws.alive = false;
        ws.ping();
      }
    }
    let changed = false;
    for (const [code, r] of rooms) {
      if (!r.sockets.w && !r.sockets.b && Date.now() - r.updated > 86400000) {
        rooms.delete(code);
        changed = true;
      }
    }
    if (changed) persist();
  }, 30000);
  heartbeat.unref();
  server.on("close", () => clearInterval(heartbeat));
  return { server, wss, rooms };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { server, wss } = createApp();
  const port = Number(process.env.PORT) || 3000;
  server.listen(port, "0.0.0.0", () =>
    console.log(`Chess × Gomoku · http://localhost:${port}`),
  );
  const stop = () => {
    for (const ws of wss.clients) ws.close(1001);
    wss.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
