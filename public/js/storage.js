// Keep the original storage keys so renaming the app preserves games and room sessions.
import { newGame } from "/shared/game.js";
import { replayLocalGame } from "/shared/game/replay.js";

const storage = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {}
  },
};
export function loadLocalGame() {
  try {
    const saved = JSON.parse(storage.get("five-crown-local"));
    if (!saved) return { game: newGame(), undoStack: [] };
    return replayLocalGame(saved);
  } catch {
    return { game: newGame(), undoStack: [] };
  }
}
export function saveLocalGame(game) {
  storage.set("five-crown-local", JSON.stringify(game));
}
export function getSession() {
  try {
    return JSON.parse(sessionStorage.getItem("five-crown-room"));
  } catch {
    return null;
  }
}
export function setSession(value) {
  try {
    value
      ? sessionStorage.setItem("five-crown-room", JSON.stringify(value))
      : sessionStorage.removeItem("five-crown-room");
  } catch {}
}
