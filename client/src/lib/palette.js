export const PALETTE = [
  "#ffffff",
  "#c1c1c1",
  "#ef130b",
  "#ff7100",
  "#ffe400",
  "#00cc00",
  "#00b2ff",
  "#231fd3",
  "#a300ba",
  "#d37caa",
  "#a0522d",
  "#000000",
  "#4c4c4c",
  "#740b07",
  "#c23800",
  "#e5c900",
];

export const AVATAR_COLORS = [
  "#e74c3c",
  "#e67e22",
  "#f1c40f",
  "#2ecc71",
  "#1abc9c",
  "#3498db",
  "#9b59b6",
  "#e84393",
  "#fd79a8",
  "#00cec9",
  "#6c5ce7",
  "#d35400",
];

export const BRUSH_SIZES = [
  { id: "s", label: "Small", size: 2 },
  { id: "m", label: "Medium", size: 6 },
  { id: "l", label: "Large", size: 12 },
  { id: "xl", label: "Extra large", size: 22 },
];

export const ERASER_SIZE = 28;

export function loadProfile() {
  try {
    const raw = localStorage.getItem("scribble-profile");
    if (!raw) return { name: "", color: AVATAR_COLORS[0] };
    const parsed = JSON.parse(raw);
    return {
      name: typeof parsed.name === "string" ? parsed.name.slice(0, 16) : "",
      color: AVATAR_COLORS.includes(parsed.color) ? parsed.color : AVATAR_COLORS[0],
    };
  } catch {
    return { name: "", color: AVATAR_COLORS[0] };
  }
}

export function saveProfile(profile) {
  localStorage.setItem("scribble-profile", JSON.stringify(profile));
}
