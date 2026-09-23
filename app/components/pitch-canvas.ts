import { t } from "../lib/i18n";
import { noteName, type ExerciseNote } from "../lib/pitch";
import type { VoicePoint } from "../lib/audio/engine";
export function drawStaff(
  canvas: HTMLCanvasElement,
  time: number,
  notes: ExerciseNote[],
  history: VoicePoint[],
  base: number,
  fontFamily = "monospace",
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width, height } = canvas.getBoundingClientRect();
  if (!width || !height) return;
  const dpr = window.devicePixelRatio || 1;
  if (
    canvas.width !== Math.round(width * dpr) ||
    canvas.height !== Math.round(height * dpr)
  ) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const high = base + 12,
    low = base - 5;
  const step = (height - 62) / (high - low);
  const y = (midi: number) => 31 + (high - midi) * step;
  const cursor = width < 600 ? 110 : Math.min(230, width * 0.24);
  const speed = width < 600 ? 76 : 112;
  const current = notes.find(
    (n) => time >= n.start && time < n.start + n.duration,
  );
  for (let midi = high; midi >= low; midi--) {
    const active = current?.midi === midi;
    ctx.fillStyle = active
      ? "#283224"
      : midi % 12 === 0
        ? "#202426"
        : "#1c2022";
    ctx.fillRect(0, y(midi) - step / 2, width, step);
    ctx.strokeStyle = "#303638";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(64, y(midi));
    ctx.lineTo(width, y(midi));
    ctx.stroke();
    ctx.font = `${active ? 500 : 400} ${midi % 12 === 0 ? 13 : 12}px ${fontFamily}`;
    ctx.fillStyle = active
      ? "#d4f77d"
      : midi % 12 === 0
        ? "#e1e4e5"
        : "#9da5aa";
    ctx.fillText(noteName(midi).replace("#", "♯"), 22, y(midi) + 4);
  }
  ctx.strokeStyle = "#2c3234";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 5]);
  for (let x = cursor + 120; x < width; x += 120) {
    ctx.beginPath();
    ctx.moveTo(x, 14);
    ctx.lineTo(x, height - 14);
    ctx.stroke();
  }
  ctx.setLineDash([5, 7]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#e1e5df";
  ctx.beginPath();
  ctx.moveTo(cursor, 14);
  ctx.lineTo(cursor, height - 14);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.save();
  ctx.beginPath();
  ctx.rect(65, 0, width - 65, height);
  ctx.clip();
  for (const note of notes) {
    const x = cursor + (note.start - time) * speed;
    const w = note.duration * speed;
    if (x > width || x + w < 65) continue;
    const active = note === current;
    const past = time >= note.start + note.duration;
    const h = Math.min(28, step * 0.8);
    ctx.fillStyle = active ? "#e1ffa3" : past ? "#48553b" : "#d4f77d";
    ctx.beginPath();
    ctx.roundRect(x, y(note.midi) - h / 2, w, h, 7);
    ctx.fill();
    ctx.fillStyle = past ? "#c0cbb3" : "#202818";
    ctx.font = `500 11px ${fontFamily}`;
    ctx.fillText(t(note.syllable ?? "Ма"), x + 12, y(note.midi) + 4);
    ctx.fillStyle = past ? "#a5b198" : "#43552d";
    ctx.textAlign = "right";
    ctx.fillText(noteName(note.midi), x + w - 12, y(note.midi) + 4);
    ctx.textAlign = "left";
  }
  for (let i = 1; i < history.length; i++) {
    const a = history[i - 1],
      b = history[i];
    if (a.midi === null || b.midi === null || b.time - a.time > 0.15) continue;
    const x = cursor + (a.time - time) * speed;
    if (x < 60) continue;
    ctx.strokeStyle = b.hit ? "#85f4b1" : "#efbc83";
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, y(a.midi));
    ctx.lineTo(cursor + (b.time - time) * speed, y(b.midi));
    ctx.stroke();
  }
  const last = history.at(-1);
  if (last?.midi != null && time - last.time < 1.2) {
    ctx.fillStyle = last.hit ? "#85f4b1" : "#efbc83";
    ctx.shadowBlur = 12;
    ctx.shadowColor = ctx.fillStyle;
    ctx.beginPath();
    ctx.arc(
      cursor + (last.time - time) * speed,
      Math.max(9, Math.min(height - 9, y(last.midi))),
      5,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();
}
