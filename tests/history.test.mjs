import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";
const {
  attemptFromEvent,
  comparisonKey,
  comparable,
  completedSeconds,
  groupScore,
  normalizeProgress,
  mergeProgress,
  validAttempt,
} = loadTs("app/lib/history/model.ts");
const { HistoryStore } = loadTs("app/lib/history/store.ts");
const { PitchScore } = loadTs("app/lib/audio/analysis.ts");
const { practiceNotes, normalizePractice } = loadTs("app/lib/practice.ts");
const practice = normalizePractice({});
const result = new PitchScore(practiceNotes(practice)).result();
const snapshot = {
  practice,
  settings: {
    deviceId: "mic",
    outputMode: "wired",
    thresholdDb: -42,
    correctionMs: 0,
  },
  score: 0,
  scoreReason: "",
  result,
};
const event = (type = "completed", id = "attempt") => ({
  type,
  id,
  startedAt: "2026-09-16T10:00:00.000Z",
  snapshot,
});
test("stored attempts include versions and note results but no samples, trace or stream", () => {
  const record = attemptFromEvent(event(), null);
  assert.equal(record.scoreVersion, result.version);
  assert.equal(record.practice.exerciseVersion, 1);
  assert.equal(record.result.notes.length, 9);
  assert.ok(validAttempt(record));
  assert.equal("reading" in record, false);
  assert.equal("stream" in record, false);
  const interrupted = attemptFromEvent(event("interrupted"), null);
  assert.equal(interrupted.result, null);
  assert.equal(interrupted.score, null);
  assert.equal(
    validAttempt({ ...record, result: { ...result, notes: [{}] } }),
    false,
  );
});
test("comparisons isolate tempo, transposition, fragment, versions and audio route", () => {
  const base = attemptFromEvent(event(), null);
  const changed = [
    { ...base, practice: { ...practice, bpm: 80 } },
    { ...base, practice: { ...practice, baseMidi: 60 } },
    { ...base, practice: { ...practice, fragment: { from: 0, to: 0 } } },
    { ...base, practice: { ...practice, exerciseVersion: 2 } },
    { ...base, scoreVersion: "future" },
    { ...base, audio: { ...base.audio, outputMode: "bluetooth" } },
    { ...base, audio: { ...base.audio, correctionMs: 100 } },
  ];
  assert.ok(changed.every((r) => comparisonKey(r) !== comparisonKey(base)));
  const records = [
    ...changed,
    base,
    { ...base, id: "unscored", score: null },
    { ...base, id: "abort", status: "interrupted" },
  ];
  assert.equal(comparable(records, base).length, 1);
});
test("goals exclude unfinished attempts and session summaries do not average percentages", () => {
  const base = attemptFromEvent(event(), null);
  assert.equal(
    completedSeconds([base, { ...base, status: "interrupted" }]),
    result.targetSeconds,
  );
  const records = [
    {
      ...base,
      id: "a",
      result: { ...result, targetSeconds: 2, matchedSeconds: 1 },
    },
    {
      ...base,
      id: "b",
      result: { ...result, targetSeconds: 8, matchedSeconds: 8 },
    },
  ];
  assert.equal(
    groupScore({ status: "completed", attemptIds: ["a", "b"] }, records),
    90,
  );
  assert.equal(
    groupScore({ status: "interrupted", attemptIds: ["a", "b"] }, records),
    null,
  );
  assert.equal(
    groupScore({ status: "completed", attemptIds: ["a", "missing"] }, records),
    null,
  );
});
test("fallback storage keeps one record per ID, preserves completed results and does not resurrect deletions", async () => {
  const store = new HistoryStore();
  await store.init(); // Node has no IndexedDB: same fallback as a restricted browser.
  store.onAttempt(event("started"));
  store.onAttempt(event());
  store.onAttempt(event());
  store.onAttempt(event("interrupted"));
  assert.equal(store.getSnapshot().attempts.length, 1);
  assert.equal(store.getSnapshot().attempts[0].status, "completed");
  store.deleteAttempt("attempt");
  store.onAttempt(event());
  assert.equal(store.getSnapshot().attempts.length, 0);
  assert.ok(store.getSnapshot().notice);
});
test("practice preference validation preserves per-exercise tempo and bounds settings", () => {
  assert.deepEqual(
    normalizeProgress({ tempos: { pulse: 90, unknown: 75, ladder: Infinity } })
      .tempos,
    { pulse: 90 },
  );
  assert.equal(
    normalizeProgress({ goalMinutes: 999, volume: 200, baseMidi: 999 })
      .goalMinutes,
    5,
  );
  assert.equal(normalizeProgress({ volume: 200 }).volume, 100);
});

test("queued preference patches preserve fields loaded later and tempos from other tabs", () => {
  const stored = normalizeProgress({
    volume: 90,
    goalMinutes: 10,
    tempos: { pulse: 100 },
  });
  const merged = mergeProgress(stored, {
    baseMidi: 60,
    tempos: { ladder: 80 },
  });
  assert.equal(merged.volume, 90);
  assert.equal(merged.goalMinutes, 10);
  assert.deepEqual(merged.tempos, { pulse: 100, ladder: 80 });
  assert.equal(normalizeProgress(null).volume, 55);
});
