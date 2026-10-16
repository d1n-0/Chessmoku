import { colorName, other } from "/shared/game.js";
import { $ } from "./dom.js";
import { renderBoard } from "./board.js";
import { renderReserves } from "./reserves.js";
import { renderHistory } from "./history.js";
import { renderRoom } from "./room.js";

export function createGameView() {
  let lastResult = null;
  function preserveResultDialog(result) {
    lastResult = result;
  }
  function resultText(game) {
    return (
      {
        five: "다섯 개의 기물이 한 줄로 연결되었습니다.",
        king: "상대 킹을 포획했습니다.",
        resign: "상대가 기권했습니다.",
        stalemate: "더 이상 가능한 행동이 없어 무승부입니다.",
      }[game.result?.reason] || ""
    );
  }
  function renderGameView({
    game,
    mode,
    room,
    connected,
    pending,
    selection,
    flipped,
    undoStack,
    canAct,
  }) {
    $("local-mode").classList.toggle("active", mode === "local");
    $("online-mode").classList.toggle("active", mode === "online");
    $("local-controls").hidden = mode !== "local";
    $("online-controls").hidden = mode !== "online";
    $("lobby").hidden = !!room;
    $("room-details").hidden = !room;
    if (room) {
      $("copy-code").textContent = room.code;
      $("connection").textContent = !connected
        ? "재접속 중"
        : !room.color
          ? "관전 중"
          : !room.joined
            ? "입장 대기 중"
            : !room.online[other(room.color)]
              ? "상대 재접속 대기"
              : `연결됨 · 나는 ${colorName(room.color)}`;
    }
    renderRoom({ room, connected, pending });
    $("play-again").hidden =
      mode === "online" && (!room?.color || !room.joined);
    $("create-room").disabled = pending;
    $("join-form").querySelector("button").disabled = pending;
    renderBoard({ game, selection, flipped, canAct });
    renderReserves({ game, selection, mode, room, canAct });
    renderHistory({ game });
    $("turn-number").textContent = `${game.ply + 1}수`;
    let title = `${colorName(game.turn)} 차례`,
      detail = "";
    if (mode === "online" && !room) {
      title = "온라인 친선전";
      detail = "";
    } else if (mode === "online" && !room.color) {
      title = `${colorName(game.turn)} 차례 · 관전`;
    } else if (
      mode === "online" &&
      (!connected || !room.joined || !room.online[other(room.color)])
    ) {
      title = connected ? "상대 대기 중" : "재접속 중";
      detail = "";
    } else if (mode === "online" && game.turn !== room.color) {
      title = `${colorName(game.turn)} 차례 · 상대`;
    }
    if (game.result) {
      title = game.result.winner
        ? `${colorName(game.result.winner)} 승리!`
        : "무승부";
      detail = "";
      if (room?.rematch?.length) detail = "재대국 요청 중";
    }
    if (room?.colorRequest && !game.result) {
      detail = "색상 변경 요청 · 대국 메뉴에서 확인";
    }
    if (room?.undoRequest) title = "무르기 요청 중";
    $("status-title").textContent = title;
    $("status-detail").textContent = detail;
    $("status-detail").hidden = !detail;
    $("reopen-result").hidden = !game.result;
    const undoRequest = room?.undoRequest;
    const ownUndoRequest = undoRequest?.color === room?.color;
    $("undo").textContent =
      mode === "online" && undoRequest
        ? ownUndoRequest
          ? "요청 취소"
          : "무르기 수락"
        : "무르기";
    $("undo").title =
      mode === "online"
        ? "상대 동의 후 마지막 한 수를 되돌립니다"
        : "마지막 한 수를 되돌립니다";
    $("undo").disabled =
      mode === "local"
        ? !undoStack.length
        : !room?.color ||
          !connected ||
          pending ||
          !room.joined ||
          !room.online[other(room.color)] ||
          !!game.result ||
          !game.history.length ||
          !!room.colorRequest;
    $("reject-undo").hidden =
      mode !== "online" || !room?.color || !undoRequest || ownUndoRequest;
    $("reject-undo").disabled = !connected || pending;
    $("resign").disabled =
      !!game.result ||
      (mode === "online" && (!room?.color || !room?.joined || !connected));
    $("export-game").disabled = !game.history.length;
    if (game.result && game.result !== lastResult) {
      lastResult = game.result;
      $("result-title").textContent = title;
      $("result-detail").textContent = resultText(game);
      $("result-dialog").showModal();
    }
    if (!game.result) {
      lastResult = null;
      $("result-dialog").close();
    }
  }

  return { renderGameView, preserveResultDialog };
}
