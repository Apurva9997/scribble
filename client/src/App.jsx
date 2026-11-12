import GameView from "./components/GameView.jsx";
import Landing from "./components/Landing.jsx";
import { SocketProvider, useGame } from "./socket/SocketProvider.jsx";

function Shell() {
  const { room } = useGame();
  if (!room) return <Landing />;
  return <GameView />;
}

export default function App() {
  return (
    <SocketProvider>
      <Shell />
    </SocketProvider>
  );
}
