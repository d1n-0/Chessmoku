/** Offline balance laboratory. Does not change the live game. */
import { newGame, canMove, applyAction, TYPES, other } from "../shared/game.js";
import {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

export const VARIANTS = {
  blackPawnE6: { label: "흑 폰 e6 선배치", k: 5, extra: "b", pawnSquare: 20 },
  blackPawnD7: { label: "흑 폰 d7 선배치", k: 5, extra: "b", pawnSquare: 11 },
  whitePawnRank2: {
    label: "백 첫 수 2행 폰 배치",
    k: 5,
    opening: "white-pawn-rank2",
  },
  blackFirstControl: { label: "대조군: 킹 선배치 · 흑 선공", k: 5, first: "b" },
  whiteKingFirst5: { label: "백 첫 수 킹 이동만", k: 5, opening: "white-king" },
  blackCenterPawn5: {
    label: "흑 폰 e5 선배치",
    k: 5,
    extra: "b",
    pawnSquare: 28,
  },
  blackTwoPawns5: {
    label: "흑 폰 d7·f7 선배치",
    k: 5,
    extra: "b",
    pawnSquares: [11, 13],
  },
  kings5: { label: "킹 선배치 · 자유 첫 수", k: 5 },
  whitePawnHome5: {
    label: "백 첫 수 자기 진영 폰",
    k: 5,
    opening: "white-pawn-home",
  },
  whiteHome5: { label: "백 첫 수 자기 진영 기물", k: 5, opening: "white-home" },
  blackPawn5: { label: "흑 폰 e7 선배치", k: 5, extra: "b" },
  fixedWhite5: { label: "백 폰 e2 고정 후 흑 차례", k: 5, extra: "w" },
  bothHome5: { label: "양쪽 첫 수 자기 진영 배치", k: 5, opening: "both-home" },
  homeDrops5: { label: "모든 배치는 자기 진영", k: 5, opening: "all-home" },
  kings4: { label: "킹 선배치 · 4목", k: 4 },
  whitePawnHome4: {
    label: "백 첫 수 자기 진영 폰 · 4목",
    k: 4,
    opening: "white-pawn-home",
  },
};
export const PROFILES = {
  line: { line: 1.6, material: 2, activity: 0.7, noise: 5 },
  balanced: { line: 1, material: 5, activity: 1, noise: 5 },
  material: { line: 0.55, material: 11, activity: 1.2, noise: 5 },
};
const value = { p: 1, n: 3, b: 3, r: 4, q: 7, k: 0 };
const WIN = 1000000;
const lines = {},
  linesAt = {};
for (const k of [4, 5]) {
  lines[k] = [];
  linesAt[k] = Array.from({ length: 64 }, () => []);
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++)
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
        [1, 1],
        [1, -1],
      ]) {
        if (
          x + (k - 1) * dx > 7 ||
          y + (k - 1) * dy > 7 ||
          y + (k - 1) * dy < 0
        )
          continue;
        const l = Array.from(
          { length: k },
          (_, n) => (y + n * dy) * 8 + x + n * dx,
        );
        lines[k].push(l);
        for (const i of l) linesAt[k][i].push(l);
      }
}
export function setup(variant, mirror = false) {
  const v = VARIANTS[variant],
    g = newGame(),
    wk = mirror ? 59 : 60,
    bk = mirror ? 3 : 4;
  g.board[wk] = { type: "k", color: "w", moved: false };
  g.board[bk] = { type: "k", color: "b", moved: false };
  g.reserves.w.k = g.reserves.b.k = 0;
  if (v.extra) {
    const color = v.extra;
    const squares = v.pawnSquares || [
      v.pawnSquare ?? (color === "w" ? 52 : 12),
    ];
    for (const original of squares) {
      const sq = mirror ? original ^ 7 : original;
      g.board[sq] = { type: "p", color, moved: false };
      g.reserves[color].p--;
    }
    if (color === "w") {
      g.turn = "b";
      g.ply = 1;
    }
  }
  if (v.first) g.turn = v.first;
  return g;
}
export function allowed(g, a, v) {
  const c = g.turn,
    home = c === "w" ? a.to >= 32 : a.to < 32;
  if (v.opening === "all-home" && a.kind === "place") return home;
  if (v.opening === "both-home" && g.ply < 2) return a.kind === "place" && home;
  if (g.ply === 0 && c === "w") {
    if (v.opening === "white-pawn-rank2")
      return a.kind === "place" && a.type === "p" && a.to >= 48 && a.to < 56;
    if (v.opening === "white-king")
      return a.kind === "move" && g.board[a.from]?.type === "k";
    if (v.opening === "white-pawn-home")
      return a.kind === "place" && a.type === "p" && home;
    if (v.opening === "white-home") return a.kind === "place" && home;
  }
  return true;
}
export function actions(g, v) {
  const out = [];
  for (let to = 0; to < 64; to++)
    if (!g.board[to])
      for (const type of TYPES)
        if (g.reserves[g.turn][type] > 0) {
          const a = { kind: "place", type, to };
          if (allowed(g, a, v)) out.push(a);
        }
  for (let from = 0; from < 64; from++)
    if (g.board[from]?.color === g.turn)
      for (let to = 0; to < 64; to++)
        if (canMove(g, from, to)) {
          const a = { kind: "move", from, to };
          if (allowed(g, a, v)) out.push(a);
        }
  // Canonicalize from the mover's side before applying randomized tie-breaking.
  // Rank reflection + color swap must not change the search ordering.
  const canonical = (i) => (g.turn === "w" ? i : i ^ 56);
  const order = (a) =>
    (a.kind === "place"
      ? TYPES.indexOf(a.type) * 64
      : 1000 + canonical(a.from) * 64) + canonical(a.to);
  return out.sort((a, b) => order(a) - order(b));
}
export function lineWin(board, c, k, to = null) {
  return (to === null ? lines[k] : linesAt[k][to]).some((l) =>
    l.every((i) => board[i]?.color === c),
  );
}
export function step(g, a, v) {
  const c = g.turn,
    board = g.board.slice(),
    reserves = { w: { ...g.reserves.w }, b: { ...g.reserves.b } };
  const captured = a.kind === "move" ? board[a.to] : null;
  if (a.kind === "place") {
    board[a.to] = { type: a.type, color: c, moved: false };
    reserves[c][a.type]--;
  } else {
    board[a.to] = { ...board[a.from], moved: true };
    board[a.from] = null;
    if (captured) reserves[c][captured.type]++;
  }
  const reason =
    captured?.type === "k"
      ? "king"
      : lineWin(board, c, v.k, a.to)
        ? "line"
        : null;
  return {
    board,
    reserves,
    turn: other(c),
    ply: g.ply + 1,
    result: reason ? { winner: c, reason } : null,
  };
}
// Exhaustive immediate win detection: includes a capture completing a line,
// movement that would break its own line, and the opening placement restrictions.
export function immediate(g, v) {
  const c = g.turn;
  const king = g.board.findIndex(
    (p) => p?.color === other(c) && p.type === "k",
  );
  if (king >= 0)
    for (let from = 0; from < 64; from++)
      if (g.board[from]?.color === c && canMove(g, from, king)) {
        const a = { kind: "move", from, to: king };
        if (allowed(g, a, v)) return a;
      }
  const targets = new Set();
  for (const l of lines[v.k]) {
    let own = 0,
      to = -1;
    for (const i of l) {
      if (g.board[i]?.color === c) own++;
      else to = i;
    }
    if (own === v.k - 1) targets.add(to);
  }
  for (const to of targets) {
    if (!g.board[to])
      for (const type of TYPES)
        if (g.reserves[c][type] > 0) {
          const a = { kind: "place", type, to };
          if (allowed(g, a, v)) return a;
        }
    for (let from = 0; from < 64; from++)
      if (g.board[from]?.color === c && canMove(g, from, to)) {
        const a = { kind: "move", from, to };
        if (!allowed(g, a, v)) continue;
        const b = g.board.slice();
        b[to] = b[from];
        b[from] = null;
        if (lineWin(b, c, v.k, to)) return a;
      }
  }
  return null;
}
function evaluate(g, pov, v, profile) {
  if (g.result) return g.result.winner === pov ? WIN : -WIN;
  const w = v.k === 5 ? [0, 1, 8, 50, 350, WIN] : [0, 1, 12, 250, WIN];
  let line = 0,
    material = 0,
    activity = 0;
  for (const l of lines[v.k]) {
    let a = 0,
      b = 0;
    for (const i of l) {
      const p = g.board[i];
      if (p) p.color === pov ? a++ : b++;
    }
    if (!b) line += w[a];
    if (!a) line -= w[b];
  }
  for (let i = 0; i < 64; i++) {
    const p = g.board[i];
    if (!p) continue;
    const s = p.color === pov ? 1 : -1;
    material += s * value[p.type];
    activity +=
      s *
      (7 - Math.abs(3.5 - (i % 8)) - Math.abs(3.5 - Math.floor(i / 8))) *
      0.15;
  }
  for (const c of ["w", "b"])
    for (const t of TYPES)
      material += (c === pov ? 1 : -1) * g.reserves[c][t] * value[t] * 0.8;
  return (
    line * profile.line +
    material * profile.material +
    activity * profile.activity
  );
}
export function positionKey(g) {
  return (
    g.turn +
    "|" +
    g.board
      .map((p) =>
        p ? p.color + p.type + (p.type === "p" && p.moved ? "1" : "0") : "_",
      )
      .join("") +
    "|" +
    ["w", "b"]
      .map((c) => TYPES.map((t) => g.reserves[c][t]).join(","))
      .join("|")
  );
}
export function random(seed) {
  return () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
}
function rank(g, v, profile, rng) {
  return actions(g, v)
    .map((a) => {
      const next = step(g, a, v);
      return {
        a,
        next,
        score:
          evaluate(next, g.turn, v, profile) + (rng() - 0.5) * profile.noise,
      };
    })
    .sort((a, b) => b.score - a.score);
}
export function choose(g, v, profile, rng, depth, visits, width) {
  const win = immediate(g, v);
  if (win) return win;
  const ranked = rank(g, v, profile, rng);
  if (!ranked.length) return null;
  const safe = [];
  for (const r of ranked) {
    if (immediate(r.next, v)) continue;
    const repeated = (visits.get(positionKey(r.next)) || 0) >= 2;
    if (repeated) r.score = 0;
    safe.push({ ...r, repeated });
    if (safe.length >= (depth === 1 ? 1 : width)) break;
  }
  if (!safe.length) return ranked[0].a;
  if (depth === 1) return safe[0].a;
  if (depth >= 3) {
    let best = null;
    for (const r of safe) {
      const score = r.repeated
        ? 0
        : -tree(r.next, v, profile, rng, depth - 1, visits, width);
      const combined = score + r.score * 0.001;
      if (!best || combined > best.score) best = { a: r.a, score: combined };
    }
    return best.a;
  }
  let best = null;
  for (const r of safe) {
    let worst = WIN / 2;
    if (r.repeated) worst = 0;
    else {
      // Full reply enumeration and tactical check at the resulting frontier.
      // This is a beam over our candidates, NOT full minimax over the tree.
      const replies = rank(r.next, v, profile, rng);
      if (!replies.length) worst = 0;
      else
        for (const reply of replies) {
          if (reply.next.result) {
            worst = -WIN;
            break;
          }
          if (immediate(reply.next, v)) continue;
          worst = -reply.score;
          if ((visits.get(positionKey(reply.next)) || 0) >= 2) worst = 0;
          break;
        }
    }
    const score = worst + r.score * 0.01;
    if (!best || score > best.score) best = { a: r.a, score };
  }
  return best.a;
}
// Negamax with a candidate beam at internal nodes. Full immediate-win and
// immediate-loss checks remain exhaustive; pruning can still miss quiet tactics.
function tree(g, v, profile, rng, depth, visits, width) {
  if (immediate(g, v)) return WIN + depth;
  const ranked = rank(g, v, profile, rng);
  if (!ranked.length) return 0;
  let best = -WIN - depth,
    found = 0;
  for (const r of ranked) {
    if (immediate(r.next, v)) continue;
    const repeated = (visits.get(positionKey(r.next)) || 0) >= 2;
    let score;
    if (repeated) score = 0;
    else if (depth <= 1) score = r.score;
    else score = -tree(r.next, v, profile, rng, depth - 1, visits, width);
    best = Math.max(best, score);
    if (++found >= (depth <= 1 ? 1 : width)) break;
  }
  return best;
}
export function play(job) {
  const {
    variant,
    white,
    black,
    seed,
    depth = 1,
    mirror = false,
    maxPly = 120,
    width = 6,
  } = job;
  const v = VARIANTS[variant];
  let g = setup(variant, mirror);
  const profileSeed = (name) =>
    seed * 7919 + Object.keys(PROFILES).indexOf(name) * 104729 + 11;
  const rng = { w: random(profileSeed(white)), b: random(profileSeed(black)) };
  const profiles = { w: PROFILES[white], b: PROFILES[black] };
  const visits = new Map([[positionKey(g), 1]]);
  let captures = 0,
    placements = 0;
  const moves = [];
  const started = Date.now();
  for (let turn = 0; turn < maxPly; turn++) {
    const a = choose(g, v, profiles[g.turn], rng[g.turn], depth, visits, width);
    if (!a)
      return {
        ...job,
        winner: null,
        reason: "no-action",
        plies: turn,
        captures,
        placements,
        moves,
        ms: Date.now() - started,
      };
    if (a.kind === "place") placements++;
    else if (g.board[a.to]) captures++;
    assert(allowed(g, a, v));
    // Every played transition is checked against the real production engine.
    const actual = applyAction({ ...g, history: [], last: null }, a);
    const n = step(g, a, v);
    assert.deepEqual(n.board, actual.board);
    assert.deepEqual(n.reserves, actual.reserves);
    assert.equal(n.turn, actual.turn);
    if (v.k === 5)
      assert.equal(
        n.result?.reason ?? null,
        actual.result?.reason === "five"
          ? "line"
          : (actual.result?.reason ?? null),
      );
    moves.push(a.kind === "place" ? `${a.type}@${a.to}` : `${a.from}>${a.to}`);
    g = n;
    if (g.result)
      return {
        ...job,
        ...g.result,
        plies: turn + 1,
        captures,
        placements,
        moves,
        ms: Date.now() - started,
      };
    const key = positionKey(g),
      count = (visits.get(key) || 0) + 1;
    visits.set(key, count);
    if (count === 3)
      return {
        ...job,
        winner: null,
        reason: "repetition",
        plies: turn + 1,
        captures,
        placements,
        moves,
        ms: Date.now() - started,
      };
  }
  return {
    ...job,
    winner: null,
    reason: "limit",
    plies: maxPly,
    captures,
    placements,
    moves,
    ms: Date.now() - started,
  };
}
export function summarize(results) {
  const stats = {};
  for (const r of results) {
    const key = r.variant;
    stats[key] ??= {
      label: VARIANTS[key].label,
      n: 0,
      w: 0,
      b: 0,
      king: 0,
      line: 0,
      repetition: 0,
      limit: 0,
      "no-action": 0,
      plies: [],
      finishedPlies: [],
      byMatch: {},
    };
    const s = stats[key];
    s.n++;
    if (r.winner) s[r.winner]++;
    s[r.reason]++;
    s.plies.push(r.plies);
    if (r.winner) s.finishedPlies.push(r.plies);
    const match = `${r.white}/${r.black}`;
    s.byMatch[match] ??= { n: 0, w: 0, b: 0, unfinished: 0 };
    const m = s.byMatch[match];
    m.n++;
    r.winner ? m[r.winner]++ : m.unfinished++;
  }
  const median = (a) => {
    if (!a.length) return null;
    const sorted = [...a].sort((a, b) => a - b),
      mid = Math.floor(a.length / 2);
    return a.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };
  for (const s of Object.values(stats)) {
    s.decisiveWhiteRate = s.w + s.b ? s.w / (s.w + s.b) : null;
    s.finishRate = (s.w + s.b) / s.n;
    s.medianPlies = median(s.plies);
    s.medianFinishedPlies = median(s.finishedPlies);
    delete s.plies;
    delete s.finishedPlies;
  }
  return stats;
}
async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((x) => x.replace(/^--/, "").split("=")),
  );
  const variants = (args.variants || Object.keys(VARIANTS).join(",")).split(
    ",",
  );
  for (const v of variants) assert(VARIANTS[v], `Unknown variant ${v}`);
  const seeds = Number(args.seeds || 4),
    depth = Number(args.depth || 1),
    workers = Number(args.workers || 8),
    out = args.out || "analysis/balance/screening";
  const jobs = [];
  let id = 0;
  for (const variant of variants)
    for (const white of Object.keys(PROFILES))
      for (const black of Object.keys(PROFILES))
        for (let i = 0; i < seeds; i++)
          jobs.push({
            id: id++,
            variant,
            white,
            black,
            seed: i + Number(args.seedStart || 1),
            mirror: i % 2 === 1,
            depth,
            width: Number(args.width || 6),
            maxPly: Number(args.maxPly || 120),
          });
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out + ".jsonl", "");
  const metadata = {
    engineVersion: 2,
    created: new Date().toISOString(),
    variants: Object.fromEntries(variants.map((v) => [v, VARIANTS[v]])),
    profiles: PROFILES,
    seeds,
    seedStart: Number(args.seedStart || 1),
    depth,
    workers,
    jobs: jobs.length,
    width: Number(args.width || 6),
    maxPly: Number(args.maxPly || 120),
    note: "No live rules modified. Repetition/limit are laboratory stops, not production draws. Full played-transition validation against production engine. Own-candidate beam and static frontier limit strength.",
  };
  writeFileSync(out + ".meta.json", JSON.stringify(metadata, null, 2) + "\n");
  const results = [];
  let index = 0,
    done = 0;
  const started = Date.now();
  await Promise.all(
    Array.from(
      { length: Math.min(workers, jobs.length) },
      () =>
        new Promise((resolve, reject) => {
          const worker = new Worker(new URL(import.meta.url), {
            workerData: { balanceWorker: true },
          });
          const send = () => {
            if (index < jobs.length) worker.postMessage(jobs[index++]);
            else {
              worker.terminate().then(resolve);
            }
          };
          worker.on("message", (r) => {
            results.push(r);
            appendFileSync(out + ".jsonl", JSON.stringify(r) + "\n");
            done++;
            if (done % 12 === 0 || done === jobs.length)
              console.log(
                `${done}/${jobs.length} games · ${Math.round((Date.now() - started) / 1000)}s`,
              );
            send();
          });
          worker.on("error", reject);
          send();
        }),
    ),
  );
  const summary = summarize(results);
  writeFileSync(out + ".summary.json", JSON.stringify(summary, null, 2) + "\n");
  console.log(JSON.stringify(summary, null, 2));
}
if (!isMainThread && workerData?.balanceWorker)
  parentPort.on("message", (job) => parentPort.postMessage(play(job)));
else if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
