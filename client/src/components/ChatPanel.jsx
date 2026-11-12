import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { useGame } from "../socket/SocketProvider.jsx";

const TONE = {
  guess: "bg-emerald-400/20 text-emerald-100",
  close: "bg-amber-300/20 text-amber-100",
  reveal: "bg-fuchsia-400/20 text-fuchsia-50",
  warn: "bg-rose-400/15 text-rose-100",
  info: "bg-white/10 text-violet-100",
};

export default function ChatPanel({ disabled }) {
  const { messages, sendChat, room } = useGame();
  const [text, setText] = useState("");
  const scroller = useRef(null);
  const drawer = room?.players?.find((player) => player.isDrawer);

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages]);

  async function submit(event) {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    setText("");
    await sendChat(value);
  }

  return (
    <aside className="flex h-full min-h-0 flex-col rounded-3xl border border-white/10 bg-[#140b33]/80">
      <header className="border-b border-white/10 px-4 py-3">
        <h2 className="display text-lg font-bold text-white">Chat</h2>
        <p className="text-xs font-bold text-violet-200/70">
          {room?.phase === "DRAWING" && !room?.you?.isDrawer
            ? "Type the word to guess it."
            : "Talk with the room."}
        </p>
      </header>
      <div ref={scroller} className="chat-scroll flex-1 space-y-2 overflow-y-auto p-3" aria-live="polite">
        {messages.length === 0 ? (
          <p className="rounded-2xl bg-white/5 px-3 py-4 text-sm text-violet-100/70">
            Guesses and messages show up here. A correct guess stays hidden from the chat.
          </p>
        ) : null}
        {messages.map((message) => {
          if (message.kind === "system") {
            return (
              <p key={message.id} className={`rounded-xl px-3 py-2 text-sm font-extrabold ${TONE[message.tone] || TONE.info}`}>
                {message.text}
              </p>
            );
          }
          return (
            <p key={message.id} className="rounded-xl bg-white/5 px-3 py-2 text-sm">
              <span className="font-extrabold" style={{ color: message.color }}>
                {message.name}
              </span>
              {message.guessedOnly ? <span className="ml-1 text-xs text-emerald-200">guessed</span> : null}
              <span className="text-white">: {message.text}</span>
            </p>
          );
        })}
      </div>
      <form onSubmit={submit} className="border-t border-white/10 p-3">
        <label className="sr-only" htmlFor="guess">
          {room?.you?.isDrawer ? "Chat message" : "Guess or chat message"}
        </label>
        <div className="flex gap-2">
          <input
            id="guess"
            value={text}
            maxLength={80}
            disabled={disabled}
            placeholder={room?.you?.isDrawer ? "You are drawing" : drawer ? `Guess ${drawer.name}'s word` : "Say something"}
            onChange={(event) => setText(event.target.value)}
            className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-[#120c28] px-3 py-2 text-white outline-none ring-amber-300 focus:ring-2 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={disabled || !text.trim()}
            className="inline-flex items-center justify-center rounded-2xl bg-amber-300 px-3 text-[#2a1760] disabled:opacity-40"
            aria-label="Send message"
          >
            <Send size={18} aria-hidden="true" />
          </button>
        </div>
      </form>
    </aside>
  );
}
