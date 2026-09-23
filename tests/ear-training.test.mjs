import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadTs } from "./load-ts.mjs";
const ear = loadTs("app/lib/ear-training.ts");
const { pianoSampleUrl } = loadTs("app/lib/practice.ts");
const seeded = (seed) => () =>
  (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

test("every exercise, mode and root generates 20 playable questions with valid answers", () => {
  for (const exercise of ear.EXERCISES)
    for (const mode of ear.modesFor(exercise.id))
      for (const root of [36, 48, 60])
        for (const fixed of [true, false]) {
          const settings = {
            ...ear.defaultSettings(exercise.id),
            selected: ear.poolFor(exercise.id).map((s) => s.id),
            mode,
            root,
            fixed,
          };
          const questions = ear.generateQuestions(
            settings,
            seeded(root + mode.length),
          );
          assert.equal(questions.length, 20);
          for (const question of questions) {
            assert.ok(question.options.some((o) => o.id === question.answer));
            assert.ok(question.events.length);
            for (const event of question.events) {
              assert.ok(event.beat >= 0 && event.duration > 0);
              for (const midi of event.notes) {
                assert.ok(Number.isInteger(midi) && midi >= 36 && midi <= 84);
                assert.ok(
                  fs.existsSync(
                    "public" + decodeURIComponent(pianoSampleUrl(midi)),
                  ),
                );
              }
            }
          }
        }
});
test("interval comparison answers describe the audible intervals, with shared and independent roots", () => {
  for (const mode of ear.modesFor("comparison"))
    for (const common of [true, false]) {
      const questions = ear.generateQuestions(
        {
          ...ear.defaultSettings("comparison"),
          selected: ["0", "1", "7", "24"],
          mode,
          common,
          fixed: false,
        },
        seeded(28),
      );
      for (const q of questions) {
        const midpoint = mode === "harmonic" ? 1 : 2;
        const first = q.events.slice(0, midpoint).flatMap((e) => e.notes);
        const second = q.events.slice(midpoint).flatMap((e) => e.notes);
        const a = Math.max(...first) - Math.min(...first),
          b = Math.max(...second) - Math.min(...second);
        assert.notEqual(a, b);
        assert.equal(q.answer, a > b ? "a" : "b");
        if (common) assert.equal(Math.min(...first), Math.min(...second));
      }
    }
});
test("identification pools have no acoustically identical answers", () => {
  for (const kind of [
    "notes",
    "intervals",
    "chords",
    "inversions",
    "scales",
    "progressions",
  ]) {
    const sounds = ear
      .poolFor(kind)
      .map((s) => JSON.stringify(s.chords ?? s.notes));
    assert.equal(new Set(sounds).size, sounds.length, kind);
  }
});
test("notes include a C4 reference; pitch direction matches notes", () => {
  for (const q of ear.generateQuestions(
    ear.defaultSettings("notes"),
    seeded(10),
  )) {
    assert.deepEqual(q.events[0].notes, [60]);
    assert.equal(q.events[1].notes[0], 60 + Number(q.answer));
  }
  for (const q of ear.generateQuestions(
    ear.defaultSettings("pitch"),
    seeded(10),
  )) {
    const delta = q.events[1].notes[0] - q.events[0].notes[0];
    assert.equal(q.answer, delta > 0 ? "higher" : delta < 0 ? "lower" : "same");
  }
});
test("empty or single sound pools and invalid settings cannot start", () => {
  const settings = ear.defaultSettings("chords");
  for (const selected of [[], ["major"], ["unknown", "major"]])
    assert.throws(() => ear.generateQuestions({ ...settings, selected }));
  for (const invalid of [
    { root: 61 },
    { bpm: NaN },
    { bpm: 0 },
    { mode: "unknown" },
  ])
    assert.throws(() => ear.generateQuestions({ ...settings, ...invalid }));
});
test("scoring includes all 20 questions and unanswered questions are not correct", () => {
  const questions = ear.generateQuestions(
    ear.defaultSettings("intervals"),
    seeded(5),
  );
  assert.equal(ear.scoreAnswers(questions, []), 0);
  assert.equal(
    ear.scoreAnswers(
      questions,
      questions.map((q) => q.answer),
    ),
    20,
  );
  assert.equal(
    ear.scoreAnswers(
      questions,
      questions.map((q, i) => (i < 7 ? q.answer : "wrong")),
    ),
    7,
  );
});
