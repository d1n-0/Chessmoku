import { randomBytes, randomInt } from "node:crypto";
import { newGame, applyAction, other } from "../../shared/game.js";

import { handleUndo } from "./undo.js";
import { playerName, handleColorRequest, yieldSeat } from "./players.js";

export function createRoomService({
  rooms,
  attach,
  detach,
  commit,
  send,
  promote,
}) {
  return function handleMessage(socket, message) {
    if (message.type === "create") {
      const name = playerName(message.name ?? "플레이어");
      if (socket.room) throw new Error("현재 방을 나간 뒤 새 방을 만드세요.");
      if (rooms.size >= 1000)
        throw new Error("방이 가득 찼습니다. 잠시 후 다시 시도하세요.");
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let code;
      do {
        code = Array.from(
          { length: 6 },
          () => alphabet[randomInt(alphabet.length)],
        ).join("");
      } while (rooms.has(code));
      const room = {
        code,
        tokens: { w: randomBytes(24).toString("hex"), b: null },
        game: newGame(),
        version: 0,
        rematch: [],
        updated: Date.now(),
        sockets: { w: null, b: null },
        queue: [],
        names: {},
        colorRequest: null,
        undoRequest: null,
      };
      room.names[room.tokens.w] = name;
      rooms.set(code, room);
      attach(socket, room, "w");
      commit(room);
      return;
    }
    if (message.type === "join" || message.type === "resume") {
      if (socket.room) throw new Error("이미 방에 입장했습니다.");
      const room = rooms.get(String(message.code).toUpperCase());
      if (!room) throw new Error("방을 찾을 수 없습니다. 코드를 확인하세요.");
      if (message.type === "resume") {
        const color = ["w", "b"].find(
          (c) => room.tokens[c] && room.tokens[c] === message.token,
        );
        const queued = room.queue.find(
          (entry) => entry.token === message.token,
        );
        if (!color && !queued)
          throw new Error("재접속 정보가 올바르지 않습니다.");
        attach(socket, room, color || null, message.token);
        promote(room);
        commit(room);
        return;
      }
      const name = playerName(message.name ?? "플레이어");
      promote(room);
      const color = ["w", "b"].find((color) => !room.tokens[color]);
      const token = randomBytes(24).toString("hex");
      if (color) {
        room.tokens[color] = token;
        room.names[token] = name;
        room.colorRequest = null;
        room.undoRequest = null;
        if (room.game.ply || room.game.result) {
          room.game = newGame();
          room.version++;
        }
        room.rematch = [];
        attach(socket, room, color);
      } else {
        if (room.queue.length >= 16) throw new Error("대기열이 가득 찼습니다.");
        room.names[token] = name;
        room.queue.push({ token, socket: null });
        attach(socket, room, null, token);
      }
      commit(room);
      return;
    }
    const room = rooms.get(socket.room),
      color = socket.color;
    const queued = room?.queue.find((entry) => entry.socket === socket);
    if (!room || (!queued && room.sockets[color] !== socket))
      throw new Error("먼저 방에 입장하세요.");
    if (message.type === "rename") {
      const token = queued?.token || room.tokens[color];
      room.names[token] = playerName(message.name);
      commit(room);
      return;
    }
    if (message.type === "leave") {
      delete room.names[queued?.token || room.tokens[color]];
      if (color && room.tokens.w && room.tokens.b && !room.game.result) {
        room.game.result = {
          winner: other(color),
          reason: "resign",
          line: [],
        };
        room.version++;
      }
      detach(socket);
      if (queued) room.queue = room.queue.filter((entry) => entry !== queued);
      else {
        room.tokens[color] = null;
        room.colorRequest = null;
        room.undoRequest = null;
        room.rematch = [];
      }
      promote(room);
      commit(room);
      send(socket, { type: "left" });
      return;
    }
    if (!color) throw new Error("대기 중에는 대국을 조작할 수 없습니다.");
    if (["undo-request", "undo-response"].includes(message.type)) {
      handleUndo(room, color, message);
    } else if (["choose-color", "color-response"].includes(message.type)) {
      handleColorRequest(room, color, message);
    } else if (message.type === "yield-seat") {
      yieldSeat(room, socket, { attach, promote });
    } else if (message.type === "action") {
      if (room.undoRequest)
        throw new Error("무르기 요청을 수락하거나 취소해 주세요.");
      if (room.colorRequest)
        throw new Error("색상 변경 요청을 수락하거나 취소해 주세요.");
      if (!room.sockets[other(color)] || !room.tokens.b)
        throw new Error("상대가 연결될 때까지 기다려 주세요.");
      if (message.version !== room.version)
        throw new Error("대국 상태가 바뀌었습니다. 다시 선택하세요.");
      room.game = applyAction(room.game, message.action, color);
      room.version++;
    } else if (message.type === "resign") {
      if (room.game.result || !room.tokens.w || !room.tokens.b)
        throw new Error("진행 중인 대국이 없습니다.");
      room.colorRequest = null;
      room.undoRequest = null;
      room.game.result = { winner: other(color), reason: "resign", line: [] };
      room.version++;
    } else if (message.type === "rematch") {
      if (!room.tokens.w || !room.tokens.b)
        throw new Error("상대 입장을 기다려 주세요.");
      if (!room.game.result)
        throw new Error("대국 종료 후 다시 대국할 수 있습니다.");
      if (!room.rematch.includes(color)) room.rematch.push(color);
      if (room.rematch.length === 2) {
        room.game = newGame();
        room.undoRequest = null;
        room.version++;
        room.rematch = [];
      }
    } else throw new Error("알 수 없는 요청입니다.");
    commit(room);
  };
}
