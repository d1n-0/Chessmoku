import { createServer } from "node:http";
import { createHttpApp } from "./http.js";
import { createRoomRepository } from "./rooms/repository.js";
import { attachWebSocketServer } from "./websocket.js";

export function createApp({ dataDir = process.env.DATA_DIR || "./data" } = {}) {
  const repository = createRoomRepository(dataDir);
  const server = createServer(createHttpApp());
  const wss = attachWebSocketServer(server, repository);
  return { server, wss, rooms: repository.rooms };
}
