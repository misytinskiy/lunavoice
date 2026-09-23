import { baseBounds, getExercise, intervalBounds } from "./exercises";
import { normalizePractice, type PracticeSettings } from "./practice";

export type VoiceRange = { low: number; high: number };
export const rangeKey = (owner?: string) =>
  `lunavoice.voice-range.v1-${owner ?? "guest"}`;
export function readVoiceRange(owner?: string): VoiceRange | null {
  try {
    const value = JSON.parse(localStorage.getItem(rangeKey(owner)) ?? "null");
    return validRange(value) ? value : null;
  } catch {
    return null;
  }
}
export function validRange(value: unknown): value is VoiceRange {
  if (!value || typeof value !== "object") return false;
  const r = value as VoiceRange;
  return (
    Number.isInteger(r.low) &&
    Number.isInteger(r.high) &&
    r.low >= 36 &&
    r.high <= 96 &&
    r.high > r.low
  );
}
/** Two consecutive seconds of a stable tone; silence, gaps and glides reset capture. */
export class RangeCapture {
  private samples: { time: number; midi: number }[] = [];
  add(time: number, midi: number | null) {
    const last = this.samples.at(-1);
    if (midi === null || !Number.isFinite(midi) || midi < 36 || midi > 96) {
      this.samples = [];
      return null;
    }
    if (
      last &&
      (time - last.time > 200 ||
        time <= last.time ||
        Math.abs(midi - last.midi) > 1)
    )
      this.samples = [];
    this.samples.push({ time, midi });
    while (this.samples.length && time - this.samples[0].time > 2400)
      this.samples.shift();
    if (this.samples.length < 20 || time - this.samples[0].time < 1900)
      return null;
    const sorted = this.samples.map((s) => s.midi).sort((a, b) => a - b);
    if (
      sorted[Math.floor(sorted.length * 0.9)] -
        sorted[Math.floor(sorted.length * 0.1)] >
      0.8
    )
      return null;
    return Math.round(sorted[Math.floor(sorted.length / 2)]);
  }
}
/** Leave one semitone at each measured edge, then fit the complete melody. */
export function fitVoiceRange(
  input: PracticeSettings,
  range: VoiceRange,
): PracticeSettings | null {
  if (!validRange(range)) return null;
  const e = getExercise(input.exerciseId),
    intervals = intervalBounds(e),
    bounds = baseBounds(e);
  const first = Math.max(bounds.min, range.low + 1 - intervals.min);
  const last = Math.min(bounds.max, range.high - 1 - intervals.max);
  if (first > last) return null;
  const step = input.series?.step ?? 1;
  const rounds = Math.min(
    10,
    Math.floor(128 / e.notes.length),
    1 + Math.floor((last - first) / step),
  );
  return normalizePractice({
    ...input,
    baseMidi: first,
    fragment: null,
    series: { rounds, step },
  });
}
