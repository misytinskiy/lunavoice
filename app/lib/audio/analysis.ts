import { detectPitch, frequencyToMidi, type ExerciseNote } from "../pitch";

export const SCORE_VERSION = "pitch-time-v2";
export const MAX_OBSERVATION_SECONDS = 0.06;
export type SignalState =
  | "silence"
  | "quiet"
  | "clipping"
  | "unstable"
  | "voiced";
export type Reading = {
  rms: number;
  db: number;
  peak: number;
  midi: number | null;
  state: SignalState;
};
export function amplitudeToDb(value: number) {
  return Math.max(-100, 20 * Math.log10(Math.max(value, 0.00001)));
}
export function dbToAmplitude(db: number) {
  return 10 ** (db / 20);
}
export function measureSignal(samples: Float32Array) {
  let mean = 0,
    energy = 0,
    peak = 0,
    clipped = 0;
  for (const sample of samples) {
    mean += sample;
    peak = Math.max(peak, Math.abs(sample));
    if (Math.abs(sample) >= 0.98) clipped++;
  }
  mean /= samples.length;
  for (const sample of samples) energy += (sample - mean) ** 2;
  const rms = Math.sqrt(energy / samples.length);
  return {
    rms,
    db: amplitudeToDb(rms),
    peak,
    clipped: clipped / samples.length > 0.01,
  };
}

/** A suspected octave jump must persist. Pending frames are unvoiced, never the old note. */
export class PitchTracker {
  private previous: number | null = null;
  private candidate: number | null = null;
  private count = 0;
  private missing = 0;
  reset() {
    this.previous = this.candidate = null;
    this.count = this.missing = 0;
  }
  accept(midi: number | null) {
    if (midi === null) {
      if (++this.missing >= 3) this.reset();
      return null;
    }
    this.missing = 0;
    if (
      this.previous !== null &&
      Math.abs(Math.abs(midi - this.previous) - 12) < 1
    ) {
      this.count =
        this.candidate !== null && Math.abs(this.candidate - midi) < 0.6
          ? this.count + 1
          : 1;
      this.candidate = midi;
      if (this.count < 3) return null;
    }
    this.previous = midi;
    this.candidate = null;
    this.count = 0;
    return midi;
  }
}
/** Cosmetic smoothing only. Score always uses the accepted, unsmoothed reading. */
export class VisualPitch {
  private value: number | null = null;
  update(midi: number | null) {
    if (midi === null) return (this.value = null);
    this.value =
      this.value === null || Math.abs(midi - this.value) > 2
        ? midi
        : this.value + (midi - this.value) * 0.55;
    return this.value;
  }
}
export function analyse(
  samples: Float32Array,
  sampleRate: number,
  work: Float32Array,
  thresholdDb: number,
  tracker: PitchTracker,
): Reading {
  const signal = measureSignal(samples);
  let state: SignalState = signal.clipped
    ? "clipping"
    : signal.db < -75
      ? "silence"
      : signal.db < thresholdDb
        ? "quiet"
        : "unstable";
  const frequency =
    state === "unstable"
      ? detectPitch(samples, sampleRate, work, dbToAmplitude(thresholdDb))
      : null;
  const midi = tracker.accept(
    frequency === null ? null : frequencyToMidi(frequency),
  );
  if (midi !== null) state = "voiced";
  return { ...signal, midi, state };
}
export function calibrateNoise(
  readings: Pick<Reading, "db" | "midi" | "state">[],
) {
  if (readings.length < 35)
    throw new Error("Недостаточно звука для настройки. Повторите измерение.");
  if (
    readings.some((r) => r.state === "clipping") ||
    readings.filter((r) => r.midi !== null).length > readings.length * 0.1
  )
    throw new Error(
      "Во время измерения слышен тон или слишком громкий звук. Помолчите и повторите.",
    );
  const sorted = readings.map((r) => r.db).sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.9)];
  if (floor > -30)
    throw new Error(
      "Слишком шумно для точной настройки. Найдите более тихое место и повторите.",
    );
  return {
    noiseFloorDb: Math.round(floor),
    thresholdDb: Math.round(Math.max(-60, Math.min(-20, floor + 10))),
  };
}
export type NoteResult = {
  position: number;
  midi: number;
  duration: number;
  matchedSeconds: number;
  observedSeconds: number;
  voicedSeconds: number;
  aboveSeconds: number;
  belowSeconds: number;
  percent: number;
  voicedPercent: number;
  meanCents: number | null;
  meanAbsoluteCents: number | null;
};
export class PitchScore {
  private last: number | null = null;
  private highWater = -Infinity;
  private details: {
    matched: number;
    observed: number;
    voiced: number;
    above: number;
    below: number;
    cents: number;
    absoluteCents: number;
  }[];
  matched = 0;
  observed = 0;
  constructor(readonly notes: ExerciseNote[]) {
    this.details = notes.map(() => ({
      matched: 0,
      observed: 0,
      voiced: 0,
      above: 0,
      below: 0,
      cents: 0,
      absoluteCents: 0,
    }));
  }
  break() {
    this.last = null;
  }
  add(time: number, midi: number | null) {
    if (!Number.isFinite(time) || time <= this.highWater) return;
    if (this.last !== null) {
      const from = Math.max(
        this.last,
        time - MAX_OBSERVATION_SECONDS,
        this.highWater,
      );
      this.notes.forEach((note, index) => {
        const dt = Math.max(
          0,
          Math.min(time, note.start + note.duration) -
            Math.max(from, note.start),
        );
        if (!dt) return;
        const detail = this.details[index];
        detail.observed += dt;
        this.observed += dt;
        if (midi === null || !Number.isFinite(midi)) return;
        const cents = (midi - note.midi) * 100;
        detail.voiced += dt;
        detail.cents += cents * dt;
        detail.absoluteCents += Math.abs(cents) * dt;
        if (Math.abs(cents) <= 50) {
          detail.matched += dt;
          this.matched += dt;
        } else if (cents > 0) detail.above += dt;
        else detail.below += dt;
      });
    }
    this.highWater = this.last = time;
  }
  result() {
    const total = this.notes.reduce((sum, note) => sum + note.duration, 0);
    const percentage = (time: number, duration: number) =>
      duration > 0 ? Math.min(100, Math.round((100 * time) / duration)) : 0;
    const notes: NoteResult[] = this.notes.map((note, index) => {
      const d = this.details[index];
      return {
        position: note.position ?? index,
        midi: note.midi,
        duration: note.duration,
        matchedSeconds: d.matched,
        observedSeconds: d.observed,
        voicedSeconds: d.voiced,
        aboveSeconds: d.above,
        belowSeconds: d.below,
        percent: percentage(d.matched, note.duration),
        voicedPercent: percentage(d.voiced, note.duration),
        meanCents: d.voiced > 0 ? d.cents / d.voiced : null,
        meanAbsoluteCents: d.voiced > 0 ? d.absoluteCents / d.voiced : null,
      };
    });
    const voicedSeconds = notes.reduce(
      (sum, note) => sum + note.voicedSeconds,
      0,
    );
    return {
      version: SCORE_VERSION,
      percent: percentage(this.matched, total),
      matchedSeconds: this.matched,
      targetSeconds: total,
      observedSeconds: this.observed,
      voicedSeconds,
      voicedPercent: percentage(voicedSeconds, total),
      aboveSeconds: notes.reduce((sum, note) => sum + note.aboveSeconds, 0),
      belowSeconds: notes.reduce((sum, note) => sum + note.belowSeconds, 0),
      notes,
    };
  }
}

/** Audible graph position, estimated from the browser's output timestamp if available. */
export function audibleTime(
  context: Pick<
    AudioContext,
    "currentTime" | "baseLatency" | "outputLatency" | "getOutputTimestamp"
  >,
  wallMs: number,
) {
  const timestamp = context.getOutputTimestamp?.();
  if (
    timestamp &&
    typeof timestamp.contextTime === "number" &&
    typeof timestamp.performanceTime === "number" &&
    timestamp.contextTime > 0 &&
    timestamp.performanceTime > 0 &&
    Math.abs(wallMs - timestamp.performanceTime) < 1000
  ) {
    return Math.min(
      context.currentTime,
      Math.max(
        0,
        timestamp.contextTime + (wallMs - timestamp.performanceTime) / 1000,
      ),
    );
  }
  return Math.max(
    0,
    context.currentTime -
      Math.max(0, context.baseLatency || 0) -
      Math.max(0, context.outputLatency || 0),
  );
}
export function inputDelay(
  sampleRate: number,
  frameSize: number,
  reportedInputLatency: number,
  correctionMs: number,
) {
  return Math.max(
    0,
    Math.min(
      1,
      frameSize / (2 * sampleRate) + reportedInputLatency + correctionMs / 1000,
    ),
  );
}
