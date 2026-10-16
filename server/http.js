import express from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";

export function createHttpApp() {
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
  app.get("/", (_, res) =>
    res.sendFile(path.join(root, "server/pages/index.html")),
  );
  app.get("/rules", (_, res) =>
    res.sendFile(path.join(root, "server/pages/rules.html")),
  );
  app.get("/rules.html", (_, res) => res.redirect(308, "/rules"));
  app.get("/index.html", (_, res) => res.redirect(308, "/"));
  app.use(express.static(path.join(root, "public"), { index: false }));
  return app;
}
