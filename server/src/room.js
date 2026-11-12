import { pickWords } from "./words.js";
import { levenshtein } from "./levenshtein.js";

export const PHASE = {
  LOBBY: "LOBBY",
  WORD_SELECTION: "WORD_SELECTION",
  DRAWING: "DRAWING",
  TURN_END: "TURN_END",
  GAME_OVER: "GAME_OVER",
};

export const LIMITS = {
  minPlayers: 2,
  maxPlayers: 12,
  minRounds: 1,
  maxRounds: 10,
  minDrawTime: 30,
  maxDrawTime: 180,
  defaultRounds: 3,
  defaultDrawTime: 80,
  wordChoices: 3,
  wordSelectSeconds: 15,
  turnEndSeconds: 5,
  gameOverSeconds: 10,
  maxCustomWords: 100,
  maxWordLength: 24,
  maxUsername: 16,
  maxChat: 80,
  maxStrokePoints: 4000,
  hintFractions: [0.5, 0.25],
  guesserMaxPoints: 500,
  drawerBonusPerGuess: 50,
  drawerBonusAllGuessed: 100,
};

const COLORS = [
  "#e74c3c",
  "#e67e22",
  "#f1c40f",
  "#2ecc71",
  "#1abc9c",
  "#3498db",
  "#9b59b6",
  "#e84393",
  "#fd79a8",
  "#00cec9",
  "#6c5ce7",
  "#d35400",
];

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function makeRoomCode() {
  let code = "";
  for (let i = 0; i < 5; i += 1) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function sanitizeName(name) {
  const cleaned = String(name ?? "")
    .replace(/[^\p{L}\p{N} _.'-]/gu, "")
    .trim()
    .slice(0, LIMITS.maxUsername);
  return cleaned || "Player";
}

function sanitizeWord(word) {
  return String(word ?? "")
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .slice(0, LIMITS.maxWordLength);
}

function maskWord(word, revealedIndexes) {
  return word
    .split("")
    .map((char, index) => (revealedIndexes.has(index) ? char.toUpperCase() : "_"))
    .join(" ");
}

function pickHintIndexes(word, already, count) {
  const hidden = [];
  for (let i = 0; i < word.length; i += 1) {
    if (!already.has(i)) hidden.push(i);
  }
  for (let i = hidden.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [hidden[i], hidden[j]] = [hidden[j], hidden[i]];
  }
  return hidden.slice(0, count);
}

let messageSeq = 1;

export class Room {
  constructor(code, isPublic) {
    this.code = code;
    this.isPublic = isPublic;
    this.hostId = null;
    this.phase = PHASE.LOBBY;
    this.settings = {
      rounds: LIMITS.defaultRounds,
      drawTime: LIMITS.defaultDrawTime,
      customWords: [],
    };
    this.players = new Map();
    this.round = 0;
    this.totalRounds = LIMITS.defaultRounds;
    this.turnIndex = -1;
    this.turnOrder = [];
    this.drawerId = null;
    this.word = null;
    this.wordChoices = [];
    this.revealed = new Set();
    this.hintsGiven = 0;
    this.guessedIds = new Set();
    this.scoresThisTurn = new Map();
    this.drawTime = LIMITS.defaultDrawTime;
    this.startedAt = 0;
    this.endsAt = 0;
    this.strokes = [];
    this.usedWords = [];
    this.timer = null;
    this.tickTimer = null;
    this.createdAt = Date.now();
  }

  addPlayer({ id, name, color }) {
    if (this.players.size >= LIMITS.maxPlayers) {
      return { ok: false, error: "This room is full (12 players)." };
    }
    const taken = new Set([...this.players.values()].map((player) => player.color));
    let avatar = COLORS.includes(color) && !taken.has(color) ? color : null;
    if (!avatar) {
      avatar = COLORS.find((entry) => !taken.has(entry)) || COLORS[this.players.size % COLORS.length];
    }
    const player = {
      id,
      name: this.uniqueName(sanitizeName(name)),
      color: avatar,
      score: 0,
      connected: true,
      guessed: false,
    };
    this.players.set(id, player);
    if (!this.hostId || !this.players.has(this.hostId)) this.hostId = id;
    return { ok: true, player };
  }

  uniqueName(base) {
    const names = new Set([...this.players.values()].map((player) => player.name.toLowerCase()));
    if (!names.has(base.toLowerCase())) return base;
    for (let i = 2; i < 100; i += 1) {
      const candidate = `${base.slice(0, LIMITS.maxUsername - 2)}${i}`;
      if (!names.has(candidate.toLowerCase())) return candidate;
    }
    return `${base.slice(0, 10)}${Math.floor(Math.random() * 90 + 10)}`;
  }

  reconnect(id) {
    const player = this.players.get(id);
    if (!player) return false;
    player.connected = true;
    return true;
  }

  markDisconnected(id) {
    const player = this.players.get(id);
    if (!player) return;
    player.connected = false;
  }

  removePlayer(id) {
    const existed = this.players.delete(id);
    if (!existed) return { removed: false, empty: this.players.size === 0 };
    if (this.hostId === id) {
      const next = [...this.players.values()].find((player) => player.connected) || [...this.players.values()][0];
      this.hostId = next ? next.id : null;
    }
    this.turnOrder = this.turnOrder.filter((playerId) => this.players.has(playerId));
    this.guessedIds.delete(id);
    if (this.drawerId === id && this.phase !== PHASE.LOBBY && this.phase !== PHASE.GAME_OVER) {
      return { removed: true, empty: this.players.size === 0, drawerLeft: true };
    }
    return { removed: true, empty: this.players.size === 0, drawerLeft: false };
  }

  connectedPlayers() {
    return [...this.players.values()].filter((player) => player.connected);
  }

  updateSettings(playerId, patch) {
    if (playerId !== this.hostId) return { ok: false, error: "Only the host can change settings." };
    if (this.phase !== PHASE.LOBBY) return { ok: false, error: "Settings can only change in the lobby." };
    if (patch.rounds != null) {
      this.settings.rounds = clampInt(patch.rounds, LIMITS.minRounds, LIMITS.maxRounds, this.settings.rounds);
    }
    if (patch.drawTime != null) {
      this.settings.drawTime = clampInt(
        patch.drawTime,
        LIMITS.minDrawTime,
        LIMITS.maxDrawTime,
        this.settings.drawTime,
      );
    }
    if (Array.isArray(patch.customWords)) {
      const words = [];
      const seen = new Set();
      for (const raw of patch.customWords) {
        const word = sanitizeWord(raw);
        if (word.length < 3 || seen.has(word)) continue;
        seen.add(word);
        words.push(word);
        if (words.length >= LIMITS.maxCustomWords) break;
      }
      this.settings.customWords = words;
    }
    return { ok: true };
  }

  rename(playerId, name, color) {
    const player = this.players.get(playerId);
    if (!player) return { ok: false, error: "You are not in this room." };
    if (this.phase !== PHASE.LOBBY) return { ok: false, error: "You can only change your name in the lobby." };
    const next = this.uniqueName(sanitizeName(name));
    const others = [...this.players.values()].filter((entry) => entry.id !== playerId);
    if (others.some((entry) => entry.name.toLowerCase() === next.toLowerCase() && next !== player.name)) {
      player.name = this.uniqueName(next);
    } else {
      player.name = next;
    }
    if (COLORS.includes(color)) {
      const taken = others.some((entry) => entry.color === color);
      if (!taken) player.color = color;
    }
    return { ok: true };
  }

  canStart(playerId) {
    if (playerId !== this.hostId) return { ok: false, error: "Only the host can start the game." };
    if (this.phase !== PHASE.LOBBY) return { ok: false, error: "A game is already in progress." };
    if (this.connectedPlayers().length < LIMITS.minPlayers) {
      return { ok: false, error: "At least 2 players are needed to start." };
    }
    return { ok: true };
  }

  startGame() {
    this.totalRounds = this.settings.rounds;
    this.drawTime = this.settings.drawTime;
    this.round = 1;
    this.turnIndex = -1;
    this.usedWords = [];
    for (const player of this.players.values()) {
      player.score = 0;
      player.guessed = false;
    }
    this.turnOrder = this.connectedPlayers().map((player) => player.id);
    this.shuffle(this.turnOrder);
    return this.beginTurn();
  }

  shuffle(list) {
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  }

  beginTurn() {
    this.clearTimers();
    this.turnIndex += 1;
    if (this.turnIndex >= this.turnOrder.length) {
      if (this.round >= this.totalRounds) return this.enterGameOver();
      this.round += 1;
      this.turnIndex = 0;
      const connected = new Set(this.connectedPlayers().map((player) => player.id));
      this.turnOrder = this.turnOrder.filter((id) => connected.has(id));
      for (const player of this.connectedPlayers()) {
        if (!this.turnOrder.includes(player.id)) this.turnOrder.push(player.id);
      }
      if (this.turnOrder.length < 2) return this.enterGameOver();
    }
    if (!this.players.has(this.turnOrder[this.turnIndex])) {
      return this.beginTurn();
    }
    this.drawerId = this.turnOrder[this.turnIndex];
    this.word = null;
    this.revealed = new Set();
    this.hintsGiven = 0;
    this.guessedIds = new Set();
    this.scoresThisTurn = new Map();
    this.strokes = [];
    for (const player of this.players.values()) player.guessed = false;

    const custom = this.settings.customWords.filter((word) => !this.usedWords.includes(word));
    const choices = [];
    if (custom.length > 0 && Math.random() < 0.45) {
      const pick = custom[Math.floor(Math.random() * custom.length)];
      choices.push(pick);
    }
    const filler = pickWords(LIMITS.wordChoices, [...this.usedWords, ...choices]);
    for (const word of filler) {
      if (!choices.includes(word)) choices.push(word);
      if (choices.length >= LIMITS.wordChoices) break;
    }
    this.wordChoices = choices.slice(0, LIMITS.wordChoices);
    this.phase = PHASE.WORD_SELECTION;
    this.startedAt = Date.now();
    this.endsAt = this.startedAt + LIMITS.wordSelectSeconds * 1000;
    return { phase: this.phase };
  }

  selectWord(playerId, word) {
    if (this.phase !== PHASE.WORD_SELECTION) return { ok: false, error: "It is not time to choose a word." };
    if (playerId !== this.drawerId) return { ok: false, error: "Only the drawer can choose the word." };
    const normalized = sanitizeWord(word);
    const match = this.wordChoices.find((choice) => choice === normalized);
    if (!match) return { ok: false, error: "That word is not one of the choices." };
    this.commitWord(match);
    return { ok: true };
  }

  autoSelectWord() {
    if (this.phase !== PHASE.WORD_SELECTION || this.wordChoices.length === 0) return false;
    const word = this.wordChoices[Math.floor(Math.random() * this.wordChoices.length)];
    this.commitWord(word);
    return true;
  }

  commitWord(word) {
    this.word = word;
    this.usedWords.push(word);
    if (this.usedWords.length > 80) this.usedWords.shift();
    this.phase = PHASE.DRAWING;
    this.startedAt = Date.now();
    this.endsAt = this.startedAt + this.drawTime * 1000;
    this.hintsGiven = 0;
    this.revealed = new Set();
  }

  timeLeftMs() {
    return Math.max(0, this.endsAt - Date.now());
  }

  timeLeftSeconds() {
    return Math.ceil(this.timeLeftMs() / 1000);
  }

  maybeRevealHints() {
    if (this.phase !== PHASE.DRAWING || !this.word) return false;
    const elapsed = 1 - this.timeLeftMs() / (this.drawTime * 1000);
    let target = 0;
    if (elapsed >= 0.75) target = 2;
    else if (elapsed >= 0.5) target = 1;
    if (target <= this.hintsGiven) return false;
    const toReveal = target - this.hintsGiven;
    const perHint = Math.max(1, Math.round(this.word.length * 0.12));
    const indexes = pickHintIndexes(this.word, this.revealed, perHint * toReveal);
    indexes.forEach((index) => this.revealed.add(index));
    this.hintsGiven = target;
    return indexes.length > 0;
  }

  maskFor(playerId) {
    if (!this.word) return "";
    if (playerId === this.drawerId || this.guessedIds.has(playerId) || this.phase === PHASE.TURN_END || this.phase === PHASE.GAME_OVER) {
      return this.word;
    }
    return maskWord(this.word, this.revealed);
  }

  publicMask() {
    if (!this.word) return "";
    if (this.phase === PHASE.TURN_END || this.phase === PHASE.GAME_OVER) return this.word;
    return maskWord(this.word, this.revealed);
  }

  addStroke(playerId, stroke) {
    if (this.phase !== PHASE.DRAWING) return { ok: false, error: "Drawing is closed." };
    if (playerId !== this.drawerId) return { ok: false, error: "Only the drawer can draw." };
    const clean = sanitizeStroke(stroke);
    if (!clean) return { ok: false, error: "That stroke was rejected." };
    this.strokes.push(clean);
    if (this.strokes.length > 2500) this.strokes.splice(0, this.strokes.length - 2500);
    return { ok: true, stroke: clean };
  }

  undoStroke(playerId) {
    if (this.phase !== PHASE.DRAWING) return { ok: false };
    if (playerId !== this.drawerId) return { ok: false };
    for (let i = this.strokes.length - 1; i >= 0; i -= 1) {
      if (this.strokes[i].type !== "undo") {
        this.strokes.push({ type: "undo", t: Date.now() });
        return { ok: true };
      }
    }
    return { ok: false };
  }

  clearCanvas(playerId) {
    if (this.phase !== PHASE.DRAWING || playerId !== this.drawerId) return { ok: false };
    const command = { type: "clear", t: Date.now() };
    this.strokes.push(command);
    return { ok: true, stroke: command };
  }

  handleChat(playerId, text) {
    const player = this.players.get(playerId);
    if (!player) return { type: "ignore" };
    const message = String(text ?? "").replace(/\s+/g, " ").trim().slice(0, LIMITS.maxChat);
    if (!message) return { type: "ignore" };

    if (this.phase === PHASE.DRAWING && this.word && playerId !== this.drawerId && !player.guessed) {
      const guess = message.toLowerCase().replace(/[^a-z]/g, "");
      const target = this.word.toLowerCase();
      if (guess && guess === target) {
        return this.awardGuess(player);
      }
      if (guess && Math.abs(guess.length - target.length) <= 1 && levenshtein(guess, target) === 1) {
        return {
          type: "close",
          to: playerId,
          text: `"${message}" is very close!`,
        };
      }
    }

    const id = messageSeq++;
    const payload = {
      id,
      kind: "chat",
      playerId,
      name: player.name,
      color: player.color,
      text: message,
      at: Date.now(),
      guessedOnly: this.phase === PHASE.DRAWING && player.guessed && playerId !== this.drawerId,
    };
    return { type: "chat", payload };
  }

  awardGuess(player) {
    const timeLeft = this.timeLeftMs() / 1000;
    const points = Math.max(1, Math.ceil((timeLeft / this.drawTime) * LIMITS.guesserMaxPoints));
    player.score += points;
    player.guessed = true;
    this.guessedIds.add(player.id);
    this.scoresThisTurn.set(player.id, (this.scoresThisTurn.get(player.id) || 0) + points);

    const drawer = this.players.get(this.drawerId);
    let drawerPoints = 0;
    if (drawer) {
      drawerPoints = LIMITS.drawerBonusPerGuess;
      drawer.score += drawerPoints;
      this.scoresThisTurn.set(drawer.id, (this.scoresThisTurn.get(drawer.id) || 0) + drawerPoints);
    }

    const guessers = this.connectedPlayers().filter((entry) => entry.id !== this.drawerId);
    const allGuessed = guessers.length > 0 && guessers.every((entry) => entry.guessed);
    if (allGuessed && drawer) {
      drawer.score += LIMITS.drawerBonusAllGuessed;
      drawerPoints += LIMITS.drawerBonusAllGuessed;
      this.scoresThisTurn.set(drawer.id, (this.scoresThisTurn.get(drawer.id) || 0) + LIMITS.drawerBonusAllGuessed);
    }

    return {
      type: "guess",
      allGuessed,
      notice: `${player.name} guessed the word!`,
      playerId: player.id,
      points,
      drawerPoints,
      drawerId: this.drawerId,
    };
  }

  finishDrawing(reason) {
    if (this.phase !== PHASE.DRAWING && this.phase !== PHASE.WORD_SELECTION) return null;
    this.clearTimers();
    if (this.phase === PHASE.WORD_SELECTION) {
      this.autoSelectWord();
    }
    const word = this.word;
    this.phase = PHASE.TURN_END;
    this.startedAt = Date.now();
    this.endsAt = this.startedAt + LIMITS.turnEndSeconds * 1000;
    const deltas = [...this.scoresThisTurn.entries()].map(([id, delta]) => {
      const player = this.players.get(id);
      return {
        id,
        name: player?.name || "Player",
        color: player?.color || "#fff",
        delta,
        score: player?.score || 0,
      };
    });
    deltas.sort((a, b) => b.delta - a.delta);
    return { word, reason, deltas };
  }

  enterGameOver() {
    this.clearTimers();
    this.phase = PHASE.GAME_OVER;
    this.drawerId = null;
    this.word = null;
    this.startedAt = Date.now();
    this.endsAt = this.startedAt + LIMITS.gameOverSeconds * 1000;
    return { phase: PHASE.GAME_OVER };
  }

  resetToLobby() {
    this.clearTimers();
    this.phase = PHASE.LOBBY;
    this.round = 0;
    this.turnIndex = -1;
    this.drawerId = null;
    this.word = null;
    this.wordChoices = [];
    this.strokes = [];
    this.guessedIds = new Set();
    this.scoresThisTurn = new Map();
    this.revealed = new Set();
    for (const player of this.players.values()) player.guessed = false;
  }

  skipBrokenTurn() {
    this.clearTimers();
    if (this.connectedPlayers().length < 2) {
      this.resetToLobby();
      return { abandoned: true };
    }
    if (this.phase === PHASE.GAME_OVER) return { abandoned: false };
    return { abandoned: false, advance: true };
  }

  podium() {
    return [...this.players.values()]
      .map((player) => ({
        id: player.id,
        name: player.name,
        color: player.color,
        score: player.score,
        connected: player.connected,
      }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  }

  snapshot(forPlayerId) {
    const players = [...this.players.values()]
      .map((player) => ({
        id: player.id,
        name: player.name,
        color: player.color,
        score: player.score,
        connected: player.connected,
        guessed: player.guessed,
        isDrawer: player.id === this.drawerId,
        isHost: player.id === this.hostId,
        isYou: player.id === forPlayerId,
      }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

    const youAreDrawer = forPlayerId === this.drawerId;
    const youGuessed = this.guessedIds.has(forPlayerId);
    let wordDisplay = "";
    if (this.phase === PHASE.DRAWING) {
      wordDisplay = youAreDrawer || youGuessed ? this.word : this.publicMask();
    } else if (this.phase === PHASE.TURN_END) {
      wordDisplay = this.word || "";
    }

    return {
      code: this.code,
      isPublic: this.isPublic,
      phase: this.phase,
      hostId: this.hostId,
      settings: {
        rounds: this.settings.rounds,
        drawTime: this.settings.drawTime,
        customWords: this.phase === PHASE.LOBBY && forPlayerId === this.hostId ? this.settings.customWords : [],
        customWordCount: this.settings.customWords.length,
      },
      players,
      you: players.find((player) => player.id === forPlayerId) || null,
      round: this.round,
      totalRounds: this.totalRounds,
      drawerId: this.drawerId,
      wordDisplay,
      wordLength: this.word ? this.word.length : 0,
      wordChoices: youAreDrawer && this.phase === PHASE.WORD_SELECTION ? this.wordChoices : [],
      endsAt: this.endsAt,
      serverNow: Date.now(),
      drawTime: this.drawTime,
      hintsGiven: this.hintsGiven,
      turnDeltas: this.phase === PHASE.TURN_END
        ? [...this.scoresThisTurn.entries()].map(([id, delta]) => ({
            id,
            delta,
            name: this.players.get(id)?.name || "Player",
          }))
        : [],
      strokes: this.phase === PHASE.DRAWING || this.phase === PHASE.TURN_END ? this.strokes : [],
      podium: this.phase === PHASE.GAME_OVER ? this.podium() : [],
      canDraw: youAreDrawer && this.phase === PHASE.DRAWING,
    };
  }

  clearTimers() {
    if (this.timer) clearTimeout(this.timer);
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.timer = null;
    this.tickTimer = null;
  }
}

const PALETTE = new Set([
  "#ffffff",
  "#c1c1c1",
  "#ef130b",
  "#ff7100",
  "#ffe400",
  "#00cc00",
  "#00b2ff",
  "#231fd3",
  "#a300ba",
  "#d37caa",
  "#a0522d",
  "#000000",
  "#4c4c4c",
  "#740b07",
  "#c23800",
  "#e5c900",
]);

const SIZES = new Set([2, 6, 12, 22, 28]);

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(1, Math.max(0, n));
}

export function sanitizeStroke(stroke) {
  if (!stroke || typeof stroke !== "object") return null;
  const type = stroke.type;
  if (type === "clear") return { type: "clear", t: Date.now() };
  if (type === "undo") return { type: "undo", t: Date.now() };
  if (type !== "stroke" && type !== "fill") return null;
  const color = PALETTE.has(stroke.color) ? stroke.color : "#000000";
  const size = SIZES.has(stroke.size) ? stroke.size : 6;
  if (type === "fill") {
    const x = clamp01(stroke.x);
    const y = clamp01(stroke.y);
    if (x == null || y == null) return null;
    return { type: "fill", x, y, color, t: Date.now() };
  }
  if (!Array.isArray(stroke.points)) return null;
  const points = [];
  for (const point of stroke.points.slice(0, LIMITS.maxStrokePoints)) {
    if (!point) continue;
    const x = clamp01(point.x);
    const y = clamp01(point.y);
    if (x == null || y == null) continue;
    points.push({ x, y });
  }
  if (points.length === 0) return null;
  return { type: "stroke", color, size, erase: Boolean(stroke.erase), points, t: Date.now() };
}

export class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.socketRoom = new Map();
  }

  createRoom(isPublic) {
    let code = makeRoomCode();
    while (this.rooms.has(code)) code = makeRoomCode();
    const room = new Room(code, isPublic);
    this.rooms.set(code, room);
    return room;
  }

  get(code) {
    return this.rooms.get(String(code || "").toUpperCase()) || null;
  }

  findPublicWithSpace() {
    for (const room of this.rooms.values()) {
      if (room.isPublic && room.players.size < LIMITS.maxPlayers && room.phase === PHASE.LOBBY) {
        return room;
      }
    }
    return null;
  }

  bind(socketId, code) {
    this.socketRoom.set(socketId, code);
  }

  unbind(socketId) {
    const code = this.socketRoom.get(socketId);
    this.socketRoom.delete(socketId);
    return code;
  }

  deleteIfEmpty(code) {
    const room = this.rooms.get(code);
    if (room && room.players.size === 0) {
      room.clearTimers();
      this.rooms.delete(code);
    }
  }
}
