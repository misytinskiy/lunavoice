import { getExercise, baseBounds, intervalBounds } from "./exercises";
import { LEAD_IN, noteName, type ExerciseNote } from "./pitch";

export type PracticeSettings = {
  exerciseId?: string;
  exerciseVersion?: number;
  baseMidi: number;
  bpm: number;
  fragment: { from: number; to: number } | null;
  series?: { rounds: number; step: 1 | 2 };
};
export const DEFAULT_PRACTICE: PracticeSettings = {
  exerciseId: "ladder",
  exerciseVersion: 1,
  baseMidi: 48,
  bpm: 75,
  fragment: null,
};
// Seconds: preparation stays compact regardless of the singing tempo.
const GUIDE_FIRST = 0.5;
const GUIDE_SECOND = 1;
const GUIDE_GAP = 0;
const GUIDE_TO_VOICE = 0.15;
const GUIDE_DURATION = GUIDE_FIRST + GUIDE_GAP + GUIDE_SECOND + GUIDE_TO_VOICE;
const ROUND_GAP = 0.3;
export const MIN_BASE = 36;
export const MAX_BASE = 77; // The top note remains C6, inside the detector's range.
const integer = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, Math.round(value)))
    : fallback;
export function normalizePractice(
  input: Partial<PracticeSettings> | number = DEFAULT_PRACTICE,
): PracticeSettings {
  const value =
    typeof input === "number" ? { baseMidi: (input + 1) * 12 } : input;
  const exercise = getExercise(value.exerciseId);
  const bounds = baseBounds(exercise);
  const baseMidi = integer(
    value.baseMidi,
    Math.max(bounds.min, DEFAULT_PRACTICE.baseMidi),
    bounds.min,
    bounds.max,
  );
  const step = value.series?.step === 2 ? 2 : 1;
  const rounds = integer(
    value.series?.rounds,
    8,
    1,
    Math.min(
      10,
      Math.floor(128 / exercise.notes.length),
      1 + Math.floor((bounds.max - baseMidi) / step),
    ),
  );
  const total = exercise.notes.length * (value.series ? rounds : 1);
  const from = integer(value.fragment?.from, 0, 0, total - 1);
  const to = integer(value.fragment?.to, from, from, total - 1);
  return {
    exerciseId: exercise.id,
    exerciseVersion: exercise.version,
    baseMidi,
    bpm: integer(
      value.bpm,
      exercise.defaultBpm,
      exercise.minBpm,
      exercise.maxBpm,
    ),
    fragment: value.fragment ? { from, to } : null,
    ...(value.series ? { series: { rounds, step } } : {}),
  };
}
export function practiceNotes(
  input: Partial<PracticeSettings> | number,
): ExerciseNote[] {
  const settings = normalizePractice(input);
  const exercise = getExercise(settings.exerciseId);
  const all: ExerciseNote[] = [];
  let start = LEAD_IN;
  const beat = 60 / settings.bpm;
  for (let round = 0; round < (settings.series?.rounds ?? 1); round++) {
    if (settings.series) start += GUIDE_DURATION;
    exercise.notes.forEach((note, index) => {
      const duration = (note.beats * 60) / settings.bpm;
      const result = {
        midi:
          settings.baseMidi +
          note.interval +
          round * (settings.series?.step ?? 0),
        position: round * exercise.notes.length + index,
        start,
        duration,
        syllable: note.syllable ?? exercise.syllable,
      };
      start +=
        duration +
        (settings.series && index === exercise.notes.length - 1
          ? ROUND_GAP
          : note.rest * beat);
      all.push(result);
    });
  }
  if (!settings.fragment) return all;
  const fragment = all.slice(settings.fragment.from, settings.fragment.to + 1);
  const offset = fragment[0].start - LEAD_IN;
  return fragment.map((n) => ({ ...n, start: n.start - offset }));
}
/** Accompaniment only: these notes never enter the scorer or the target staff. */
export function practiceGuideNotes(input: PracticeSettings): ExerciseNote[] {
  const settings = normalizePractice(input);
  if (!settings.series || settings.fragment) return [];
  const exercise = getExercise(settings.exerciseId),
    notes = practiceNotes(settings);
  const minor =
    exercise.id.includes("minor") ||
    (exercise.notes.some((n) => n.interval === 3) &&
      !exercise.notes.some((n) => n.interval === 4));
  return Array.from({ length: settings.series.rounds }, (_, round) => {
    let root = settings.baseMidi + round * settings.series!.step;
    // Chromatic approach: same-quality triad a semitone below the tonic,
    // then the tonic. Root follows the fitted exercise, never a fixed key.
    const third = minor ? 3 : 4;
    const intervals = [-1, third - 1, 6, 0, third, 7, 12];
    if (root + Math.min(...intervals) < MIN_BASE) root += 12;
    if (root + Math.max(...intervals) > 84) root -= 12;
    const start = notes[round * exercise.notes.length].start - GUIDE_DURATION;
    return intervals.map((interval, i) => ({
      midi: root + interval,
      start: start + (i < 3 ? 0 : GUIDE_FIRST + GUIDE_GAP),
      duration: i < 3 ? GUIDE_FIRST : GUIDE_SECOND,
    }));
  }).flat();
}
export function practiceRound(input: PracticeSettings, time: number) {
  const settings = normalizePractice(input),
    length = getExercise(settings.exerciseId).notes.length,
    notes = practiceNotes(settings);
  const round = settings.series
    ? settings.fragment
      ? Math.floor(
          (notes.findLast((n) => n.start <= time)?.position ??
            notes[0].position ??
            0) / length,
        )
      : Math.max(
          0,
          notes.findLastIndex(
            (n, i) => i % length === 0 && time >= n.start - GUIDE_DURATION,
          ) / length,
        )
    : 0;
  return {
    index: Math.floor(round),
    root: settings.baseMidi + Math.floor(round) * (settings.series?.step ?? 0),
  };
}
export function practiceDuration(notes: ExerciseNote[]) {
  const last = notes.at(-1);
  return last ? last.start + last.duration : 0;
}
export function practiceRange(settings: PracticeSettings) {
  settings = normalizePractice(settings);
  const { min, max: firstMax } = intervalBounds(
    getExercise(settings.exerciseId),
  );
  const max =
    firstMax +
    (settings.series ? (settings.series.rounds - 1) * settings.series.step : 0);
  return min === max
    ? noteName(settings.baseMidi + min)
    : `${noteName(settings.baseMidi + min)} – ${noteName(settings.baseMidi + max)}`;
}
export function pianoSampleUrl(midi: number) {
  if (!Number.isInteger(midi) || midi < 36 || midi > 84)
    throw new Error("Эта нота вне доступного диапазона звуков.");
  // C3 and C6 have a Cyrillic С in the supplied filenames.
  return `/audio/piano/${encodeURIComponent(midi === 48 ? "С3" : midi === 84 ? "С6" : noteName(midi))}.wav`;
}
/** Suggest a five-note range around one stable comfortable tone, not a vocal-range diagnosis. */
export function suggestBase(pitches: number[], exerciseId?: string) {
  const values = pitches
    .filter(Number.isFinite)
    .slice(-40)
    .sort((a, b) => a - b);
  if (values.length < 20) return null;
  const low = values[Math.floor(values.length * 0.1)],
    high = values[Math.floor(values.length * 0.9)];
  if (high - low > 1.2) return null;
  const exercise = getExercise(exerciseId),
    bounds = baseBounds(exercise),
    intervals = intervalBounds(exercise);
  return integer(
    values[Math.floor(values.length / 2)] -
      Math.round((intervals.min + intervals.max) / 2),
    bounds.min,
    bounds.min,
    bounds.max,
  );
}
