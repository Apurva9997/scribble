import express from "express";
import http from "node:http";
import cors from "cors";
import { Server } from "socket.io";
import { RoomManager, PHASE, LIMITS } from "./room.js";

const PORT = Number(process.env.PORT) || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN === "*" ? true : CLIENT_ORIGIN.split(",").map((s) => s.trim()) }));
app.get("/health", (_req, res) => {
  res.json({ ok: true, rooms: manager.rooms.size });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN === "*" ? true : CLIENT_ORIGIN.split(",").map((s) => s.trim()),
    methods: ["GET", "POST"],
  },
});

const manager = new RoomManager();

function emitState(room) {
  for (const player of room.players.values()) {
    if (!player.connected) continue;
    io.to(player.id).emit("room:state", room.snapshot(player.id));
  }
}

function systemMessage(room, text, tone = "info") {
  const payload = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind: "system",
    tone,
    text,
    at: Date.now(),
  };
  io.to(room.code).emit("chat:message", payload);
}

function schedule(room) {
  room.clearTimers();
  const delay = Math.max(0, room.endsAt - Date.now());

  room.timer = setTimeout(() => {
    if (room.phase === PHASE.WORD_SELECTION) {
      const drawer = room.players.get(room.drawerId);
      room.autoSelectWord();
      systemMessage(room, `${drawer?.name || "The drawer"} is drawing now.`, "info");
      emitState(room);
      schedule(room);
      return;
    }
    if (room.phase === PHASE.DRAWING) {
      endTurn(room, "time");
      return;
    }
    if (room.phase === PHASE.TURN_END) {
      const next = room.beginTurn();
      if (next.phase === PHASE.GAME_OVER) {
        announceGameOver(room);
      } else {
        const drawer = room.players.get(room.drawerId);
        systemMessage(room, `${drawer?.name || "Someone"} is choosing a word…`, "info");
        emitState(room);
        schedule(room);
      }
      return;
    }
    if (room.phase === PHASE.GAME_OVER) {
      room.resetToLobby();
      systemMessage(room, "Back to the lobby. The host can start another game.", "info");
      emitState(room);
    }
  }, delay + 30);

  if (
    room.phase === PHASE.DRAWING ||
    room.phase === PHASE.WORD_SELECTION ||
    room.phase === PHASE.TURN_END ||
    room.phase === PHASE.GAME_OVER
  ) {
    room.tickTimer = setInterval(() => {
      if (room.phase === PHASE.DRAWING && room.maybeRevealHints()) emitState(room);
      io.to(room.code).emit("clock", { endsAt: room.endsAt, serverNow: Date.now(), phase: room.phase });
    }, 1000);
  }
}

function endTurn(room, reason) {
  const result = room.finishDrawing(reason);
  if (!result) return;
  io.to(room.code).emit("turn:end", {
    word: result.word,
    reason: result.reason,
    deltas: result.deltas,
    endsAt: room.endsAt,
  });
  systemMessage(room, `The word was “${result.word}”.`, "reveal");
  emitState(room);
  schedule(room);
}

function announceGameOver(room) {
  io.to(room.code).emit("game:over", { podium: room.podium(), endsAt: room.endsAt });
  systemMessage(room, "Game over. Podium is up.", "info");
  emitState(room);
  schedule(room);
}

function leaveRoom(socket, { voluntary } = { voluntary: false }) {
  const code = manager.unbind(socket.id);
  if (!code) return;
  const room = manager.get(code);
  if (!room) return;
  socket.leave(code);
  const player = room.players.get(socket.id);
  const name = player?.name || "A player";
  const result = room.removePlayer(socket.id);
  if (result.empty) {
    manager.deleteIfEmpty(code);
    return;
  }
  systemMessage(room, `${name} left the room.`, "info");
  if (result.drawerLeft) {
    const broken = room.skipBrokenTurn();
    if (broken.abandoned) {
      systemMessage(room, "Not enough players. Returned to the lobby.", "warn");
      emitState(room);
      return;
    }
    if (broken.advance) {
      const next = room.beginTurn();
      if (next.phase === PHASE.GAME_OVER) announceGameOver(room);
      else {
        systemMessage(room, "The drawer left. Next turn.", "warn");
        emitState(room);
        schedule(room);
      }
      return;
    }
  }
  if (room.phase !== PHASE.LOBBY && room.connectedPlayers().length < 2 && !voluntary) {
    room.resetToLobby();
    systemMessage(room, "Not enough players. Returned to the lobby.", "warn");
  }
  emitState(room);
}

function syncStrokes(room) {
  if (room.phase !== PHASE.DRAWING && room.phase !== PHASE.TURN_END) return;
  io.to(room.code).emit("draw:history", room.strokes);
}

io.on("connection", (socket) => {
  socket.emit("hello", { id: socket.id, limits: LIMITS });

  socket.on("room:join", (payload = {}, ack) => {
    const reply = (body) => {
      if (typeof ack === "function") ack(body);
    };
    if (manager.socketRoom.has(socket.id)) {
      reply({ ok: false, error: "You are already in a room. Leave it first." });
      return;
    }
    const name = payload.name;
    const color = payload.color;
    let room = null;
    if (payload.create) {
      room = manager.createRoom(Boolean(payload.public));
    } else if (payload.public) {
      room = manager.findPublicWithSpace() || manager.createRoom(true);
    } else {
      room = manager.get(payload.code);
      if (!room) {
        reply({ ok: false, error: "No room uses that code." });
        return;
      }
    }
    const joined = room.addPlayer({ id: socket.id, name, color });
    if (!joined.ok) {
      if (room.players.size === 0) manager.deleteIfEmpty(room.code);
      reply(joined);
      return;
    }
    socket.join(room.code);
    manager.bind(socket.id, room.code);
    systemMessage(room, `${joined.player.name} joined the room.`, "info");
    emitState(room);
    syncStrokes(room);
    reply({ ok: true, code: room.code });
  });

  socket.on("room:leave", () => {
    leaveRoom(socket, { voluntary: true });
  });

  socket.on("lobby:settings", (patch = {}, ack) => {
    const room = manager.get(manager.socketRoom.get(socket.id));
    if (!room) return;
    const result = room.updateSettings(socket.id, patch);
    if (typeof ack === "function") ack(result);
    if (result.ok) emitState(room);
  });

  socket.on("lobby:profile", (payload = {}, ack) => {
    const room = manager.get(manager.socketRoom.get(socket.id));
    if (!room) return;
    const result = room.rename(socket.id, payload.name, payload.color);
    if (typeof ack === "function") ack(result);
    if (result.ok) emitState(room);
  });

  socket.on("game:start", (_payload, ack) => {
    const room = manager.get(manager.socketRoom.get(socket.id));
    if (!room) return;
    const check = room.canStart(socket.id);
    if (!check.ok) {
      if (typeof ack === "function") ack(check);
      socket.emit("game:error", check);
      return;
    }
    room.startGame();
    const drawer = room.players.get(room.drawerId);
    systemMessage(room, `Game started. ${drawer?.name || "Someone"} is choosing a word…`, "info");
    emitState(room);
    schedule(room);
    if (typeof ack === "function") ack({ ok: true });
  });

  socket.on("word:pick", (payload = {}, ack) => {
    const room = manager.get(manager.socketRoom.get(socket.id));
    if (!room) return;
    const result = room.selectWord(socket.id, payload.word);
    if (typeof ack === "function") ack(result);
    if (!result.ok) return;
    const drawer = room.players.get(room.drawerId);
    systemMessage(room, `${drawer?.name || "The drawer"} is drawing now.`, "info");
    emitState(room);
    schedule(room);
  });

  socket.on("draw:stroke", (stroke) => {
    const room = manager.get(manager.socketRoom.get(socket.id));
    if (!room) return;
    const result = room.addStroke(socket.id, stroke);
    if (!result.ok) return;
    socket.to(room.code).emit("draw:stroke", result.stroke);
    io.to(room.code).emit("draw:history", room.strokes);
  });

  socket.on("draw:undo", () => {
    const room = manager.get(manager.socketRoom.get(socket.id));
    if (!room) return;
    const result = room.undoStroke(socket.id);
    if (!result.ok) return;
    io.to(room.code).emit("draw:undo");
    io.to(room.code).emit("draw:history", room.strokes);
    emitState(room);
  });

  socket.on("draw:clear", () => {
    const room = manager.get(manager.socketRoom.get(socket.id));
    if (!room) return;
    const result = room.clearCanvas(socket.id);
    if (!result.ok) return;
    io.to(room.code).emit("draw:clear", result.stroke);
    io.to(room.code).emit("draw:history", room.strokes);
    emitState(room);
  });

  socket.on("chat:send", (payload = {}, ack) => {
    const room = manager.get(manager.socketRoom.get(socket.id));
    if (!room) return;
    const result = room.handleChat(socket.id, payload.text);
    if (result.type === "ignore") {
      if (typeof ack === "function") ack({ ok: false });
      return;
    }
    if (result.type === "close") {
      socket.emit("chat:private", {
        id: `p-${Date.now()}`,
        kind: "system",
        tone: "close",
        text: result.text,
        at: Date.now(),
      });
      if (typeof ack === "function") ack({ ok: true, close: true });
      return;
    }
    if (result.type === "guess") {
      const notice = {
        id: `g-${Date.now()}-${result.playerId}`,
        kind: "system",
        tone: "guess",
        text: result.notice,
        at: Date.now(),
      };
      io.to(room.code).emit("chat:message", notice);
      io.to(room.code).emit("guess:correct", {
        playerId: result.playerId,
        points: result.points,
        drawerId: result.drawerId,
        drawerPoints: result.drawerPoints,
      });
      emitState(room);
      if (result.allGuessed) endTurn(room, "all-guessed");
      if (typeof ack === "function") ack({ ok: true, guessed: true });
      return;
    }
    if (result.payload.guessedOnly) {
      for (const player of room.players.values()) {
        if (!player.connected) continue;
        if (player.guessed || player.id === room.drawerId) {
          io.to(player.id).emit("chat:message", result.payload);
        }
      }
    } else {
      io.to(room.code).emit("chat:message", result.payload);
    }
    if (typeof ack === "function") ack({ ok: true });
  });

  socket.on("disconnect", () => {
    const code = manager.socketRoom.get(socket.id);
    const room = code ? manager.get(code) : null;
    if (!room) return;
    room.markDisconnected(socket.id);
    const player = room.players.get(socket.id);
    systemMessage(room, `${player?.name || "A player"} disconnected.`, "warn");
    if (room.drawerId === socket.id && room.phase !== PHASE.LOBBY && room.phase !== PHASE.GAME_OVER) {
      manager.unbind(socket.id);
      const removal = room.removePlayer(socket.id);
      if (removal.empty) {
        manager.deleteIfEmpty(code);
        return;
      }
      const broken = room.skipBrokenTurn();
      if (broken.abandoned) {
        systemMessage(room, "Not enough players. Returned to the lobby.", "warn");
        emitState(room);
        return;
      }
      const next = room.beginTurn();
      systemMessage(room, "The drawer disconnected. Skipping to the next turn.", "warn");
      if (next.phase === PHASE.GAME_OVER) announceGameOver(room);
      else {
        emitState(room);
        schedule(room);
      }
      return;
    }
    emitState(room);
    setTimeout(() => {
      const current = manager.get(code);
      if (!current) return;
      const still = current.players.get(socket.id);
      if (still && !still.connected) {
        manager.unbind(socket.id);
        const removal = current.removePlayer(socket.id);
        if (removal.empty) manager.deleteIfEmpty(code);
        else emitState(current);
      }
    }, 12000);
  });
});

server.listen(PORT, () => {
  console.log(`Scribble server listening on http://localhost:${PORT}`);
});
