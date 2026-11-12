import { useEffect, useRef, useState } from "react";
import { applyCommand, createBoard, pointerToNorm, replayHistory, resetBoard } from "../lib/draw.js";
import { ERASER_SIZE } from "../lib/palette.js";
import { useGame } from "../socket/SocketProvider.jsx";
import Toolbar from "./Toolbar.jsx";

export default function CanvasStage() {
  const { room, stroke, undo, clear, onStroke, onUndo, onClear, drawHistory } = useGame();
  const viewRef = useRef(null);
  const boardRef = useRef(null);
  const drawing = useRef(null);
  const [tool, setTool] = useState("brush");
  const [color, setColor] = useState("#000000");
  const [size, setSize] = useState(6);
  const historyKey = `${room?.round}-${room?.drawerId}-${room?.phase}`;
  const strokesRef = useRef(drawHistory);
  strokesRef.current = drawHistory;

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return undefined;
    const board = createBoard();
    boardRef.current = board;
    const paint = () => {
      const ctx = view.getContext("2d");
      ctx.clearRect(0, 0, view.width, view.height);
      ctx.drawImage(board.canvas, 0, 0, view.width, view.height);
    };
    const resize = () => {
      const rect = view.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      view.width = Math.max(1, Math.floor(rect.width * dpr));
      view.height = Math.max(1, Math.floor(rect.height * dpr));
      paint();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(view);
    board.paint = paint;
    replayHistory(board, strokesRef.current);
    paint();
    return () => observer.disconnect();
  }, [historyKey]);

  useEffect(() => {
    const board = boardRef.current;
    if (!board || drawing.current) return;
    replayHistory(board, drawHistory);
    board.paint?.();
  }, [drawHistory]);

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return undefined;
    const offStroke = onStroke((command) => {
      if (command?.type === "undo") return;
      applyCommand(board, command);
      board.paint?.();
    });
    const offUndo = onUndo(() => {});
    const offClear = onClear(() => {
      if (drawing.current) return;
      resetBoard(board);
      board.paint?.();
    });
    return () => {
      offStroke?.();
      offUndo?.();
      offClear?.();
    };
  }, [onStroke, onUndo, onClear, historyKey]);

  function commitLocal(command) {
    const board = boardRef.current;
    if (!board) return;
    applyCommand(board, command);
    board.paint?.();
  }

  function startDraw(event) {
    if (!room?.canDraw) return;
    event.preventDefault();
    const view = viewRef.current;
    const point = pointerToNorm(view, event);
    view.setPointerCapture?.(event.pointerId);
    if (tool === "fill") {
      const command = { type: "fill", x: point.x, y: point.y, color };
      commitLocal(command);
      stroke(command);
      return;
    }
    const command = {
      type: "stroke",
      color,
      size: tool === "eraser" ? ERASER_SIZE : size,
      erase: tool === "eraser",
      points: [point],
    };
    drawing.current = command;
    commitLocal(command);
  }

  function moveDraw(event) {
    if (!drawing.current || !room?.canDraw) return;
    event.preventDefault();
    const point = pointerToNorm(viewRef.current, event);
    const last = drawing.current.points[drawing.current.points.length - 1];
    const dx = point.x - last.x;
    const dy = point.y - last.y;
    if (dx * dx + dy * dy < 0.00002) return;
    drawing.current.points.push(point);
    commitLocal({ ...drawing.current, points: drawing.current.points.slice(-2) });
  }

  function endDraw(event) {
    if (!drawing.current) return;
    event?.preventDefault?.();
    const command = drawing.current;
    drawing.current = null;
    if (command.points.length === 0) return;
    stroke(command);
  }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="relative mx-auto aspect-[4/3] w-full max-w-[800px] overflow-hidden rounded-3xl bg-white shadow-2xl ring-4 ring-white/80">
        <canvas
          ref={viewRef}
          className={`h-full w-full ${room?.canDraw ? "cursor-crosshair" : "cursor-default"}`}
          onPointerDown={startDraw}
          onPointerMove={moveDraw}
          onPointerUp={endDraw}
          onPointerCancel={endDraw}
        />
        {!room?.canDraw && room?.phase === "DRAWING" ? (
          <p className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/50 px-3 py-1 text-xs font-bold text-white">
            Watch and guess
          </p>
        ) : null}
      </div>
      {room?.canDraw ? (
        <Toolbar
          tool={tool}
          setTool={setTool}
          color={color}
          setColor={setColor}
          size={size}
          setSize={setSize}
          onUndo={undo}
          onClear={() => {
            commitLocal({ type: "clear" });
            clear();
          }}
        />
      ) : (
        <p className="rounded-2xl bg-white/5 px-4 py-3 text-center text-sm font-bold text-violet-100/80">
          Tools appear when it is your turn to draw.
        </p>
      )}
    </div>
  );
}
