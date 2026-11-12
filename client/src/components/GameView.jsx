import { useEffect, useState } from "react";
import { Clock3, Copy, LogOut } from "lucide-react";
import { useGame } from "../socket/SocketProvider.jsx";
import { useCountdown } from "../hooks/useCountdown.js";
import CanvasStage from "./CanvasStage.jsx";
import ChatPanel from "./ChatPanel.jsx";
import PlayerList from "./PlayerList.jsx";

export default function GameView() {
  const { room, leave, startGame, pickWord, updateSettings, error } = useGame();
  const seconds = useCountdown(room?.endsAt, room?.serverNow);
  const [copied, setCopied] = useState(false);
  const [rounds, setRounds] = useState(room?.settings?.rounds || 3);
  const [drawTime, setDrawTime] = useState(room?.settings?.drawTime || 80);
  const [customWords, setCustomWords] = useState("");
  const [startError, setStartError] = useState("");

  useEffect(() => {
    setRounds(room?.settings?.rounds || 3);
    setDrawTime(room?.settings?.drawTime || 80);
  }, [room?.settings?.rounds, room?.settings?.drawTime]);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  const drawer = room.players.find((player) => player.id === room.drawerId);
  const isHost = room.you?.isHost;
  const choosing = room.phase === "WORD_SELECTION" && room.you?.isDrawer;

  return (
    <div className="mx-auto flex min-h-dvh max-w-[1400px] flex-col gap-3 px-3 py-3 lg:h-dvh lg:overflow-hidden">
      <header className="flex flex-wrap items-center gap-3 rounded-3xl border border-white/10 bg-[#140b33]/80 px-4 py-3">
        <div>
          <p className="display text-2xl font-bold leading-none text-white">Scribble</p>
          <button type="button" onClick={copyCode} className="mt-1 inline-flex items-center gap-1 text-sm font-extrabold text-amber-200">
            Room {room.code}
            <Copy size={14} aria-hidden="true" />
            <span className="sr-only">Copy room code</span>
            {copied ? <span className="text-emerald-200">Copied</span> : null}
          </button>
        </div>
        <div className="mx-auto text-center">
          <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-violet-200">
            {room.phase === "LOBBY"
              ? "Lobby"
              : room.phase === "GAME_OVER"
                ? "Game over"
                : `Round ${Math.min(room.round, room.totalRounds)} of ${room.totalRounds}`}
          </p>
          <p className="display mt-1 text-3xl font-bold tracking-[0.25em] text-white" aria-live="polite">
            {room.phase === "WORD_SELECTION"
              ? "•••••"
              : room.wordDisplay
                ? room.wordDisplay
                : room.phase === "LOBBY"
                  ? "Waiting"
                  : ""}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {room.phase !== "LOBBY" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-300 px-3 py-1 text-lg font-extrabold text-[#2a1760]">
              <Clock3 size={16} aria-hidden="true" />
              {seconds}s
            </span>
          ) : null}
          <button
            type="button"
            onClick={leave}
            className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-2 text-sm font-extrabold text-white"
          >
            <LogOut size={16} aria-hidden="true" />
            Leave
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[260px_minmax(0,1fr)_300px]">
        <PlayerList players={room.players} />
        <section className="relative min-h-0">
          <CanvasStage />
          {room.phase === "LOBBY" ? (
            <LobbyOverlay
              isHost={isHost}
              rounds={rounds}
              setRounds={setRounds}
              drawTime={drawTime}
              setDrawTime={setDrawTime}
              customWords={customWords}
              setCustomWords={setCustomWords}
              playerCount={room.players.filter((player) => player.connected).length}
              customWordCount={room.settings.customWordCount}
              error={startError || error}
              onSave={() =>
                updateSettings({
                  rounds,
                  drawTime,
                  customWords: customWords
                    .split(/[\s,]+/)
                    .map((word) => word.trim())
                    .filter(Boolean),
                })
              }
              onStart={async () => {
                setStartError("");
                const result = await startGame();
                if (result && result.ok === false) setStartError(result.error);
              }}
            />
          ) : null}
          {room.phase === "WORD_SELECTION" ? (
            <div className="absolute inset-0 flex items-center justify-center rounded-3xl bg-[#120c28]/80 p-4 backdrop-blur-sm">
              {choosing ? (
                <div className="w-full max-w-md rounded-3xl bg-white p-5 text-[#2a1760]">
                  <p className="text-sm font-extrabold uppercase tracking-wide text-fuchsia-600">Choose a word</p>
                  <h2 className="display text-3xl font-bold">You have {seconds}s</h2>
                  <p className="mt-1 text-sm font-bold text-slate-600">If the timer ends, one word is picked for you.</p>
                  <div className="mt-4 grid gap-2">
                    {room.wordChoices.map((word) => (
                      <button
                        key={word}
                        type="button"
                        onClick={() => pickWord(word)}
                        className="rounded-2xl bg-[#2a1760] px-4 py-3 text-lg font-extrabold text-white"
                      >
                        {word}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="display text-center text-3xl font-bold text-white">
                  {drawer?.name || "Someone"} is choosing a word…
                </p>
              )}
            </div>
          ) : null}
          {room.phase === "TURN_END" ? <TurnEnd room={room} seconds={seconds} /> : null}
          {room.phase === "GAME_OVER" ? <Podium room={room} seconds={seconds} /> : null}
        </section>
        <ChatPanel disabled={false} />
      </div>
    </div>
  );
}

function LobbyOverlay({
  isHost,
  rounds,
  setRounds,
  drawTime,
  setDrawTime,
  customWords,
  setCustomWords,
  playerCount,
  customWordCount,
  error,
  onSave,
  onStart,
}) {
  return (
    <div className="absolute inset-0 flex items-start justify-center overflow-y-auto rounded-3xl bg-[#120c28]/75 p-4 backdrop-blur-sm">
      <div className="my-auto w-full max-w-md rounded-3xl bg-white p-5 text-[#241447]">
        <h2 className="display text-3xl font-bold">Waiting room</h2>
        <p className="mt-1 text-sm font-bold text-slate-600">
          {playerCount} connected. Two players are required to start.
        </p>
        {isHost ? (
          <div className="mt-4 space-y-3">
            <label className="block text-sm font-extrabold" htmlFor="rounds">
              Rounds
              <input
                id="rounds"
                type="number"
                min={1}
                max={10}
                value={rounds}
                onChange={(event) => setRounds(Number(event.target.value))}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              />
            </label>
            <label className="block text-sm font-extrabold" htmlFor="draw-time">
              Draw time (seconds)
              <input
                id="draw-time"
                type="number"
                min={30}
                max={180}
                value={drawTime}
                onChange={(event) => setDrawTime(Number(event.target.value))}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              />
            </label>
            <label className="block text-sm font-extrabold" htmlFor="custom-words">
              Custom words
              <textarea
                id="custom-words"
                value={customWords}
                onChange={(event) => setCustomWords(event.target.value)}
                placeholder="rocket, castle, octopus"
                rows={3}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              />
            </label>
            <p className="text-xs font-bold text-slate-500">{customWordCount} custom words saved on the server.</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={onSave} className="rounded-2xl bg-slate-100 px-3 py-3 font-extrabold">
                Save settings
              </button>
              <button type="button" onClick={onStart} className="rounded-2xl bg-amber-300 px-3 py-3 font-extrabold text-[#2a1760]">
                Start game
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-4 rounded-2xl bg-slate-100 px-3 py-3 text-sm font-bold">
            The host chooses rounds, draw time, and any custom words, then starts the game.
          </p>
        )}
        {error ? (
          <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function TurnEnd({ room, seconds }) {
  const deltas = [...(room.turnDeltas || [])].sort((a, b) => b.delta - a.delta);
  return (
    <div className="absolute inset-0 flex items-center justify-center rounded-3xl bg-[#120c28]/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl bg-white p-5 text-[#241447]">
        <p className="text-sm font-extrabold uppercase tracking-wide text-fuchsia-600">Word revealed</p>
        <h2 className="display text-4xl font-bold capitalize">{room.wordDisplay}</h2>
        <ul className="mt-4 space-y-2">
          {deltas.length === 0 ? <li className="text-sm font-bold text-slate-500">Nobody scored this turn.</li> : null}
          {deltas.map((player) => (
            <li key={player.id} className="flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2 font-extrabold">
              <span>{player.name}</span>
              <span className="text-emerald-700">+{player.delta}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm font-bold text-slate-500">Next turn in {seconds}s.</p>
      </div>
    </div>
  );
}

function Podium({ room, seconds }) {
  const top = (room.podium || []).slice(0, 3);
  const places = ["1st", "2nd", "3rd"];
  return (
    <div className="absolute inset-0 flex items-center justify-center rounded-3xl bg-[#120c28]/85 p-4">
      <div className="w-full max-w-lg text-center text-white">
        <p className="text-sm font-extrabold uppercase tracking-[0.25em] text-amber-200">Game over</p>
        <h2 className="display text-5xl font-bold">Podium</h2>
        <ol className="mt-6 space-y-3">
          {top.map((player, index) => (
            <li
              key={player.id}
              className="flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3 text-left"
            >
              <span className="display text-2xl font-bold text-amber-200">{places[index]}</span>
              <span className="flex-1 px-4 text-xl font-extrabold">{player.name}</span>
              <span className="text-lg font-extrabold">{player.score}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm font-bold text-violet-100">Lobby returns in {seconds}s.</p>
      </div>
    </div>
  );
}
