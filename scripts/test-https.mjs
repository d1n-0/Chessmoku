import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { test } from "node:test";
import { WebSocket } from "ws";

const base = new URL(process.env.HTTPS_URL || "https://localhost");
assert.equal(base.protocol, "https:", "HTTPS_URL must use https://");
const ca = process.env.HTTPS_CA_FILE
  ? readFileSync(process.env.HTTPS_CA_FILE)
  : undefined;

function request(url) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const req = transport.get(url, { ca }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => (body += chunk));
      response.on("end", () =>
        resolve({
          status: response.statusCode,
          headers: response.headers,
          body,
        }),
      );
      response.on("error", reject);
    });
    req.setTimeout(10000, () =>
      req.destroy(new Error("HTTP request timed out")),
    );
    req.on("error", reject);
  });
}

function client(origin = base.origin) {
  const url = new URL(base);
  url.protocol = "wss:";
  const socket = new WebSocket(url, { ca, origin, handshakeTimeout: 10000 });
  const messages = [];
  const waiters = [];
  socket.on("message", (data) => {
    const message = JSON.parse(data.toString());
    const index = waiters.findIndex((waiter) => waiter.match(message));
    if (index === -1) messages.push(message);
    else {
      const waiter = waiters.splice(index, 1)[0];
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    }
  });
  socket.next = (match) => {
    const index = messages.findIndex(match);
    if (index !== -1) return Promise.resolve(messages.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { match, resolve };
      waiter.timer = setTimeout(() => {
        waiters.splice(waiters.indexOf(waiter), 1);
        reject(new Error("WSS message timed out"));
      }, 10000);
      waiters.push(waiter);
    });
  };
  socket.sendJSON = (message) => socket.send(JSON.stringify(message));
  socket.opened = new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  return socket;
}

test(
  "trusted HTTPS, redirect and two-player WSS through the deployed proxy",
  { timeout: 45000 },
  async () => {
    const health = await request(new URL("/health", base));
    assert.equal(health.status, 200);
    assert.deepEqual(JSON.parse(health.body), { ok: true });
    const rules = await request(new URL("/rules", base));
    assert.equal(rules.status, 200);
    assert.match(rules.body, /Chessmoku/);
    const plain = new URL("/rules", base);
    plain.protocol = "http:";
    plain.port = process.env.HTTP_PORT || "80";
    const redirect = await request(plain);
    assert.equal(redirect.status, 308);
    assert.equal(
      new URL(redirect.headers.location).href,
      new URL("/rules", base).href,
    );

    const white = client();
    const black = client();
    try {
      await Promise.all([white.opened, black.opened]);
      white.sendJSON({ type: "create" });
      const session = await white.next((message) => message.type === "session");
      black.sendJSON({ type: "join", code: session.code });
      await black.next((message) => message.type === "state" && message.joined);
      await white.next((message) => message.type === "state" && message.joined);
      white.sendJSON({
        type: "action",
        version: 0,
        action: { kind: "place", type: "p", to: 48 },
      });
      const state = await black.next(
        (message) => message.type === "state" && message.version === 1,
      );
      assert.equal(state.game.board[48].type, "p");
      assert.equal(state.game.board[48].color, "w");
      white.sendJSON({ type: "leave" });
      await white.next((message) => message.type === "left");
      black.sendJSON({ type: "leave" });
      await black.next((message) => message.type === "left");
    } finally {
      white.terminate();
      black.terminate();
    }

    const foreign = client("https://untrusted.example");
    const closed = new Promise((resolve) => foreign.once("close", resolve));
    try {
      await foreign.opened;
      assert.equal(await closed, 1008);
    } finally {
      foreign.terminate();
    }
  },
);
