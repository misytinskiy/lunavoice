export const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];
export const LEAD_IN = 3;
export const NOTE_DURATION = 1.6;
export const NOTE_GAP = 0.3;
export const TOLERANCE = 50; // cents, half a semitone
export function noteName(midi: number) {
  return `${NOTE_NAMES[((Math.round(midi) % 12) + 12) % 12]}${Math.floor(Math.round(midi) / 12) - 1}`;
}
export function frequencyToMidi(frequency: number) {
  return 69 + 12 * Math.log2(frequency / 440);
}
export function exercise(octave: number) {
  return [0, 2, 4, 5, 7, 5, 4, 2, 0].map((offset, index) => ({
    midi: (octave + 1) * 12 + offset,
    start: LEAD_IN + index * (NOTE_DURATION + NOTE_GAP),
    duration: NOTE_DURATION,
  }));
}
export type ExerciseNote = {
  midi: number;
  start: number;
  duration: number;
  position?: number;
  syllable?: string;
};
export function matchedDuration(
  from: number,
  to: number,
  midi: number | null,
  notes: ExerciseNote[],
) {
  if (midi === null) return 0;
  return notes.reduce(
    (sum, note) =>
      sum +
      (Math.abs(midi - note.midi) * 100 <= TOLERANCE
        ? Math.max(
            0,
            Math.min(to, note.start + note.duration) -
              Math.max(from, note.start),
          )
        : 0),
    0,
  );
}

/** YIN's normalized difference separates the fundamental from its harmonics. */
export function detectPitch(
  samples: Float32Array,
  sampleRate: number,
  work: Float32Array,
  minimumRms = 0.008,
): number | null {
  let energy = 0;
  let mean = 0;
  for (const sample of samples) mean += sample;
  mean /= samples.length;
  for (const sample of samples) energy += (sample - mean) ** 2;
  if (Math.sqrt(energy / samples.length) < minimumRms) return null;
  const min = Math.floor(sampleRate / 1100);
  const max = Math.min(
    Math.floor(sampleRate / 65),
    Math.floor(samples.length / 2) - 1,
  );
  const window = samples.length - max;
  let sum = 0;
  work[0] = 1;
  for (let lag = 1; lag <= max; lag++) {
    let difference = 0;
    for (let i = 0; i < window; i++)
      difference += (samples[i] - samples[i + lag]) ** 2;
    sum += difference;
    work[lag] = sum > 0 ? (difference * lag) / sum : 1;
    const candidate = lag - 1;
    if (
      candidate >= min &&
      work[candidate] < 0.12 &&
      work[lag] >= work[candidate]
    ) {
      const left = work[candidate - 1],
        center = work[candidate],
        right = work[lag];
      const denominator = 2 * (2 * center - right - left);
      const adjustment = denominator === 0 ? 0 : (right - left) / denominator;
      return sampleRate / (candidate + Math.max(-1, Math.min(1, adjustment)));
    }
  }
  return null;
}
