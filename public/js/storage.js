// Keep the original storage keys so renaming the app preserves games and room sessions.
import { validateTimeSettings, expireLocalClock } from "./local-clock.js";
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
    const restored = replayLocalGame(saved);
    if (saved.localTiming) {
      const t = saved.localTiming;
      validateTimeSettings(t.settings);
      if (
        !["waiting", "playing", "finished"].includes(t.phase) ||
        !["w", "b"].every(
          (c) =>
            t.clock.remaining[c] === null ||
            (Number.isFinite(t.clock.remaining[c]) &&
              t.clock.remaining[c] >= 0),
        ) ||
        (t.phase === "playing" && !Number.isFinite(t.clock.turnStarted))
      )
        throw new Error("Invalid clock");
      restored.game.localTiming = t;
      if (saved.result?.reason === "timeout")
        restored.game.result = saved.result;
      restored.game = expireLocalClock(restored.game);
    }
    return restored;
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
