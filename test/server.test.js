import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { WebSocket } from "ws";
import { createApp } from "../server/app.js";
function client(url) {
  return new Promise((resolve) => {
    const ws = new WebSocket(url),
      queue = [],
      waiters = [];
    ws.on("message", (data) => {
      const msg = JSON.parse(data);
      const i = waiters.findIndex((w) => w.filter(msg));
      if (i >= 0) {
        const w = waiters.splice(i, 1)[0];
        clearTimeout(w.timer);
        w.resolve(msg);
      } else queue.push(msg);
    });
    ws.next = (filter) => {
      const i = queue.findIndex(filter);
      if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0]);
      return new Promise((resolve, reject) => {
        const w = { filter, resolve };
        w.timer = setTimeout(() => {
          waiters.splice(waiters.indexOf(w), 1);
          reject(new Error("Message timeout"));
        }, 3000);
        waiters.push(w);
      });
    };
    ws.sendJSON = (o) => ws.send(JSON.stringify(o));
    ws.on("open", () => resolve(ws));
  });
}
async function launch(dir) {
  const app = createApp({ dataDir: dir });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  return {
    ...app,
    url: `ws://127.0.0.1:${app.server.address().port}`,
    stop: async () => {
      for (const ws of app.wss.clients) ws.terminate();
      await new Promise((r) => app.wss.close(r));
      await new Promise((r) => app.server.close(r));
    },
  };
}
test("room lifecycle: authority, joins, capture, persistence, resume, rematch, leave", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "five-test-"));
  let app = await launch(dir);
  const clients = [];
  try {
    const a = await client(app.url);
    clients.push(a);
    a.sendJSON({ type: "create" });
    const sa = await a.next((m) => m.type === "session");
    const initial = await a.next((m) => m.type === "state");
    assert.equal(initial.game.rulesVersion, 2);
    assert.equal(initial.game.board[60].type, "k");
    assert.equal(initial.game.board[4].type, "k");
    assert.equal(initial.game.reserves.w.k, 0);
    assert.equal(initial.game.reserves.b.k, 0);
    a.sendJSON({
      type: "action",
      version: 0,
      action: { kind: "place", type: "r", to: 0 },
    });
    assert.match((await a.next((m) => m.type === "error")).message, /상대/);
    const b = await client(app.url);
    clients.push(b);
    b.sendJSON({ type: "join", code: sa.code.toLowerCase() });
    const sb = await b.next((m) => m.type === "session");
    assert.equal(sb.color, "b");
    await b.next((m) => m.type === "state");
    await a.next((m) => m.type === "state" && m.joined);
    const c = await client(app.url);
    clients.push(c);
    c.sendJSON({ type: "join", code: sa.code });
    const waiting = await c.next((m) => m.type === "state");
    assert.equal(waiting.color, null);
    assert.equal(waiting.queuePosition, 1);
    c.sendJSON({ type: "leave" });
    await c.next((m) => m.type === "left");
    c.sendJSON({ type: "resume", code: sa.code, token: "invalid" });
    assert.match((await c.next((m) => m.type === "error")).message, /재접속/);
    b.sendJSON({
      type: "action",
      version: 0,
      action: { kind: "place", type: "q", to: 0 },
    });
    assert.match((await b.next((m) => m.type === "error")).message, /차례/);
    a.sendJSON({
      type: "action",
      version: 0,
      action: { kind: "place", type: "r", to: 0 },
    });
    await a.next((m) => m.type === "state" && m.version === 1);
    await b.next((m) => m.type === "state" && m.version === 1);
    b.sendJSON({
      type: "action",
      version: 0,
      action: { kind: "place", type: "p", to: 63 },
    });
    assert.match((await b.next((m) => m.type === "error")).message, /바뀌/);
    b.sendJSON({
      type: "action",
      version: 1,
      action: { kind: "place", type: "p", to: 63 },
    });
    await a.next((m) => m.type === "state" && m.version === 2);
    await b.next((m) => m.type === "state" && m.version === 2);
    a.sendJSON({
      type: "action",
      version: 2,
      action: { kind: "move", from: 0, to: 4 },
    });
    const win = await a.next((m) => m.type === "state" && m.version === 3);
    assert.equal(win.game.result.reason, "king");
    await b.next((m) => m.type === "state" && m.version === 3);
    await app.stop();
    app = await launch(dir);
    const ar = await client(app.url);
    clients.push(ar);
    ar.sendJSON({ type: "resume", ...sa }); // session.type would overwrite resume; send explicit below
    // A session message is not a valid request; the server must reject it without changing the room.
    await ar.next((m) => m.type === "error");
    ar.sendJSON({ type: "resume", code: sa.code, token: sa.token });
    await ar.next((m) => m.type === "session");
    const restored = await ar.next((m) => m.type === "state");
    assert.equal(restored.game.result.reason, "king");
    const br = await client(app.url);
    clients.push(br);
    br.sendJSON({ type: "resume", code: sb.code, token: sb.token });
    await br.next((m) => m.type === "session");
    await br.next((m) => m.type === "state");
    ar.sendJSON({ type: "rematch" });
    const request = await ar.next(
      (m) => m.type === "state" && m.rematch.length === 1,
    );
    assert.equal(request.game.result.reason, "king");
    br.sendJSON({ type: "rematch" });
    const reset = await br.next((m) => m.type === "state" && m.version === 4);
    assert.equal(reset.game.ply, 0);
    assert.equal(reset.game.result, null);
    assert.equal(reset.game.board[60].type, "k");
    assert.equal(reset.game.board[4].type, "k");
    assert.equal(reset.game.reserves.w.k, 0);
    br.sendJSON({ type: "leave" });
    const left = await ar.next(
      (m) => m.type === "state" && m.game.result?.reason === "resign",
    );
    assert.equal(left.game.result.winner, "w");
    await br.next((m) => m.type === "left");
  } finally {
    for (const c of clients) c.terminate();
    await app.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("cross origin websocket rejected and health endpoint available", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "five-origin-")),
    app = await launch(dir);
  try {
    const res = await fetch(app.url.replace("ws:", "http:") + "/health");
    assert.equal(res.status, 200);
    const ws = new WebSocket(app.url, { origin: "https://evil.example" });
    const code = await new Promise((resolve) => ws.on("close", resolve));
    assert.equal(code, 1008);
  } finally {
    await app.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("queue persists, resumes, restricts spectators and promotes FIFO on explicit leave", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "chessmoku-queue-"));
  let app = await launch(dir);
  const clients = [];
  const connect = async () => {
    const socket = await client(app.url);
    clients.push(socket);
    return socket;
  };
  const join = async (code) => {
    const socket = await connect();
    socket.sendJSON({ type: "join", code });
    const session = await socket.next((m) => m.type === "session");
    const state = await socket.next((m) => m.type === "state");
    return { socket, session, state };
  };
  const resume = async (session) => {
    const socket = await connect();
    socket.sendJSON({
      type: "resume",
      code: session.code,
      token: session.token,
    });
    await socket.next((m) => m.type === "session");
    return socket;
  };
  try {
    const white = await connect();
    white.sendJSON({ type: "create" });
    const owner = await white.next((m) => m.type === "session");
    const black = await join(owner.code);
    const first = await join(owner.code);
    const second = await join(owner.code);
    assert.equal(first.state.queuePosition, 1);
    assert.equal(second.state.queuePosition, 2);
    assert.equal(
      JSON.stringify(second.state).includes(first.session.token),
      false,
    );
    for (const type of ["action", "resign", "rematch"]) {
      first.socket.sendJSON({
        type,
        version: 0,
        action: { kind: "place", type: "q", to: 0 },
      });
      assert.match(
        (await first.socket.next((m) => m.type === "error")).message,
        /대기 중/,
      );
    }
    // Socket loss retains the player's seat and the queued session's rank.
    black.socket.close();
    await white.next((m) => m.type === "state" && m.joined && !m.online.b);
    assert.equal(app.rooms.get(owner.code).tokens.b, black.session.token);
    await app.stop();
    app = await launch(dir);
    const restoredWhite = await resume(owner);
    const restoredSecond = await resume(second.session);
    const secondState = await restoredSecond.next((m) => m.type === "state");
    assert.equal(secondState.queuePosition, 2);
    assert.equal(secondState.queue[0].online, false);
    const restoredFirst = await resume(first.session);
    await restoredFirst.next((m) => m.type === "state");
    const restoredBlack = await resume(black.session);
    await restoredBlack.next((m) => m.type === "state");
    restoredBlack.sendJSON({ type: "leave" });
    const promoted = await restoredFirst.next(
      (m) => m.type === "state" && m.color === "b",
    );
    assert.equal(promoted.game.ply, 0);
    assert.equal(promoted.game.result, null);
    assert.equal(promoted.queuePosition, null);
    assert.equal(promoted.game.board[4].type, "k");
    await restoredSecond.next(
      (m) => m.type === "state" && m.queuePosition === 1,
    );
    // Leaving revokes the old player's credential.
    const revoked = await connect();
    revoked.sendJSON({
      type: "resume",
      code: owner.code,
      token: black.session.token,
    });
    assert.match(
      (await revoked.next((m) => m.type === "error")).message,
      /재접속/,
    );
    restoredWhite.sendJSON({
      type: "action",
      version: promoted.version,
      action: { kind: "place", type: "r", to: 0 },
    });
    const watched = await restoredSecond.next(
      (m) => m.type === "state" && m.game.ply === 1,
    );
    assert.equal(watched.game.reserves.w.r, 1);
    restoredSecond.sendJSON({ type: "leave" });
    await restoredSecond.next((m) => m.type === "left");
    restoredFirst.sendJSON({ type: "leave" });
    await restoredFirst.next((m) => m.type === "left");
    const replacement = await join(owner.code);
    assert.equal(replacement.state.color, "b");
    assert.equal(replacement.state.game.ply, 0);
    assert.equal(replacement.state.game.result, null);
    assert.equal(replacement.state.queue.length, 0);
  } finally {
    for (const socket of clients) socket.terminate();
    await app.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("offline waiters are skipped, white seats can be filled and queue cancellation keeps rematch votes", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "chessmoku-order-"));
  const app = await launch(dir);
  const sockets = [];
  try {
    for (let i = 0; i < 4; i++) sockets.push(await client(app.url));
    const [white, black, first, second] = sockets;
    white.sendJSON({ type: "create" });
    const owner = await white.next((m) => m.type === "session");
    const sessions = [];
    for (const socket of [black, first, second]) {
      socket.sendJSON({ type: "join", code: owner.code });
      sessions.push(await socket.next((m) => m.type === "session"));
      await socket.next((m) => m.type === "state");
    }
    first.close();
    await second.next(
      (m) => m.type === "state" && m.queue[0]?.online === false,
    );
    white.sendJSON({ type: "leave" });
    const promoted = await second.next(
      (m) => m.type === "state" && m.color === "w",
    );
    assert.equal(promoted.queue.length, 1);
    assert.equal(promoted.game.result, null);
    const resumed = await client(app.url);
    sockets.push(resumed);
    resumed.sendJSON({
      type: "resume",
      code: owner.code,
      token: sessions[1].token,
    });
    await resumed.next((m) => m.type === "session");
    assert.equal(
      (await resumed.next((m) => m.type === "state")).queuePosition,
      1,
    );
    black.sendJSON({ type: "resign" });
    await second.next((m) => m.type === "state" && m.game.result);
    second.sendJSON({ type: "rematch" });
    await resumed.next((m) => m.type === "state" && m.rematch.includes("w"));
    resumed.sendJSON({ type: "leave" });
    await resumed.next((m) => m.type === "left");
    const remaining = await second.next(
      (m) => m.type === "state" && m.queue.length === 0,
    );
    assert.deepEqual(remaining.rematch, ["w"]);
    black.sendJSON({ type: "rematch" });
    await second.next(
      (m) =>
        m.type === "state" && m.game.result === null && m.rematch.length === 0,
    );
  } finally {
    sockets.forEach((socket) => socket.terminate());
    await app.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("player names, consensual colors, credential ownership and yielding seats", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "chessmoku-players-"));
  let app = await launch(dir);
  const sockets = [];
  const connect = async () => {
    const socket = await client(app.url);
    sockets.push(socket);
    return socket;
  };
  try {
    const a = await connect();
    a.sendJSON({ type: "create", name: "가람" });
    const sa = await a.next((m) => m.type === "session");
    a.sendJSON({ type: "choose-color", color: "b" });
    const solo = await a.next((m) => m.type === "state" && m.color === "b");
    assert.equal(solo.players.b.name, "가람");
    const b = await connect();
    b.sendJSON({ type: "join", code: sa.code, name: "나래" });
    const sb = await b.next((m) => m.type === "session");
    assert.equal(sb.color, "w");
    a.sendJSON({ type: "choose-color", color: "w" });
    await b.next((m) => m.type === "state" && m.colorRequest === "b");
    a.sendJSON({ type: "color-response", accept: true });
    assert.match((await a.next((m) => m.type === "error")).message, /상대만/);
    b.sendJSON({
      type: "action",
      version: solo.version,
      action: { kind: "place", type: "p", to: 48 },
    });
    assert.match((await b.next((m) => m.type === "error")).message, /색상/);
    b.sendJSON({ type: "color-response", accept: false });
    await a.next((m) => m.type === "state" && m.joined && !m.colorRequest);
    a.sendJSON({ type: "choose-color", color: "w" });
    await b.next((m) => m.type === "state" && m.colorRequest === "b");
    b.sendJSON({ type: "color-response", accept: true });
    const swapped = await a.next(
      (m) => m.type === "state" && m.color === "w" && m.version > solo.version,
    );
    assert.equal(swapped.players.w.name, "가람");
    assert.equal(app.rooms.get(sa.code).tokens.w, sa.token);
    a.sendJSON({
      type: "action",
      version: swapped.version,
      action: { kind: "place", type: "p", to: 48 },
    });
    await b.next((m) => m.type === "state" && m.game.ply === 1);
    a.sendJSON({ type: "choose-color", color: "b" });
    assert.match((await a.next((m) => m.type === "error")).message, /첫 수/);
    const c = await connect();
    c.sendJSON({ type: "join", code: sa.code, name: "다온" });
    const sc = await c.next((m) => m.type === "session");
    c.sendJSON({ type: "choose-color", color: "w" });
    assert.match((await c.next((m) => m.type === "error")).message, /대기 중/);
    c.sendJSON({ type: "rename", name: "새 이름" });
    const renamed = await a.next(
      (m) => m.type === "state" && m.queue[0]?.name === "새 이름",
    );
    assert.equal(JSON.stringify(renamed).includes(sc.token), false);
    c.sendJSON({ type: "rename", name: "x".repeat(17) });
    await c.next((m) => m.type === "error");
    a.sendJSON({ type: "yield-seat" });
    const yielded = await a.next((m) => m.type === "state" && m.color === null);
    assert.equal(yielded.queuePosition, 1);
    assert.equal(yielded.queue[0].name, "가람");
    assert.equal(yielded.players.w.name, "새 이름");
    assert.equal(yielded.game.ply, 0);
    assert.equal(app.rooms.get(sa.code).tokens.w, sc.token);
    await app.stop();
    app = await launch(dir);
    const resumed = await connect();
    resumed.sendJSON({ type: "resume", code: sa.code, token: sb.token });
    const session = await resumed.next((m) => m.type === "session");
    assert.equal(session.color, "b");
    const restored = await resumed.next((m) => m.type === "state");
    assert.equal(restored.players.w.name, "새 이름");
    assert.equal(restored.players.b.name, "나래");
    assert.equal(restored.queue[0].name, "가람");
  } finally {
    sockets.forEach((socket) => socket.terminate());
    await app.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});
