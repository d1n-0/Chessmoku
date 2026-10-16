import { randomBytes, randomInt } from "node:crypto";
import { newGame, applyAction, other } from "../../shared/game.js";

export function createRoomService({ rooms, attach, detach, commit, send }) {
  return function handleMessage(socket, message) {
    if (message.type === "create") {
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
      };
      rooms.set(code, room);
      attach(socket, room, "w");
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
        if (!color) throw new Error("재접속 정보가 올바르지 않습니다.");
        attach(socket, room, color);
        return;
      }
      if (room.tokens.b) throw new Error("이미 두 명이 입장한 방입니다.");
      room.tokens.b = randomBytes(24).toString("hex");
      attach(socket, room, "b");
      return;
    }
    const room = rooms.get(socket.room),
      color = socket.color;
    if (!room || room.sockets[color] !== socket)
      throw new Error("먼저 방에 입장하세요.");
    if (message.type === "leave") {
      if (room.tokens.b && !room.game.result) {
        room.game.result = {
          winner: other(color),
          reason: "resign",
          line: [],
        };
        room.version++;
      }
      detach(socket);
      commit(room);
      send(socket, { type: "left" });
      return;
    }
    if (message.type === "action") {
      if (!room.sockets[other(color)] || !room.tokens.b)
        throw new Error("상대가 연결될 때까지 기다려 주세요.");
      if (message.version !== room.version)
        throw new Error("대국 상태가 바뀌었습니다. 다시 선택하세요.");
      room.game = applyAction(room.game, message.action, color);
      room.version++;
    } else if (message.type === "resign") {
      if (room.game.result || !room.tokens.b)
        throw new Error("진행 중인 대국이 없습니다.");
      room.game.result = { winner: other(color), reason: "resign", line: [] };
      room.version++;
    } else if (message.type === "rematch") {
      if (!room.game.result)
        throw new Error("대국 종료 후 다시 대국할 수 있습니다.");
      if (!room.rematch.includes(color)) room.rematch.push(color);
      if (room.rematch.length === 2) {
        room.game = newGame();
        room.version++;
        room.rematch = [];
      }
    } else throw new Error("알 수 없는 요청입니다.");
    commit(room);
  };
}
