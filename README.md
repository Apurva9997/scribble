# Scribble

Open-source multiplayer drawing and guessing game. One player draws, everyone else guesses, and the server owns the rules.

**Play it:** https://scribble-draw.netlify.app

The live site serves the client. Multiplayer needs the Socket.io server from `/server` as well. Set `VITE_SERVER_URL` on Netlify to that server's public URL, then redeploy. Until that variable is set, the page connects to `http://localhost:3001`.

## License

MIT. See [LICENSE](LICENSE).

## Run it

Requires Node.js 20 or newer.

```bash
npm run install:all
npm run dev
```

`npm run dev` starts both processes with `concurrently`:

- Game server at [http://localhost:3001](http://localhost:3001)
- React client at [http://localhost:5173](http://localhost:5173)

Open the client in two browser windows. One player creates a private room and shares the code. The other joins with that code. The host starts the game once two people are connected.

To point the client at another server, set `VITE_SERVER_URL`. To allow extra browser origins, set `CLIENT_ORIGIN` (comma-separated) on the server.

## How a round works

1. **Lobby.** Players pick a name and avatar color. The host sets rounds (default 3), draw time (default 80 seconds), and optional custom words.
2. **Word selection.** The drawer privately receives 3 words and has 15 seconds to pick one. If the timer ends, the server picks.
3. **Drawing.** Guessers see a letter mask. Hints open at 50% and 25% time remaining. An exact guess is hidden from chat, scored from remaining time, and announced in green. A one-letter miss gets a private “very close” notice. The turn ends early when every guesser is correct.
4. **Turn end.** The word and score changes stay up for 5 seconds, then the pencil moves to the next player.
5. **Game over.** After the last round, the top 3 stand on the podium for 10 seconds, then the room returns to the lobby.

Drawings are stored as normalized coordinates (`0` to `1`) plus fill and undo commands, so a late joiner replays the current turn at any screen size.

## Layout

```
/server   Express + Socket.io game authority (in-memory rooms)
/client   Vite + React + Tailwind canvas client
```
