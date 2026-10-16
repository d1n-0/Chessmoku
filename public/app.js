import {
  newGame,
  applyAction,
  legalTargets,
  NAMES,
  TYPES,
  colorName,
  squareName,
  other,
} from "/shared/game.js";
const $ = (id) => document.getElementById(id);
const asset = (c, t) => `/assets/${c}${t.toUpperCase()}.svg`;
const hints = {
  p: "앞으로 1칸 · 상대는 대각선 앞에서 포획",
  n: "가로 2칸 + 세로 1칸 (또는 반대) · 뛰어넘기",
  b: "대각선으로 원하는 만큼 이동",
  r: "가로·세로 원하는 만큼 이동",
  q: "가로·세로·대각선으로 원하는 만큼 이동",
  k: "모든 방향으로 1칸 이동",
};
let game = newGame(),
  localGame = game,
  undoStack = [],
  selection = null,
  mode = "local",
  flipped = false,
  room = null,
  socket = null,
  connected = false,
  pending = false,
  reconnectTimer = null,
  lastResult = null;
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
function restoreLocal() {
  try {
    const saved = JSON.parse(storage.get("five-crown-local"));
    if (!saved) return;
    let g = newGame();
    for (const m of saved.history) {
      undoStack.push(g);
      g = applyAction(g, {
        kind: m.kind,
        type: m.type,
        from: m.from,
        to: m.to,
      });
    }
    if (saved.result?.reason === "resign") g.result = saved.result;
    localGame = game = g;
  } catch {
    undoStack = [];
    localGame = game = newGame();
  }
}
restoreLocal();
function saveLocal() {
  localGame = game;
  storage.set("five-crown-local", JSON.stringify(game));
}
function getSession() {
  try {
    return JSON.parse(sessionStorage.getItem("five-crown-room"));
  } catch {
    return null;
  }
}
function setSession(value) {
  try {
    value
      ? sessionStorage.setItem("five-crown-room", JSON.stringify(value))
      : sessionStorage.removeItem("five-crown-room");
  } catch {}
}
function toast(text) {
  $("toast").textContent = text;
  $("toast").hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($("toast").hidden = true), 3500);
}
function confirmAction(title, detail, fn) {
  $("confirm-title").textContent = title;
  $("confirm-detail").textContent = detail;
  $("confirm-dialog").showModal();
  $("confirm-ok").onclick = () => {
    $("confirm-dialog").close();
    fn();
  };
}
$("confirm-cancel").onclick = () => $("confirm-dialog").close();
for (const b of document.querySelectorAll(".close-dialog"))
  b.onclick = () => b.closest("dialog").close();
for (const d of document.querySelectorAll("dialog"))
  d.addEventListener("click", (e) => {
    if (e.target === d) {
      const r = d.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        d.close();
    }
  });
$("rules-open").onclick = () => $("rules-dialog").showModal();
$("credits-open").onclick = () => $("credits-dialog").showModal();
function canAct() {
  return (
    !game.result &&
    !pending &&
    (mode === "local" ||
      (room &&
        connected &&
        room.joined &&
        room.online[other(room.color)] &&
        game.turn === room.color))
  );
}
function reserveColor() {
  return mode === "online" && room ? room.color : game.turn;
}
function resultText() {
  return (
    {
      five: "다섯 개의 기물이 한 줄로 연결되었습니다.",
      king: "상대 킹을 포획했습니다.",
      resign: "상대가 기권했습니다.",
      stalemate: "더 이상 가능한 행동이 없어 무승부입니다.",
    }[game.result?.reason] || ""
  );
}
function render() {
  $("local-mode").classList.toggle("active", mode === "local");
  $("online-mode").classList.toggle("active", mode === "online");
  $("local-controls").hidden = mode !== "local";
  $("online-controls").hidden = mode !== "online";
  $("lobby").hidden = !!room;
  $("room-details").hidden = !room;
  if (room) {
    $("copy-code").textContent = room.code;
    $("connection").textContent = !connected
      ? "연결이 끊겼습니다. 재접속 중…"
      : !room.joined
        ? "친구의 입장을 기다리고 있어요."
        : !room.online[other(room.color)]
          ? "상대 재접속 대기 · 대국 일시 정지"
          : `연결됨 · 나는 ${colorName(room.color)}`;
  }
  $("create-room").disabled = pending;
  $("join-form").querySelector("button").disabled = pending;
  renderBoard();
  renderPlayers();
  renderReserves();
  renderHistory();
  $("turn-dot").classList.toggle("black", game.turn === "b");
  $("turn-number").textContent =
    `TURN ${String(game.ply + 1).padStart(2, "0")}`;
  let title = `${colorName(game.turn)}의 차례입니다`,
    detail = selection
      ? selection.type
        ? `${NAMES[selection.type]}을 놓을 빈 칸을 선택하세요.`
        : "표시된 칸으로 기물을 이동하세요."
      : "기물을 배치하거나, 보드 위 내 기물을 움직이세요.";
  if (mode === "online" && !room) {
    title = "친구와 새로운 대국을 시작하세요";
    detail = "방을 만들거나 초대받은 6자리 코드를 입력하세요.";
  } else if (
    mode === "online" &&
    (!connected || !room.joined || !room.online[other(room.color)])
  ) {
    title = "상대를 기다리고 있습니다";
    detail = connected
      ? "친구가 연결되면 대국을 진행할 수 있어요."
      : "서버에 다시 연결하고 있어요.";
  } else if (mode === "online" && game.turn !== room.color) {
    detail = "상대가 한 수를 고민하고 있어요.";
  }
  if (game.result) {
    title = game.result.winner
      ? `${colorName(game.result.winner)} 승리!`
      : "무승부";
    detail = resultText();
    if (room?.rematch?.length)
      detail = "재대국 요청 중 · 두 사람 모두 동의하면 시작합니다.";
  }
  $("status-title").textContent = title;
  $("status-detail").textContent = detail;
  $("reopen-result").hidden = !game.result;
  $("undo").disabled = mode !== "local" || !undoStack.length;
  $("resign").disabled =
    !!game.result || (mode === "online" && (!room?.joined || !connected));
  $("export-game").disabled = !game.history.length;
  if (game.result && game.result !== lastResult) {
    lastResult = game.result;
    $("result-title").textContent = title;
    $("result-detail").textContent = resultText();
    $("result-dialog").showModal();
  }
  if (!game.result) {
    lastResult = null;
    $("result-dialog").close();
  }
}
function renderBoard() {
  const targets = canAct() ? legalTargets(game, selection) : [];
  const board = $("board");
  board.replaceChildren();
  for (let display = 0; display < 64; display++) {
    const i = flipped ? 63 - display : display,
      p = game.board[i],
      b = document.createElement("button");
    b.type = "button";
    b.dataset.square = i;
    b.className =
      "square" +
      ((Math.floor(i / 8) + (i % 8)) % 2 ? " dark" : "") +
      (p ? " occupied" : "") +
      (targets.includes(i) ? " target" : "") +
      (selection?.from === i ? " selected" : "") +
      (game.last && (game.last.to === i || game.last.from === i)
        ? " last"
        : "") +
      (game.result?.line.includes(i) ? " winning" : "");
    b.setAttribute(
      "aria-label",
      `${squareName(i)} ${p ? colorName(p.color) + " " + NAMES[p.type] : "빈 칸"}`,
    );
    b.setAttribute("aria-pressed", String(selection?.from === i));
    if (p) {
      const img = document.createElement("img");
      img.src = asset(p.color, p.type);
      img.alt = "";
      img.draggable = false;
      b.append(img);
    }
    if (display % 8 === 0) {
      const span = document.createElement("span");
      span.className = "coord rank";
      span.textContent = 8 - Math.floor(i / 8);
      b.append(span);
    }
    if (display >= 56) {
      const span = document.createElement("span");
      span.className = "coord file";
      span.textContent = "abcdefgh"[i % 8];
      b.append(span);
    }
    board.append(b);
  }
}
function renderPlayers() {
  for (const [id, color] of [
    ["top-player", flipped ? "w" : "b"],
    ["bottom-player", flipped ? "b" : "w"],
  ]) {
    const isMe = room?.color === color;
    const label =
      mode === "local"
        ? "LOCAL PLAYER"
        : room
          ? isMe
            ? "YOU"
            : "FRIEND"
          : "FRIENDLY MATCH";
    const count = Object.values(game.reserves[color]).reduce(
      (a, b) => a + b,
      0,
    );
    $(id).innerHTML =
      `<div class="avatar"><img src="${asset(color, "k")}" alt=""></div><div class="player-name">${colorName(color)} 플레이어${mode === "online" && isMe ? " · 나" : ""}<span class="player-sub">${label} <span> · 보관함 ${count}개</span></span></div><span class="player-status ${game.turn === color && !game.result ? "active" : ""}">${game.result ? "대국 종료" : game.turn === color ? "생각 중" : "대기 중"}</span>`;
  }
}
function renderReserves() {
  const c = reserveColor();
  $("reserve-color").textContent = `${colorName(c)}의 기물`;
  $("reserves").replaceChildren();
  for (const type of TYPES) {
    const b = document.createElement("button");
    b.className = "reserve" + (selection?.type === type ? " selected" : "");
    b.dataset.type = type;
    b.disabled = !canAct() || game.reserves[c][type] === 0;
    b.setAttribute(
      "aria-label",
      `${colorName(c)} ${NAMES[type]} 배치, ${game.reserves[c][type]}개`,
    );
    b.setAttribute("aria-pressed", String(selection?.type === type));
    b.innerHTML = `<span class="count">${game.reserves[c][type]}</span><img src="${asset(c, type)}" alt=""><span class="name">${NAMES[type]}</span>`;
    $("reserves").append(b);
  }
  const type = selection?.type || game.board[selection?.from]?.type;
  $("selection-info").textContent = type
    ? `${NAMES[type]} · ${hints[type]}`
    : "보드 위 기물을 선택하면 이동할 수 있어요.";
}
function renderHistory() {
  const el = $("history");
  el.replaceChildren();
  $("move-count").textContent = `${game.ply}수`;
  if (!game.history.length) {
    el.innerHTML =
      '<div class="empty-history"><span>♧</span>당신의 첫 수를 기다립니다.</div>';
    return;
  }
  for (let i = 0; i < game.history.length; i += 2) {
    const row = document.createElement("div");
    row.className = "history-row";
    const num = document.createElement("span");
    num.textContent = i / 2 + 1;
    row.append(num);
    for (const m of [game.history[i], game.history[i + 1]]) {
      const span = document.createElement("span");
      span.className = "move";
      if (m) {
        span.innerHTML = `<img src="${asset(m.color, m.type)}" alt="${NAMES[m.type]}"> ${m.kind === "place" ? "＋" : squareName(m.from) + (m.captured ? "×" : "→")}${squareName(m.to)}`;
        span.title =
          m.kind === "place"
            ? "배치"
            : m.captured
              ? `${NAMES[m.captured]} 포획`
              : "이동";
      }
      row.append(span);
    }
    el.append(row);
  }
  el.scrollTop = el.scrollHeight;
}
$("reserves").onclick = (e) => {
  const b = e.target.closest("[data-type]");
  if (!b || b.disabled) return;
  selection =
    selection?.type === b.dataset.type ? null : { type: b.dataset.type };
  render();
};
$("board").onclick = (e) => {
  const b = e.target.closest("[data-square]");
  if (!b || !canAct()) return;
  const to = Number(b.dataset.square),
    p = game.board[to];
  if (p?.color === game.turn) {
    selection = selection?.from === to ? null : { from: to };
    render();
    return;
  }
  if (!selection) {
    toast("보관함 또는 보드 위 내 기물을 먼저 선택하세요.");
    return;
  }
  if (!legalTargets(game, selection).includes(to)) {
    toast("이 칸에는 둘 수 없습니다. 표시된 칸을 선택하세요.");
    return;
  }
  const action = selection.type
    ? { kind: "place", type: selection.type, to }
    : { kind: "move", from: selection.from, to };
  if (mode === "local") {
    undoStack.push(game);
    game = applyAction(game, action);
    selection = null;
    saveLocal();
    render();
  } else {
    pending = true;
    send({ type: "action", action, version: room.version });
    selection = null;
    render();
  }
};
$("board").onkeydown = (e) => {
  const b = e.target.closest("[data-square]");
  if (!b) return;
  const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -8, ArrowDown: 8 }[
    e.key
  ];
  if (offset) {
    e.preventDefault();
    const index = [...$("board").children].indexOf(b),
      next = index + offset;
    if (next >= 0 && next < 64) $("board").children[next].focus();
  }
};
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    selection = null;
    render();
  }
});
$("flip-board").onclick = () => {
  flipped = !flipped;
  render();
};
$("undo").onclick = () => {
  if (mode !== "local" || !undoStack.length) return;
  game = undoStack.pop();
  selection = null;
  saveLocal();
  render();
};
function resetLocal() {
  undoStack = [];
  game = newGame();
  selection = null;
  saveLocal();
  render();
}
$("new-game").onclick = () => {
  if (game.ply && !game.result)
    confirmAction(
      "새 대국을 시작할까요?",
      "현재 오프라인 대국은 초기화됩니다.",
      resetLocal,
    );
  else resetLocal();
};
function switchMode(next) {
  if (mode === next) return;
  if (room) {
    toast("현재 방을 나간 뒤 모드를 바꿀 수 있습니다.");
    return;
  }
  mode = next;
  selection = null;
  game = next === "local" ? localGame : newGame();
  render();
}
$("local-mode").onclick = () => switchMode("local");
$("online-mode").onclick = () => switchMode("online");
function send(msg) {
  if (socket?.readyState !== WebSocket.OPEN) {
    pending = false;
    toast("서버 연결을 확인해 주세요.");
    return false;
  }
  socket.send(JSON.stringify(msg));
  return true;
}
function connect(initial) {
  if (socket?.readyState === WebSocket.OPEN) {
    if (initial) send(initial);
    return;
  }
  if (socket?.readyState === WebSocket.CONNECTING) return;
  clearTimeout(reconnectTimer);
  socket = new WebSocket(
    `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`,
  );
  socket.onopen = () => {
    connected = true;
    const session = getSession();
    if (session) send({ type: "resume", ...session });
    else if (initial) send(initial);
    render();
  };
  socket.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    pending = false;
    if (msg.type === "session") {
      setSession({ code: msg.code, token: msg.token });
    } else if (msg.type === "state") {
      const firstJoin = !room;
      const oldVersion = room?.version;
      const hadResult = !!game.result;
      room = msg;
      mode = "online";
      game = msg.game;
      if (hadResult && game.result) lastResult = game.result;
      if (oldVersion !== room.version) selection = null;
      if (firstJoin) flipped = room.color === "b";
      render();
    } else if (msg.type === "left") {
      setSession(null);
      room = null;
      mode = "local";
      game = localGame;
      selection = null;
      render();
    } else if (msg.type === "error") {
      toast(msg.message);
      if (!room) setSession(null);
      render();
    }
  };
  socket.onclose = (e) => {
    connected = false;
    pending = false;
    if (e.code === 4001) {
      setSession(null);
      room = null;
      mode = "local";
      game = localGame;
      toast("다른 창에서 연결되어 이 창의 온라인 대국을 종료했습니다.");
    } else if (getSession()) {
      reconnectTimer = setTimeout(() => connect(), 1500);
    }
    render();
  };
  socket.onerror = () => {
    toast("서버에 연결할 수 없습니다. 연결 상태를 확인하세요.");
  };
}
$("create-room").onclick = () => {
  pending = true;
  render();
  connect({ type: "create" });
};
$("join-form").onsubmit = (e) => {
  e.preventDefault();
  const code = $("room-input").value.trim().toUpperCase();
  if (!/^[A-Z2-9]{6}$/.test(code)) {
    toast("6자리 방 코드를 입력하세요.");
    return;
  }
  pending = true;
  render();
  connect({ type: "join", code });
};
$("leave-room").onclick = () => {
  confirmAction(
    "방을 나갈까요?",
    "진행 중인 대국에서 나가면 기권으로 처리됩니다.",
    () => {
      if (connected) send({ type: "leave" });
      else toast("재접속이 완료된 후 방을 나갈 수 있습니다.");
    },
  );
};
$("copy-code").onclick = async () => {
  try {
    await navigator.clipboard.writeText(room.code);
    toast("방 코드를 복사했습니다. 친구에게 공유하세요.");
  } catch {
    toast(`초대 코드: ${room.code}`);
  }
};
$("resign").onclick = () =>
  confirmAction(
    "대국을 기권할까요?",
    "상대 플레이어의 승리로 대국이 종료됩니다.",
    () => {
      if (mode === "local") {
        game = {
          ...game,
          result: { winner: other(game.turn), reason: "resign", line: [] },
        };
        saveLocal();
        render();
      } else send({ type: "resign" });
    },
  );
$("play-again").onclick = () => {
  if (mode === "local") resetLocal();
  else {
    send({ type: "rematch" });
    $("result-dialog").close();
    toast("재대국을 요청했습니다. 상대의 동의를 기다립니다.");
  }
};
$("reopen-result").onclick = () => $("result-dialog").showModal();
$("status-title").onclick = () => {
  if (game.result) $("result-dialog").showModal();
};
$("export-game").onclick = () => {
  const blob = new Blob(
    [
      JSON.stringify(
        { format: "five-crown-v1", exportedAt: new Date().toISOString(), game },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = `five-crown-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
render();
if (getSession()) {
  mode = "online";
  connect();
}
