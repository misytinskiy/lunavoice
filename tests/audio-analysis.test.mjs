import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";
const {
  analyse,
  PitchTracker,
  VisualPitch,
  PitchScore,
  calibrateNoise,
  audibleTime,
  inputDelay,
} = loadTs("app/lib/audio/analysis.ts");
const { calibrationChirp, findChirp, latencyCorrection } = loadTs(
  "app/lib/audio/latency.ts",
);
const { loadSettings, saveSettings, normalizeSettings } = loadTs(
  "app/lib/audio/settings.ts",
);
const { bounded } = loadTs("app/lib/audio/async.ts");
const { exercise } = loadTs("app/lib/pitch.ts");
const sine = (frequency, amplitude = 0.2, rate = 48000) =>
  Float32Array.from(
    { length: 2048 },
    (_, i) => amplitude * Math.sin((2 * Math.PI * frequency * i) / rate),
  );
const read = (samples, threshold = -42) =>
  analyse(
    samples,
    48000,
    new Float32Array(2048),
    threshold,
    new PitchTracker(),
  );
test("distinguishes silence, low signal, clipping, aperiodic noise and voiced input", () => {
  assert.equal(read(new Float32Array(2048)).state, "silence");
  assert.equal(read(sine(220, 0.002)).state, "quiet");
  assert.equal(read(sine(220, 1.3)).state, "clipping");
  assert.equal(read(sine(220, 1.3)).midi, null);
  let seed = 13;
  const noise = Float32Array.from({ length: 2048 }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed / 2 ** 32 - 0.5) * 0.4;
  });
  assert.equal(read(noise).state, "unstable");
  assert.equal(read(sine(220)).state, "voiced");
  assert.equal(read(sine(220, 0.003), -60).state, "voiced");
});
test("isolated octave errors do not become a fake sustained correct note", () => {
  const tracker = new PitchTracker();
  assert.equal(tracker.accept(48), 48);
  assert.equal(tracker.accept(60), null);
  assert.equal(tracker.accept(48.1), 48.1);
  assert.equal(tracker.accept(60), null);
  assert.equal(tracker.accept(60.1), null);
  assert.equal(tracker.accept(60), 60);
  tracker.accept(null);
  tracker.accept(null);
  tracker.accept(null);
  assert.equal(tracker.accept(48), 48);
});
test("visual interpolation is independent of scored pitch and resets on silence", () => {
  const visual = new VisualPitch();
  assert.equal(visual.update(60), 60);
  assert.ok(visual.update(60.8) < 60.5);
  const score = new PitchScore([{ midi: 60, start: 0, duration: 1 }]);
  score.add(0, 60);
  score.add(0.025, 60.8);
  assert.equal(score.result().matchedSeconds, 0);
  assert.equal(visual.update(null), null);
  assert.equal(visual.update(64), 64);
});
test("noise calibration uses room floor and rejects singing, clipping and high noise", () => {
  const readings = Array.from({ length: 70 }, () => ({
    db: -53,
    midi: null,
    state: "unstable",
  }));
  assert.deepEqual(calibrateNoise(readings), {
    noiseFloorDb: -53,
    thresholdDb: -43,
  });
  assert.throws(() => calibrateNoise(readings.slice(0, 10)));
  assert.throws(() =>
    calibrateNoise(readings.map((r) => ({ ...r, midi: 60 }))),
  );
  assert.throws(() => calibrateNoise(readings.map((r) => ({ ...r, db: -25 }))));
  assert.throws(() =>
    calibrateNoise(readings.map((r) => ({ ...r, state: "clipping" }))),
  );
});
test("time scoring never duplicates intervals, bridges a pause, or awards a long stalled frame", () => {
  const score = new PitchScore([{ midi: 60, start: 0, duration: 2 }]);
  score.add(0, 60);
  score.add(0.05, 60);
  score.add(0.05, 60);
  score.add(0.02, 60);
  assert.equal(score.result().matchedSeconds, 0.05);
  score.add(1, 60);
  assert.ok(Math.abs(score.result().matchedSeconds - 0.11) < 1e-8);
  score.break();
  score.add(1.8, 60);
  assert.ok(Math.abs(score.result().matchedSeconds - 0.11) < 1e-8);
  score.add(1.85, null);
  score.add(1.9, 72);
  assert.ok(Math.abs(score.result().matchedSeconds - 0.11) < 1e-8);
  assert.equal(score.result().version, "pitch-time-v2");
});
test("known delayed input aligns with targets only after compensation", () => {
  const notes = exercise(3),
    correct = new PitchScore(notes),
    late = new PitchScore(notes);
  for (let t = 0; t < 21; t += 0.025) {
    const note = notes.find(
      (n) => t - 0.25 >= n.start && t - 0.25 < n.start + n.duration,
    );
    correct.add(t - 0.25, note?.midi ?? null);
    late.add(t, note?.midi ?? null);
  }
  assert.ok(correct.result().percent >= 97);
  assert.ok(late.result().percent < correct.result().percent - 10);
});
test("output timestamps and fallback latencies use seconds without double subtraction", () => {
  const ctx = {
    currentTime: 10,
    baseLatency: 0.01,
    outputLatency: 0.1,
    getOutputTimestamp: () => ({ contextTime: 9.8, performanceTime: 1000 }),
  };
  assert.ok(Math.abs(audibleTime(ctx, 1050) - 9.85) < 1e-8);
  assert.equal(audibleTime(ctx, 4000), 9.89);
  assert.equal(inputDelay(48000, 2048, 0.02, 100), 0.02 + 2048 / 96000 + 0.1);
  assert.equal(inputDelay(48000, 2048, 0.02, -200), 0);
});
test("chirp correlation finds an attenuated delayed signal and ignores silence", () => {
  const chirp = calibrationChirp(48000),
    frame = new Float32Array(2048);
  frame.set(
    chirp.map((value) => value * 0.3),
    702,
  );
  const match = findChirp(frame, chirp);
  assert.equal(match.index, 702);
  assert.ok(match.confidence > 0.99);
  assert.equal(findChirp(new Float32Array(2048), chirp), null);
  assert.deepEqual(latencyCorrection([0.22, 0.221, 0.219], 0.1, 0.02), {
    roundTripMs: 220,
    correctionMs: 100,
  });
  assert.throws(() => latencyCorrection([0.1, 0.3, 0.2], 0, 0));
  assert.throws(() => latencyCorrection([0.1], 0, 0));
});
test("settings are isolated by mic and output route; broken storage cannot stop audio", () => {
  let value = null;
  const storage = {
    getItem: () => value,
    setItem: (_, next) => {
      value = next;
    },
  };
  saveSettings(storage, {
    deviceId: "one",
    outputMode: "wired",
    thresholdDb: -50,
    correctionMs: 40,
  });
  saveSettings(storage, {
    deviceId: "one",
    outputMode: "bluetooth",
    thresholdDb: -38,
    correctionMs: 200,
  });
  assert.equal(loadSettings(storage, "one", "wired").correctionMs, 40);
  assert.equal(loadSettings(storage, "one", "bluetooth").correctionMs, 200);
  assert.equal(loadSettings(storage, "two", "wired").correctionMs, 0);
  assert.equal(normalizeSettings({ correctionMs: NaN }).correctionMs, 0);
  value = "not json";
  assert.equal(loadSettings(storage).outputMode, "speakers");
  assert.equal(
    saveSettings(
      {
        getItem: () => null,
        setItem: () => {
          throw Error("full");
        },
      },
      {},
    ),
    false,
  );
});
test("cancelled or timed-out permission promises clean up a late resource", async () => {
  let resolve,
    cleaned = 0;
  const controller = new AbortController();
  const promise = bounded(
    new Promise((r) => {
      resolve = r;
    }),
    controller.signal,
    100,
    () => cleaned++,
  );
  controller.abort();
  await assert.rejects(promise, { name: "AbortError" });
  resolve({});
  await Promise.resolve();
  assert.equal(cleaned, 1);
  let late;
  const timeout = bounded(
    new Promise((r) => {
      late = r;
    }),
    new AbortController().signal,
    5,
    () => cleaned++,
  );
  await assert.rejects(timeout, /слишком много/);
  late({});
  await Promise.resolve();
  assert.equal(cleaned, 2);
});

test("low/high tones with vibrato and harmonic-rich breathy signals stay near the fundamental", () => {
  for (const base of [82.41, 130.81, 440, 880]) {
    let phase = 0;
    const frame = Float32Array.from({ length: 2048 }, (_, i) => {
      const t = i / 48000;
      const frequency =
        base * 2 ** ((35 * Math.sin(2 * Math.PI * 5 * t)) / 1200);
      phase += (2 * Math.PI * frequency) / 48000;
      return (
        0.16 * Math.sin(phase) +
        0.2 * Math.sin(2 * phase) +
        0.05 * Math.sin(3 * phase) +
        0.003 * Math.sin(i * 3.728)
      );
    });
    const reading = read(frame);
    assert.equal(reading.state, "voiced");
    const middleFrequency =
      base * 2 ** ((35 * Math.sin(2 * Math.PI * 5 * (1024 / 48000))) / 1200);
    const expected = 69 + 12 * Math.log2(middleFrequency / 440);
    assert.ok(
      Math.abs(reading.midi - expected) < 0.35,
      `${base}: ${reading.midi} vs ${expected}`,
    );
  }
});
