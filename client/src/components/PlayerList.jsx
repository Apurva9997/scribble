import { Crown, Pencil } from "lucide-react";
import Avatar from "./Avatar.jsx";

export default function PlayerList({ players = [] }) {
  return (
    <aside className="flex h-full min-h-0 flex-col rounded-3xl border border-white/10 bg-[#140b33]/80">
      <header className="border-b border-white/10 px-4 py-3">
        <h2 className="display text-lg font-bold text-white">Players</h2>
        <p className="text-xs font-bold uppercase tracking-wide text-violet-200/70">{players.length} in the room</p>
      </header>
      <ol className="chat-scroll flex-1 space-y-2 overflow-y-auto p-3">
        {players.map((player, index) => (
          <li
            key={player.id}
            className={`flex items-center gap-3 rounded-2xl px-3 py-2 ${
              player.guessed ? "bg-emerald-400/20 ring-1 ring-emerald-300/40" : "bg-white/5"
            } ${player.connected ? "" : "opacity-50"}`}
          >
            <span className="w-5 text-center text-sm font-extrabold text-amber-200">{index + 1}</span>
            <Avatar name={player.name} color={player.color} size={34} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1 truncate font-extrabold text-white">
                {player.name}
                {player.isYou ? <span className="text-xs font-bold text-violet-200">(you)</span> : null}
                {player.isHost ? <Crown size={14} className="text-amber-300" aria-label="Host" /> : null}
                {player.isDrawer ? <Pencil size={14} className="text-sky-300" aria-label="Drawing" /> : null}
              </p>
              <p className="text-xs font-bold text-violet-200/80">
                {player.guessed ? "Guessed" : player.connected ? "In the room" : "Reconnecting"}
              </p>
            </div>
            <span className="display text-lg font-bold text-amber-200">{player.score}</span>
          </li>
        ))}
      </ol>
    </aside>
  );
}
