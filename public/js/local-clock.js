import { applyAction, other, newGame, validateRules } from "/shared/game.js";

export const defaultTimeSettings = () => ({
  turnSeconds: 0,
  totalSeconds: 0,
  incrementSeconds: 0,
});
export function validateTimeSettings(settings) {
  for (const [key, max] of [
    ["turnSeconds", 3600],
    ["totalSeconds", 86400],
    ["incrementSeconds", 600],
  ]) {
    if (
      !Number.isInteger(settings?.[key]) ||
      settings[key] < 0 ||
      settings[key] > max
    )
      throw new Error("시간 설정 범위를 확인하세요.");
  }
  if (!settings.totalSeconds && settings.incrementSeconds)
    throw new Error("추가 시간은 총 시간을 설정해야 사용할 수 있습니다.");
  return {
    ...settings,
    ...(settings.rules === undefined
      ? {}
      : { rules: validateRules(settings.rules) }),
  };
}
export function setupLocalClock(game, settings = defaultTimeSettings()) {
  return {
    ...(settings.rules === undefined
      ? game
      : newGame({ rules: validateRules(settings.rules) })),
    localTiming: {
      settings: validateTimeSettings(settings),
      phase: "waiting",
      clock: { remaining: { w: null, b: null }, turnStarted: null },
    },
  };
}
export function startLocalClock(game, now = Date.now()) {
  const timing = structuredClone(game.localTiming);
  const total = timing.settings.totalSeconds * 1000 || null;
  timing.clock = { remaining: { w: total, b: total }, turnStarted: now };
  timing.phase = "playing";
  return { ...game, localTiming: timing };
}
function charge(timing, color, now) {
  if (
    timing.clock.remaining[color] !== null &&
    timing.clock.turnStarted !== null
  )
    timing.clock.remaining[color] = Math.max(
      0,
      timing.clock.remaining[color] -
        Math.max(0, now - timing.clock.turnStarted),
    );
}
export function expireLocalClock(game, now = Date.now()) {
  const t = game.localTiming;
  if (!t || t.phase !== "playing" || game.result) return game;
  const elapsed = Math.max(0, now - t.clock.turnStarted);
  const left = t.clock.remaining[game.turn];
  if (
    (left === null || elapsed < left) &&
    (!t.settings.turnSeconds || elapsed < t.settings.turnSeconds * 1000)
  )
    return game;
  const timing = structuredClone(t);
  charge(timing, game.turn, now);
  timing.phase = "finished";
  timing.clock.turnStarted = null;
  return {
    ...game,
    localTiming: timing,
    result: { winner: other(game.turn), reason: "timeout", line: [] },
  };
}
export function localAction(game, action, now = Date.now()) {
  const expired = expireLocalClock(game, now);
  if (expired !== game) return expired;
  if (game.localTiming?.phase === "waiting")
    throw new Error("시간 설정 후 대국을 시작하세요.");
  const next = applyAction(game, action);
  if (next.localTiming) {
    const t = next.localTiming;
    charge(t, game.turn, now);
    if (action.kind === "swap")
      [t.clock.remaining.w, t.clock.remaining.b] = [
        t.clock.remaining.b,
        t.clock.remaining.w,
      ];
    if (action.kind !== "swap" && t.clock.remaining[game.turn] !== null)
      t.clock.remaining[game.turn] += t.settings.incrementSeconds * 1000;
    t.clock.turnStarted = now;
    if (next.result) {
      t.phase = "finished";
      t.clock.turnStarted = null;
    }
  }
  return next;
}
export function undoLocalClock(current, previous, now = Date.now()) {
  if (!current.localTiming) return previous;
  const timing = structuredClone(current.localTiming);
  charge(timing, current.turn, now);
  const move = current.history.at(-1);
  const mover = move.color;
  if (move.kind === "swap")
    [timing.clock.remaining.w, timing.clock.remaining.b] = [
      timing.clock.remaining.b,
      timing.clock.remaining.w,
    ];
  if (move.kind !== "swap" && timing.clock.remaining[mover] !== null)
    timing.clock.remaining[mover] = Math.max(
      0,
      timing.clock.remaining[mover] - timing.settings.incrementSeconds * 1000,
    );
  timing.phase = "playing";
  timing.clock.turnStarted = now;
  return expireLocalClock({ ...previous, localTiming: timing }, now);
}
export function stopLocalClock(game, now = Date.now()) {
  if (!game.localTiming) return game;
  const timing = structuredClone(game.localTiming);
  charge(timing, game.turn, now);
  timing.phase = "finished";
  timing.clock.turnStarted = null;
  return { ...game, localTiming: timing };
}
export function localLobby(game) {
  const t = game.localTiming;
  if (!t) return null;
  return {
    ...t,
    game,
    serverNow: Date.now(),
    code: "local",
    isLocal: true,
    isHost: true,
    color: "w",
    ready: [],
    players: { w: {}, b: {} },
    queue: [],
  };
}
