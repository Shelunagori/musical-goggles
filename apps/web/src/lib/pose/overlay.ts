import { LM, type Landmark } from '@mg/pose-engine';
const EDGES = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
  [27, 29],
  [29, 31],
  [28, 30],
  [30, 32],
];
export function drawOverlay(
  canvas: HTMLCanvasElement,
  landmarks: readonly Landmark[],
  width: number,
  height: number,
) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = '#4ade80';
  ctx.fillStyle = '#f0abfc';
  ctx.lineWidth = Math.max(2, width / 300);
  const visible = (index: number) => {
    const p = landmarks[index];
    return p && (p.visibility ?? 0) >= 0.65 ? p : null;
  };
  for (const [a, b] of EDGES) {
    const p = visible(a ?? -1),
      q = visible(b ?? -1);
    if (!p || !q) continue;
    ctx.beginPath();
    ctx.moveTo(p.x * width, p.y * height);
    ctx.lineTo(q.x * width, q.y * height);
    ctx.stroke();
  }
  for (const index of Object.values(LM)) {
    const p = visible(index);
    if (!p) continue;
    ctx.beginPath();
    ctx.arc(p.x * width, p.y * height, Math.max(3, width / 180), 0, Math.PI * 2);
    ctx.fill();
  }
}
