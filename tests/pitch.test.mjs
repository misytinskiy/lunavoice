import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import fs from "node:fs";
import { loadTs } from "./load-ts.mjs";
const { pianoSampleUrl } = loadTs("app/lib/practice.ts");
const moduleUnderTest = { exports: {} };
const compiled = ts.transpileModule(
  fs.readFileSync("app/lib/pitch.ts", "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
new Function("exports", "module", compiled)(
  moduleUnderTest.exports,
  moduleUnderTest,
);
const { detectPitch, frequencyToMidi, exercise, matchedDuration, noteName } =
  moduleUnderTest.exports;

for (const sampleRate of [44100, 48000]) {
  test(`detects vocal fundamentals and harmonic-rich tones at ${sampleRate} Hz`, () => {
    for (const frequency of [
      65.406, 69.296, 82.41, 130.81, 164.81, 196, 261.63, 392, 440, 880,
    ]) {
      for (const harmonics of [false, true]) {
        const samples = Float32Array.from({ length: 2048 }, (_, i) => {
          const phase = (2 * Math.PI * frequency * i) / sampleRate;
          return (
            0.18 * Math.sin(phase) +
            (harmonics
              ? 0.3 * Math.sin(2 * phase) + 0.12 * Math.sin(3 * phase)
              : 0)
          );
        });
        const detected = detectPitch(
          samples,
          sampleRate,
          new Float32Array(2048),
        );
        assert.notEqual(detected, null, `${frequency} Hz`);
        assert.ok(
          Math.abs(1200 * Math.log2(detected / frequency)) < 12,
          `${frequency} became ${detected}`,
        );
      }
    }
  });
}
test("rejects silence, DC offset and quiet input", () => {
  for (const level of [0, 0.5])
    assert.equal(
      detectPitch(
        new Float32Array(2048).fill(level),
        48000,
        new Float32Array(2048),
      ),
      null,
    );
  const quiet = Float32Array.from(
    { length: 2048 },
    (_, i) => 0.001 * Math.sin(i / 20),
  );
  assert.equal(detectPitch(quiet, 48000, new Float32Array(2048)), null);
});
test("scores only target time, treats silence and wrong octaves as misses", () => {
  const notes = exercise(3);
  const n = notes[0];
  assert.equal(matchedDuration(0, 3, n.midi, notes), 0);
  assert.equal(matchedDuration(n.start, n.start + 1, n.midi, notes), 1);
  assert.equal(matchedDuration(n.start, n.start + 1, n.midi + 0.5, notes), 1);
  assert.equal(matchedDuration(n.start, n.start + 1, n.midi + 0.51, notes), 0);
  assert.equal(matchedDuration(n.start, n.start + 1, null, notes), 0);
  assert.equal(matchedDuration(n.start, n.start + 1, n.midi + 12, notes), 0);
  let matched = 0;
  for (const note of notes)
    matched += matchedDuration(
      note.start,
      note.start + note.duration,
      note.midi,
      notes,
    );
  assert.ok(Math.abs(matched / (notes.length * 1.6) - 1) < 1e-10);
  assert.ok(Math.abs(matchedDuration(4.5, 4.9, n.midi, notes) - 0.1) < 1e-10);
});
test("maps concert A and supplied audio names correctly", () => {
  assert.equal(frequencyToMidi(440), 69);
  assert.equal(noteName(60), "C4");
  for (const octave of [2, 3, 4])
    for (const note of exercise(octave)) {
      assert.ok(
        fs.existsSync("public" + decodeURIComponent(pianoSampleUrl(note.midi))),
      );
    }
});
