const INTERNAL_WIDTH = 800;
const INTERNAL_HEIGHT = 600;

export function createBoard() {
  const canvas = document.createElement("canvas");
  canvas.width = INTERNAL_WIDTH;
  canvas.height = INTERNAL_HEIGHT;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  return { canvas, ctx, width: INTERNAL_WIDTH, height: INTERNAL_HEIGHT };
}

export function resetBoard(board) {
  board.ctx.globalCompositeOperation = "source-over";
  board.ctx.fillStyle = "#ffffff";
  board.ctx.fillRect(0, 0, board.width, board.height);
}

function tracePoints(ctx, points, width, height) {
  if (!points.length) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x * width, points[0].y * height);
  if (points.length === 1) {
    ctx.lineTo(points[0].x * width + 0.01, points[0].y * height + 0.01);
  } else {
    for (let i = 1; i < points.length; i += 1) {
      ctx.lineTo(points[i].x * width, points[i].y * height);
    }
  }
  ctx.stroke();
}

export function drawStroke(board, stroke) {
  const { ctx, width, height } = board;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (stroke.erase) {
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "rgba(0,0,0,1)";
    ctx.lineWidth = stroke.size || 28;
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = stroke.color || "#000000";
    ctx.lineWidth = stroke.size || 6;
  }
  tracePoints(ctx, stroke.points || [], width, height);
  ctx.restore();
}

function colorMatch(data, index, target, tolerance = 18) {
  return (
    Math.abs(data[index] - target[0]) <= tolerance &&
    Math.abs(data[index + 1] - target[1]) <= tolerance &&
    Math.abs(data[index + 2] - target[2]) <= tolerance &&
    Math.abs(data[index + 3] - target[3]) <= tolerance
  );
}

function hexToRgba(hex) {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
    255,
  ];
}

/**
 * Iterative flood fill over the canvas pixel buffer.
 * Coordinates are normalized [0, 1].
 */
export function floodFill(board, xNorm, yNorm, hex) {
  const { ctx, width, height } = board;
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const startX = Math.min(width - 1, Math.max(0, Math.floor(xNorm * width)));
  const startY = Math.min(height - 1, Math.max(0, Math.floor(yNorm * height)));
  const start = (startY * width + startX) * 4;
  const target = [data[start], data[start + 1], data[start + 2], data[start + 3]];
  const fill = hexToRgba(hex);
  if (
    target[0] === fill[0] &&
    target[1] === fill[1] &&
    target[2] === fill[2] &&
    target[3] === fill[3]
  ) {
    return;
  }

  const stack = [[startX, startY]];
  const seen = new Uint8Array(width * height);
  let guard = 0;
  const maxPixels = width * height;

  while (stack.length && guard < maxPixels) {
    const [x, y] = stack.pop();
    const pixelIndex = y * width + x;
    if (seen[pixelIndex]) continue;
    const offset = pixelIndex * 4;
    if (!colorMatch(data, offset, target)) continue;
    seen[pixelIndex] = 1;
    data[offset] = fill[0];
    data[offset + 1] = fill[1];
    data[offset + 2] = fill[2];
    data[offset + 3] = fill[3];
    guard += 1;
    if (x > 0) stack.push([x - 1, y]);
    if (x < width - 1) stack.push([x + 1, y]);
    if (y > 0) stack.push([x, y - 1]);
    if (y < height - 1) stack.push([x, y + 1]);
  }
  ctx.putImageData(image, 0, 0);
}

export function applyCommand(board, command) {
  if (!command) return;
  if (command.type === "clear") {
    resetBoard(board);
    return;
  }
  if (command.type === "fill") {
    floodFill(board, command.x, command.y, command.color);
    return;
  }
  if (command.type === "stroke") {
    drawStroke(board, command);
  }
}

export function replayHistory(board, history) {
  resetBoard(board);
  const stack = [];
  for (const command of history) {
    if (command.type === "undo") {
      stack.pop();
      continue;
    }
    stack.push(command);
  }
  resetBoard(board);
  for (const command of stack) applyCommand(board, command);
}

export function pointerToNorm(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  const point = event.touches ? event.touches[0] : event;
  const clientX = point.clientX;
  const clientY = point.clientY;
  const x = (clientX - rect.left) / rect.width;
  const y = (clientY - rect.top) / rect.height;
  return {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y)),
  };
}
