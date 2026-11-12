export default function Avatar({ name, color, size = 36 }) {
  const letter = (name || "?").slice(0, 1).toUpperCase();
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-extrabold text-white shadow-inner"
      style={{
        width: size,
        height: size,
        background: color || "#6c5ce7",
        fontSize: Math.round(size * 0.42),
        boxShadow: "inset 0 -3px 0 rgba(0,0,0,0.18)",
      }}
      aria-hidden="true"
    >
      {letter}
    </span>
  );
}
