import { initializeRoom } from "./lifecycle.js";
import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";

// Socket handles exist only in memory; snapshots contain game and session data.
export function createRoomRepository(dataDir) {
  mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, "rooms.json"),
    rooms = new Map();
  try {
    for (const room of JSON.parse(readFileSync(file, "utf8")))
      rooms.set(room.code, {
        ...room,
        names: room.names || {},
        colorRequest: null,
        undoRequest: null,
        sockets: { w: null, b: null },
        queue: (room.queue || []).map(({ token }) => ({ token, socket: null })),
      });
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  for (const room of rooms.values()) {
    initializeRoom(room);
    if (room.phase === "waiting") room.ready = [];
  }
  const persist = () => {
    writeFileSync(
      file + ".tmp",
      JSON.stringify(
        [...rooms.values()].map(({ sockets, queue, ...room }) => ({
          ...room,
          queue: queue.map(({ token }) => ({ token })),
        })),
      ),
      { mode: 0o600 },
    );
    renameSync(file + ".tmp", file);
  };
  return { rooms, persist };
}
