import { useState } from "react";
import { Lock, Users } from "lucide-react";
import { AVATAR_COLORS, loadProfile, saveProfile } from "../lib/palette.js";
import { useGame } from "../socket/SocketProvider.jsx";
import Avatar from "./Avatar.jsx";

export default function Landing() {
  const { joinPublic, createPrivate, joinCode, connected, error, clearError } = useGame();
  const stored = loadProfile();
  const [name, setName] = useState(stored.name);
  const [color, setColor] = useState(stored.color);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");

  function persist() {
    const profile = { name: name.trim(), color };
    saveProfile(profile);
    return profile;
  }

  async function run(action) {
    setLocalError("");
    clearError();
    if (name.trim().length < 2) {
      setLocalError("Choose a name with at least 2 characters.");
      return;
    }
    setBusy(true);
    const result = await action(persist());
    setBusy(false);
    if (result && result.ok === false) setLocalError(result.error || "Unable to join.");
  }

  const shownError = localError || error;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col justify-center px-4 py-10">
      <div className="mb-8 text-center">
        <p className="display text-sm font-semibold uppercase tracking-[0.35em] text-amber-300">Draw. Guess. Score.</p>
        <h1 className="display mt-2 text-6xl font-bold text-white drop-shadow sm:text-7xl">Scribble</h1>
        <p className="mx-auto mt-3 max-w-xl text-lg text-violet-100/80">
          A room of friends, one secret word, and a canvas. Guess it before the timer runs out.
        </p>
      </div>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <form
          className="rounded-3xl border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur"
          onSubmit={(event) => {
            event.preventDefault();
            run(joinPublic);
          }}
        >
          <label className="block text-sm font-extrabold uppercase tracking-wide text-violet-100" htmlFor="username">
            Your name
          </label>
          <input
            id="username"
            value={name}
            maxLength={16}
            autoComplete="nickname"
            placeholder="Ada"
            onChange={(event) => setName(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-white/10 bg-[#120c28] px-4 py-3 text-lg text-white outline-none ring-amber-300 focus:ring-2"
          />

          <p className="mt-5 text-sm font-extrabold uppercase tracking-wide text-violet-100">Avatar color</p>
          <div className="mt-3 flex flex-wrap gap-2" role="listbox" aria-label="Avatar color">
            {AVATAR_COLORS.map((entry) => {
              const selected = entry === color;
              return (
                <button
                  key={entry}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  aria-label={`Use color ${entry}`}
                  onClick={() => setColor(entry)}
                  className="rounded-full p-1"
                  style={{ outline: selected ? "3px solid white" : "3px solid transparent" }}
                >
                  <Avatar name={name || "?"} color={entry} size={36} />
                </button>
              );
            })}
          </div>

          {shownError ? (
            <p className="mt-4 rounded-xl bg-rose-500/15 px-3 py-2 text-sm font-bold text-rose-100" role="alert">
              {shownError}
            </p>
          ) : null}

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button
              type="submit"
              disabled={!connected || busy}
              className="display inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-300 px-4 py-3 text-lg font-bold text-[#2a1760] shadow-lg disabled:opacity-50"
            >
              <Users size={20} aria-hidden="true" />
              Play public room
            </button>
            <button
              type="button"
              disabled={!connected || busy}
              onClick={() => run(createPrivate)}
              className="display inline-flex items-center justify-center gap-2 rounded-2xl bg-white/15 px-4 py-3 text-lg font-bold text-white disabled:opacity-50"
            >
              <Lock size={18} aria-hidden="true" />
              Create private room
            </button>
          </div>
          <p className="mt-3 text-center text-sm text-violet-200/70">
            {connected ? "Connected to the game server." : "Connecting to the game server…"}
          </p>
        </form>

        <aside className="flex flex-col justify-between rounded-3xl border border-white/10 bg-[#140b33]/80 p-6">
          <div>
            <h2 className="display text-2xl font-bold text-white">Join with a code</h2>
            <p className="mt-2 text-violet-100/75">Private rooms stay hidden. Ask the host for the 5-letter code.</p>
            <label className="mt-5 block text-sm font-extrabold uppercase tracking-wide text-violet-100" htmlFor="room-code">
              Room code
            </label>
            <input
              id="room-code"
              value={code}
              maxLength={5}
              placeholder="K7QMP"
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-[#120c28] px-4 py-3 text-center text-2xl font-extrabold tracking-[0.3em] text-white uppercase outline-none ring-amber-300 focus:ring-2"
            />
          </div>
          <button
            type="button"
            disabled={!connected || busy || code.trim().length < 4}
            onClick={() => run((profile) => joinCode(code.trim(), profile))}
            className="display mt-6 rounded-2xl bg-fuchsia-400 px-4 py-3 text-lg font-bold text-[#2a1760] disabled:opacity-50"
          >
            Join private room
          </button>
        </aside>
      </section>
    </main>
  );
}
