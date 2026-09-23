import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadTs } from "./load-ts.mjs";
const {
  normalizePractice,
  practiceNotes,
  practiceDuration,
  pianoSampleUrl,
  suggestBase,
} = loadTs("app/lib/practice.ts");
const { PitchScore } = loadTs("app/lib/audio/analysis.ts");
const { weakestFragment, noteFeedback, practiceAdvice } = loadTs(
  "app/lib/practice-feedback.ts",
);
test("every transposition resolves real samples and remains within pitch detection range", () => {
  for (let baseMidi = 36; baseMidi <= 77; baseMidi++) {
    for (const note of practiceNotes({ baseMidi }))
      assert.ok(
        fs.existsSync("public" + decodeURIComponent(pianoSampleUrl(note.midi))),
      );
  }
  assert.equal(normalizePractice({ baseMidi: 100, bpm: 1 }).baseMidi, 77);
  assert.equal(normalizePractice({ bpm: Infinity }).bpm, 75);
  for (let midi = 36; midi <= 84; midi++) {
    assert.ok(
      fs.existsSync("public" + decodeURIComponent(pianoSampleUrl(midi))),
    );
    assert.ok(pianoSampleUrl(midi).endsWith(".wav"));
  }
  assert.ok(decodeURIComponent(pianoSampleUrl(84)).endsWith("/С6.wav"));
});
test("tempo scales notes and gaps; replay preserves original positions and has a new count-in", () => {
  const full = practiceNotes({ baseMidi: 60, bpm: 50 });
  const fragment = practiceNotes({
    baseMidi: 60,
    bpm: 50,
    fragment: { from: 4, to: 6 },
  });
  assert.deepEqual(
    fragment.map((n) => n.position),
    [4, 5, 6],
  );
  assert.deepEqual(
    fragment.map((n) => n.midi),
    full.slice(4, 7).map((n) => n.midi),
  );
  assert.equal(fragment[0].start, 3);
  assert.ok(Math.abs(fragment[0].duration - 2.4) < 1e-8);
  assert.ok(practiceDuration(fragment) < practiceDuration(full));
});
test("comfortable range requires stable voiced evidence and clamps to available piano", () => {
  assert.equal(suggestBase(Array(19).fill(57)), null);
  assert.equal(suggestBase(Array(30).fill(57)), 53);
  assert.equal(suggestBase(Array.from({ length: 40 }, (_, i) => 50 + i)), null);
  assert.equal(suggestBase(Array(30).fill(40)), 36);
});
test("per-note results separate silence, correct, sharp and flat time without signed-error cancellation", () => {
  const score = new PitchScore([
    { position: 5, midi: 60, start: 0, duration: 1 },
  ]);
  score.add(0, null);
  for (let i = 1; i <= 100; i++)
    score.add(i / 100, i <= 25 ? 60 : i <= 50 ? 61 : i <= 75 ? 59 : null);
  const result = score.result(),
    note = result.notes[0];
  assert.equal(result.percent, 25);
  assert.equal(result.voicedPercent, 75);
  assert.ok(Math.abs(result.aboveSeconds - 0.25) < 1e-8);
  assert.ok(Math.abs(result.belowSeconds - 0.25) < 1e-8);
  assert.ok(Math.abs(note.meanCents) < 1e-8);
  assert.ok(note.meanAbsoluteCents > 60);
  assert.equal(note.position, 5);
  assert.equal(noteFeedback(note), "Высота менялась");
  assert.deepEqual(weakestFragment(result), { from: 5, to: 5 });
  assert.match(practiceAdvice(result), /6/);
});
test("silent attempt has no fabricated deviation or difficult-fragment advice", () => {
  const score = new PitchScore(practiceNotes({ baseMidi: 48 }));
  for (let t = 0; t < 21; t += 0.025) score.add(t, null);
  const result = score.result();
  assert.equal(weakestFragment(result), null);
  assert.equal(result.notes[0].meanCents, null);
  assert.match(practiceAdvice(result), /микрофон/i);
});
