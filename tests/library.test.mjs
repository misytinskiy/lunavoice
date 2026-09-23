import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadTs } from "./load-ts.mjs";
const { EXERCISES, baseBounds } = loadTs("app/lib/exercises.ts");
const { normalizePractice, practiceNotes, pianoSampleUrl, practiceRange } =
  loadTs("app/lib/practice.ts");
const { parseLibrary, LibraryStore } = loadTs("app/lib/library.ts");
const { createSession, acceptSessionResult, sessionScore } =
  loadTs("app/lib/session.ts");
test("catalogue exercises have unique IDs, playable transpositions and bounded fragments", () => {
  assert.ok(EXERCISES.length >= 5);
  assert.equal(new Set(EXERCISES.map((e) => e.id)).size, EXERCISES.length);
  for (const exercise of EXERCISES) {
    assert.ok(exercise.version > 0);
    const bounds = baseBounds(exercise);
    for (let baseMidi = bounds.min; baseMidi <= bounds.max; baseMidi++) {
      const notes = practiceNotes({ exerciseId: exercise.id, baseMidi });
      assert.equal(notes.length, exercise.notes.length);
      notes.forEach((note, i) => {
        assert.ok(
          fs.existsSync(
            "public" + decodeURIComponent(pianoSampleUrl(note.midi)),
          ),
        );
        assert.ok(note.duration > 0 && note.syllable);
        if (i)
          assert.ok(note.start >= notes[i - 1].start + notes[i - 1].duration);
      });
    }
    const last = normalizePractice({
      exerciseId: exercise.id,
      fragment: { from: 999, to: 999 },
    });
    assert.equal(last.fragment.from, exercise.notes.length - 1);
    assert.equal(practiceNotes(last).length, 1);
  }
  assert.equal(
    practiceRange(normalizePractice({ exerciseId: "steady" })),
    "C3",
  );
});
test("library storage rejects unknown IDs, deduplicates recents and survives write errors", () => {
  assert.deepEqual(parseLibrary("broken").favorites, []);
  assert.deepEqual(
    parseLibrary(
      JSON.stringify({
        version: 1,
        favorites: ["steady", "unknown", "steady"],
        recent: ["pulse", "pulse"],
      }),
    ).favorites,
    ["steady"],
  );
  const store = new LibraryStore();
  store.visit("ladder");
  store.visit("steady");
  store.visit("ladder");
  assert.deepEqual(store.getSnapshot().recent, ["ladder", "steady"]);
  store.toggleFavorite("pulse");
  store.toggleFavorite("pulse");
  assert.deepEqual(store.getSnapshot().favorites, []);
  assert.ok(store.getSnapshot().notice);
});
test("session accepts each completed stage once, rejects previews and weighs target duration", () => {
  let session = createSession(60);
  const audio = {
    status: "finished",
    listening: false,
    practice: session.queue[0],
    score: 50,
    scoreReason: "",
    result: { matchedSeconds: 1, targetSeconds: 2 },
  };
  assert.equal(
    acceptSessionResult(session, { ...audio, listening: true }, 0),
    session,
  );
  session = acceptSessionResult(session, audio, 1000);
  assert.equal(session.phase, "rest");
  assert.equal(session.resumeAt, 11000);
  assert.equal(acceptSessionResult(session, audio, 2000), session);
  assert.equal(
    sessionScore([
      ...session.entries,
      {
        ...session.entries[0],
        score: 100,
        result: { matchedSeconds: 8, targetSeconds: 8 },
      },
    ]),
    90,
  );
  assert.equal(
    sessionScore([...session.entries, { ...session.entries[0], score: null }]),
    null,
  );
  for (let index = 1; index < 3; index++) {
    session = { ...session, index, phase: "active" };
    session = acceptSessionResult(
      session,
      { ...audio, practice: session.queue[index] },
      2000,
    );
  }
  assert.equal(session.phase, "complete");
  assert.equal(session.entries.length, 3);
});

test("a new definition drives timing, syllables and limits without engine changes", () => {
  const custom = { ...EXERCISES[0], id: "test-custom", version: 2, minBase: 48, maxBase: 84, defaultBpm: 60, notes: [{interval:-2,beats:1,rest:.5,syllable:"Ну"},{interval:12,beats:3,rest:9,syllable:"Ня"}] };
  EXERCISES.push(custom);
  try {
    const settings=normalizePractice({exerciseId:custom.id,baseMidi:99});
    assert.equal(settings.baseMidi,72);
    assert.equal(settings.exerciseVersion,2);
    const notes=practiceNotes(settings);
    assert.deepEqual(notes.map(n=>n.midi),[70,84]);
    assert.deepEqual(notes.map(n=>n.start),[3,4.5]);
    assert.deepEqual(notes.map(n=>n.duration),[1,3]);
    assert.deepEqual(notes.map(n=>n.syllable),["Ну","Ня"]);
    assert.equal(normalizePractice({exerciseId:custom.id,baseMidi:1}).baseMidi,48);
  } finally { EXERCISES.pop(); }
});
