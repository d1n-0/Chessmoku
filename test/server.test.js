import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { WebSocket } from "ws";
import { createApp } from "../server/index.js";
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
    await a.next((m) => m.type === "state");
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
    assert.match((await c.next((m) => m.type === "error")).message, /두 명/);
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
      action: { kind: "place", type: "k", to: 7 },
    });
    assert.match((await b.next((m) => m.type === "error")).message, /바뀌/);
    b.sendJSON({
      type: "action",
      version: 1,
      action: { kind: "place", type: "k", to: 7 },
    });
    await a.next((m) => m.type === "state" && m.version === 2);
    await b.next((m) => m.type === "state" && m.version === 2);
    a.sendJSON({
      type: "action",
      version: 2,
      action: { kind: "move", from: 0, to: 7 },
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
