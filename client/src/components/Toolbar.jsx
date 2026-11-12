import { Eraser, PaintBucket, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { BRUSH_SIZES, PALETTE } from "../lib/palette.js";

export default function Toolbar({ tool, setTool, color, setColor, size, setSize, onUndo, onClear }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-[#140b33]/90 p-2">
      <div className="flex gap-1" role="toolbar" aria-label="Drawing tools">
        <ToolButton label="Brush" active={tool === "brush"} onClick={() => setTool("brush")}>
          <Pencil size={18} aria-hidden="true" />
        </ToolButton>
        <ToolButton label="Fill" active={tool === "fill"} onClick={() => setTool("fill")}>
          <PaintBucket size={18} aria-hidden="true" />
        </ToolButton>
        <ToolButton label="Eraser" active={tool === "eraser"} onClick={() => setTool("eraser")}>
          <Eraser size={18} aria-hidden="true" />
        </ToolButton>
        <ToolButton label="Undo stroke" onClick={onUndo}>
          <RotateCcw size={18} aria-hidden="true" />
        </ToolButton>
        <ToolButton label="Clear canvas" onClick={onClear}>
          <Trash2 size={18} aria-hidden="true" />
        </ToolButton>
      </div>
      <div className="flex gap-1" aria-label="Brush size">
        {BRUSH_SIZES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-label={entry.label}
            aria-pressed={size === entry.size && tool !== "eraser"}
            onClick={() => {
              setSize(entry.size);
              if (tool === "eraser") setTool("brush");
            }}
            className={`flex h-9 w-9 items-center justify-center rounded-xl ${
              size === entry.size && tool !== "eraser" ? "bg-white text-[#2a1760]" : "bg-white/10 text-white"
            }`}
          >
            <span className="rounded-full bg-current" style={{ width: Math.max(4, entry.size / 1.4), height: Math.max(4, entry.size / 1.4) }} />
          </button>
        ))}
      </div>
      <div className="grid grid-cols-8 gap-1" role="group" aria-label="Colors">
        {PALETTE.map((entry) => (
          <button
            key={entry}
            type="button"
            aria-label={`Paint with ${entry}`}
            aria-pressed={color === entry}
            onClick={() => setColor(entry)}
            className="h-7 w-7 rounded-full border border-black/30"
            style={{
              background: entry,
              outline: color === entry ? "2px solid white" : "2px solid transparent",
              outlineOffset: 1,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function ToolButton({ label, active, onClick, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${
        active ? "bg-amber-300 text-[#2a1760]" : "bg-white/10 text-white"
      }`}
    >
      {children}
    </button>
  );
}
