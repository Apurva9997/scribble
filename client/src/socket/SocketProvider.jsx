import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";

const SocketContext = createContext(null);

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";

export function SocketProvider({ children }) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState("");
  const [turnResult, setTurnResult] = useState(null);
  const [gameOver, setGameOver] = useState(null);
  const [drawHistory, setDrawHistory] = useState([]);

  useEffect(() => {
    const socket = io(SERVER_URL, {
      transports: ["websocket", "polling"],
      autoConnect: true,
    });
    socketRef.current = socket;

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onState = (snapshot) => {
      setRoom(snapshot);
      setError("");
      if (snapshot.phase !== "TURN_END") setTurnResult(null);
      if (snapshot.phase !== "GAME_OVER") setGameOver(null);
      if (snapshot.phase === "LOBBY") {
        setMessages([]);
        setDrawHistory([]);
      }
      if (Array.isArray(snapshot.strokes) && snapshot.strokes.length) {
        setDrawHistory(snapshot.strokes);
      }
    };
    const onHistory = (strokes) => setDrawHistory(Array.isArray(strokes) ? strokes : []);
    const onChat = (message) => {
      setMessages((current) => [...current.slice(-200), message]);
    };
    const onPrivate = (message) => {
      setMessages((current) => [...current.slice(-200), { ...message, private: true }]);
    };
    const onTurnEnd = (payload) => setTurnResult(payload);
    const onGameOver = (payload) => setGameOver(payload);
    const onError = (payload) => setError(payload?.error || "Unable to start the game.");
    const onClock = ({ serverNow, endsAt }) => {
      setRoom((current) => (current ? { ...current, serverNow, endsAt: endsAt ?? current.endsAt } : current));
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("room:state", onState);
    socket.on("chat:message", onChat);
    socket.on("chat:private", onPrivate);
    socket.on("turn:end", onTurnEnd);
    socket.on("game:over", onGameOver);
    socket.on("game:error", onError);
    socket.on("clock", onClock);
    socket.on("draw:history", onHistory);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("room:state", onState);
      socket.off("chat:message", onChat);
      socket.off("chat:private", onPrivate);
      socket.off("turn:end", onTurnEnd);
      socket.off("game:over", onGameOver);
      socket.off("game:error", onError);
      socket.off("clock", onClock);
      socket.off("draw:history", onHistory);
      socket.disconnect();
    };
  }, []);

  const api = useMemo(() => {
    const emitAck = (event, payload) =>
      new Promise((resolve) => {
        const socket = socketRef.current;
        if (!socket) {
          resolve({ ok: false, error: "Not connected." });
          return;
        }
        socket.emit(event, payload, (response) => resolve(response || { ok: true }));
      });

    return {
      joinPublic: (profile) => emitAck("room:join", { public: true, ...profile }),
      createPrivate: (profile) => emitAck("room:join", { create: true, public: false, ...profile }),
      joinCode: (code, profile) => emitAck("room:join", { code, ...profile }),
      leave: () => {
        socketRef.current?.emit("room:leave");
        setRoom(null);
        setMessages([]);
        setTurnResult(null);
        setGameOver(null);
      },
      updateSettings: (patch) => emitAck("lobby:settings", patch),
      updateProfile: (profile) => emitAck("lobby:profile", profile),
      startGame: () => emitAck("game:start", {}),
      pickWord: (word) => emitAck("word:pick", { word }),
      sendChat: (text) => emitAck("chat:send", { text }),
      stroke: (stroke) => socketRef.current?.emit("draw:stroke", stroke),
      undo: () => socketRef.current?.emit("draw:undo"),
      clear: () => socketRef.current?.emit("draw:clear"),
      onStroke: (handler) => {
        socketRef.current?.on("draw:stroke", handler);
        return () => socketRef.current?.off("draw:stroke", handler);
      },
      onUndo: (handler) => {
        socketRef.current?.on("draw:undo", handler);
        return () => socketRef.current?.off("draw:undo", handler);
      },
      onClear: (handler) => {
        socketRef.current?.on("draw:clear", handler);
        return () => socketRef.current?.off("draw:clear", handler);
      },
      clearError: () => setError(""),
    };
  }, []);

  const value = {
    connected,
    room,
    messages,
    error,
    turnResult,
    gameOver,
    drawHistory,
    ...api,
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useGame() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error("useGame must be used inside SocketProvider");
  return ctx;
}
