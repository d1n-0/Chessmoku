import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";

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
