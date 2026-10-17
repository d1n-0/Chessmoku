import {
  setupLocalClock,
  startLocalClock,
  expireLocalClock,
  localAction,
  undoLocalClock,
  stopLocalClock,
  localLobby,
} from "./local-clock.js";
import { downloadGame } from "./download.js";
import { newGame, legalTargets, other } from "/shared/game.js";
import {
  loadLocalGame,
  saveLocalGame,
  getSession,
  setSession,
} from "./storage.js";
import { createConnection } from "./connection.js";
import { $ } from "./ui/dom.js";
import { toast, confirmAction, bindDialogs } from "./ui/dialogs.js";
import { bindLayout } from "./ui/layout.js";
import { bindRoomControls } from "./ui/room.js";
import { createGameView } from "./ui/game-view.js";

export function startGame() {
  const { renderGameView, preserveResultDialog } = createGameView();
  let { game, undoStack } = loadLocalGame();
  let localGame = game,
    selection = null,
    mode = "local",
    flipped = false,
    room = null,
    connected = false,
    pending = false;
  bindDialogs();
  const { closePanel } = bindLayout();
  function saveLocal() {
    localGame = game;
    saveLocalGame(game);
  }
  function render() {
    renderGameView({
      game,
      mode,
      room,
      connected,
      pending,
      selection,
      flipped,
      undoStack,
      localLobby: mode === "local" ? localLobby(game) : null,
      canAct: canAct(),
    });
  }
  function canAct() {
    return (
      !game.result &&
      !pending &&
      ((mode === "local" && game.localTiming?.phase !== "waiting") ||
        (room?.color &&
          connected &&
          room.joined &&
          room.phase === "playing" &&
          !room.colorRequest &&
          !room.undoRequest &&
          room.online[other(room.color)] &&
          game.turn === room.color))
    );
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
      if (checkLocalTime()) return;
      const next = localAction(game, action);
      if (next.ply > game.ply) undoStack.push(game);
      game = next;
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
    if (mode === "online") {
      if (!room?.color || !connected) return;
      const request = room.undoRequest;
      send(
        request
          ? {
              type: "undo-response",
              id: request.id,
              accept: request.color !== room.color,
            }
          : { type: "undo-request", version: room.version },
      );
      return;
    }
    if (!undoStack.length) return;
    game = undoLocalClock(game, undoStack.pop());
    selection = null;
    saveLocal();
    render();
  };
  $("reject-undo").onclick = () => {
    if (room?.undoRequest)
      send({ type: "undo-response", id: room.undoRequest.id, accept: false });
  };
  function resetLocal() {
    closePanel();
    undoStack = [];
    const settings = game.localTiming?.settings;
    game = settings ? setupLocalClock(newGame(), settings) : newGame();
    selection = null;
    saveLocal();
    render();
  }
  $("local-settings").onclick = () => {
    if (mode !== "local" || game.ply || game.result) return;
    closePanel();
    game = setupLocalClock(game, game.localTiming?.settings);
    saveLocal();
    render();
  };
  function checkLocalTime() {
    if (mode !== "local") return false;
    const next = expireLocalClock(game);
    if (next === game) return false;
    game = next;
    selection = null;
    saveLocal();
    render();
    return true;
  }
  setInterval(checkLocalTime, 100);
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
  function send(message) {
    if (mode === "local" && ["settings", "ready"].includes(message.type)) {
      try {
        if (game.ply || game.result)
          throw new Error("새 대국에서 시간을 설정하세요.");
        game =
          message.type === "settings"
            ? setupLocalClock(game, message.settings)
            : startLocalClock(game);
        saveLocal();
        render();
        return true;
      } catch (error) {
        toast(error.message);
        return false;
      }
    }
    if (connection.send(message)) return true;
    pending = false;
    toast("서버 연결을 확인해 주세요.");
    return false;
  }
  const connection = createConnection({
    getSession,
    onOpen() {
      connected = true;
      render();
    },
    onMessage(msg) {
      pending = false;
      if (msg.type === "session") {
        setSession({ code: msg.code, token: msg.token });
      } else if (msg.type === "state") {
        const firstJoin = !room || room.color !== msg.color;
        const oldVersion = room?.version;
        const previousPhase = room?.phase;
        const hadResult = !!game.result;
        room = msg;
        mode = "online";
        game = msg.game;
        if (hadResult && game.result) preserveResultDialog(game.result);
        if (oldVersion !== room.version) selection = null;
        if (firstJoin) {
          $("player-name").value = room.color
            ? room.players[room.color].name
            : room.queue[room.queuePosition - 1].name;
          flipped = room.color === "b";
          closePanel();
        }
        if (room.phase === "playing" && previousPhase !== "playing")
          closePanel();
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
    },
    onClose(code) {
      connected = false;
      pending = false;
      if (code === 4001) {
        setSession(null);
        room = null;
        mode = "local";
        game = localGame;
        toast("다른 창에서 연결되어 이 창의 온라인 대국을 종료했습니다.");
      }
      render();
    },
    onError() {
      toast("서버에 연결할 수 없습니다. 연결 상태를 확인하세요.");
    },
  });
  const { connect } = connection;
  $("create-room").onclick = () => {
    pending = true;
    render();
    connect({ type: "create", name: $("player-name").value });
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
    connect({ type: "join", code, name: $("player-name").value });
  };
  bindRoomControls({ send, getRoom: () => room });
  $("leave-room").onclick = () => {
    confirmAction(
      "방을 나갈까요?",
      room?.color
        ? "진행 중인 대국에서 나가면 기권으로 처리됩니다."
        : "대기열에서 나갑니다.",
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
          if (checkLocalTime()) return;
          game = {
            ...stopLocalClock(game),
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
  $("export-game").onclick = () => downloadGame(game);
  render();
  if (getSession()) {
    mode = "online";
    connect();
  }
}
