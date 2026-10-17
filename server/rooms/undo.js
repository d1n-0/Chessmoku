import { chargeClock } from "./lifecycle.js";
import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";
import { replayLocalGame } from "../../shared/game/replay.js";

export function handleUndo(room, color, message) {
  if (message.type === "undo-request") {
    if (message.version !== room.version)
      throw new Error("대국 상태가 바뀌었습니다. 다시 요청하세요.");
    if (
      room.phase !== "playing" ||
      room.game.result ||
      !room.game.history.length
    )
      throw new Error("진행 중인 대국의 마지막 한 수만 무를 수 있습니다.");
    if (room.undoRequest || room.colorRequest)
      throw new Error("기존 요청에 먼저 응답하세요.");
    if (
      !["w", "b"].every((c) => room.sockets[c]?.readyState === WebSocket.OPEN)
    )
      throw new Error("상대가 연결될 때까지 기다려 주세요.");
    room.undoRequest = { id: randomUUID(), color, version: room.version };
    return;
  }
  const request = room.undoRequest;
  if (!request || message.id !== request.id || request.version !== room.version)
    throw new Error("무르기 요청이 만료되었습니다.");
  if (message.accept === true) {
    if (request.color === color)
      throw new Error("상대만 무르기를 수락할 수 있습니다.");
    if (
      !["w", "b"].every((c) => room.sockets[c]?.readyState === WebSocket.OPEN)
    )
      throw new Error("상대가 연결될 때까지 기다려 주세요.");
    const now = Date.now();
    chargeClock(room, room.game.turn, now);
    const mover = room.game.history.at(-1).color;
    if (room.clock.remaining[mover] !== null)
      room.clock.remaining[mover] = Math.max(
        0,
        room.clock.remaining[mover] - room.settings.incrementSeconds * 1000,
      );
    room.clock.turnStarted = now;
    room.game = replayLocalGame({
      rulesVersion: room.game.rulesVersion,
      history: room.game.history.slice(0, -1),
    }).game;
    room.version++;
  }
  room.undoRequest = null;
}
