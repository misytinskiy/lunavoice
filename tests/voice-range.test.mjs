import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadTs } from "./load-ts.mjs";
const {
  normalizePractice,
  practiceNotes,
  practiceGuideNotes,
  practiceRound,
  pianoSampleUrl,
} = loadTs("app/lib/practice.ts");
const { fitVoiceRange, RangeCapture, validRange } = loadTs(
  "app/lib/voice-range.ts",
);
const { EXERCISES } = loadTs("app/lib/exercises.ts");
const { PitchScore } = loadTs("app/lib/audio/analysis.ts");

test("descending series approaches the tonic from a semitone below with unscored simultaneous chords", () => {
  const p = normalizePractice({
    exerciseId: "descent",
    baseMidi: 48,
    bpm: 100,
    series: { rounds: 8, step: 2 },
  });
  const notes = practiceNotes(p),
    guides = practiceGuideNotes(p);
  assert.equal(notes.length, 40);
  assert.equal(guides.length, 56);
  for (let round = 0; round < 8; round++) {
    assert.deepEqual(
      notes.slice(round * 5, round * 5 + 5).map((n) => n.midi),
      [7, 5, 4, 2, 0].map((n) => 48 + n + round * 2),
    );
    const targets = notes.slice(round * 5, round * 5 + 5),
      accompaniment = guides.slice(round * 7, round * 7 + 7);
    assert.equal(
      new Set(accompaniment.slice(0, 3).map((n) => n.start)).size,
      1,
    );
    assert.equal(new Set(accompaniment.slice(3).map((n) => n.start)).size, 1);
    assert.equal(
      accompaniment[3].start,
      accompaniment[0].start + accompaniment[0].duration,
    );
    assert.ok(
      accompaniment.every((n) => n.start + n.duration < targets[0].start),
    );
    assert.deepEqual(
      accompaniment.map((n) => n.midi),
      [-1, 3, 6, 0, 4, 7, 12].map((n) => 48 + n + round * 2),
    );
    assert.equal(accompaniment[0].duration, 0.5);
    assert.equal(accompaniment[3].duration, 1);
    assert.ok(
      Math.abs(targets[0].start - accompaniment[6].start - 1 - 0.15) < 1e-8,
    );
    if (round > 0) {
      const previous = notes[round * 5 - 1];
      assert.ok(
        Math.abs(
          accompaniment[0].start - previous.start - previous.duration - 0.3,
        ) < 1e-8,
      );
    }
    assert.equal(practiceRound(p, accompaniment[0].start + 0.001).index, round);
  }
  const scorer = new PitchScore(notes);
  for (let time = 0; time < notes[0].start; time += 0.025) scorer.add(time, 55);
  assert.equal(scorer.result().matchedSeconds, 0);
  assert.equal(
    scorer.result().targetSeconds,
    notes.reduce((sum, n) => sum + n.duration, 0),
  );
});
test("all series stay within piano assets and existing 128-note history limit", () => {
  for (const e of EXERCISES)
    for (const baseMidi of [36, 40, 48, 60, 77, 84])
      for (const step of [1, 2]) {
        const p = normalizePractice({
          exerciseId: e.id,
          baseMidi,
          series: { rounds: 10, step },
        });
        const notes = practiceNotes(p);
        assert.ok(notes.length <= 128);
        assert.equal(new Set(notes.map((n) => n.position)).size, notes.length);
        for (const note of [...notes, ...practiceGuideNotes(p)])
          assert.ok(
            fs.existsSync(
              "public" + decodeURIComponent(pianoSampleUrl(note.midi)),
            ),
          );
      }
});
test("fragment replay preserves later-pass pitch and positions without accompaniment", () => {
  const p = normalizePractice({
    exerciseId: "descent",
    baseMidi: 48,
    series: { rounds: 8, step: 2 },
  });
  const original = practiceNotes(p),
    fragment = normalizePractice({ ...p, fragment: { from: 31, to: 33 } }),
    notes = practiceNotes(fragment);
  assert.deepEqual(
    notes.map((n) => [n.midi, n.position]),
    original.slice(31, 34).map((n) => [n.midi, n.position]),
  );
  assert.equal(practiceGuideNotes(fragment).length, 0);
});
test("range fitting uses complete melody and one-semitone margins", () => {
  const p = normalizePractice({
    exerciseId: "descent",
    baseMidi: 48,
    series: { rounds: 10, step: 2 },
  });
  const fitted = fitVoiceRange(p, { low: 47, high: 70 });
  assert.equal(fitted.baseMidi, 48);
  assert.equal(fitted.series.rounds, 8);
  assert.ok(practiceNotes(fitted).every((n) => n.midi > 47 && n.midi < 70));
  assert.equal(fitVoiceRange(p, { low: 60, high: 65 }), null);
  assert.equal(validRange({ low: 70, high: 48 }), false);
  assert.equal(validRange({ low: 48.3, high: 70 }), false);
});
test("stable capture rejects silence, glides, interrupted time and isolated octave errors", () => {
  let capture = new RangeCapture(),
    result;
  for (let i = 0; i < 25; i++)
    result = capture.add(i * 100, 60 + Math.sin(i) * 0.1);
  assert.equal(result, 60);
  assert.equal(capture.add(2500, null), null);
  assert.equal(capture.add(2600, 60), null);
  capture = new RangeCapture();
  for (let i = 0; i < 25; i++)
    assert.equal(capture.add(i * 100, 48 + i * 0.2), null);
  capture = new RangeCapture();
  for (let i = 0; i < 15; i++) capture.add(i * 100, 60);
  assert.equal(capture.add(4000, 60), null);
  assert.equal(capture.add(4100, 72), null);
});

test("automatic range fitting defaults to semitone steps", () => {
  const fitted = fitVoiceRange(normalizePractice({ exerciseId: "descent" }), {
    low: 57,
    high: 69,
  });
  assert.equal(fitted.series.step, 1);
  assert.equal(fitted.series.rounds, 4);
});

test("preparation chords follow each fitted key rather than fixed F# and G notes", () => {
  for (const low of [40, 47, 54, 59]) {
    const fitted = fitVoiceRange(normalizePractice({ exerciseId: "descent" }), { low, high: low + 16 });
    const root = fitted.baseMidi;
    assert.deepEqual(practiceGuideNotes(fitted).slice(0, 7).map(n => n.midi), [-1, 3, 6, 0, 4, 7, 12].map(n => root + n));
    assert.deepEqual(practiceNotes(fitted).slice(0, 5).map(n => n.midi), [7, 5, 4, 2, 0].map(n => root + n));
    assert.ok(practiceNotes(fitted).every(n => n.midi > low && n.midi < low + 16));
  }
});
