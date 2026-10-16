import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHttpApp } from "../server/http.js";

test("page routes, legacy redirects and module assets work without exposing server files", async () => {
  const server = createServer(createHttpApp());
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const route of ["/", "/rules"]) {
      const response = await fetch(origin + route);
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type"), /text\/html/);
      assert.match(
        response.headers.get("content-security-policy"),
        /script-src 'self'/,
      );
      assert.match(await response.text(), /href="\/rules"/);
    }
    for (const [oldPath, destination] of [
      ["/rules.html", "/rules"],
      ["/index.html", "/"],
    ]) {
      const response = await fetch(origin + oldPath, { redirect: "manual" });
      assert.equal(response.status, 308);
      assert.equal(response.headers.get("location"), destination);
    }
    for (const route of [
      "/js/main.js",
      "/js/ui/board.js",
      "/shared/game.js",
      "/shared/game/movement.js",
      "/styles/base.css",
      "/styles/rules.css",
    ]) {
      assert.equal((await fetch(origin + route)).status, 200, route);
    }
    for (const route of [
      "/server/rooms/repository.js",
      "/server/pages/rules.html",
      "/data/rooms.json",
      "/missing",
    ]) {
      assert.equal((await fetch(origin + route)).status, 404, route);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
