import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";
const { pianoNotes, pianoMapping, PIANO_MODES, KEY_ROWS } =
  loadTs("app/lib/piano.ts");
test("every tonic and scale maps ascending in-range notes across physical keyboard rows", () => {
  for (let tonic = 0; tonic < 12; tonic++)
    for (const mode of PIANO_MODES) {
      const notes = pianoNotes(tonic, mode.id);
      assert.ok(notes.length > 0);
      assert.ok(
        notes.every((n, i) => n >= 36 && n <= 84 && (!i || n > notes[i - 1])),
      );
      assert.ok(
        notes.every((n) =>
          mode.notes.some((offset) => offset % 12 === (n - tonic + 120) % 12),
        ),
      );
      const mapping = pianoMapping(tonic, mode.id);
      assert.deepEqual(
        [...mapping.values()],
        notes.slice(0, KEY_ROWS.flat().length),
      );
      assert.equal(mapping.get("KeyZ"), notes[0]);
    }
});
test("C major starts with the lowest C and stops assigning keys when samples end", () => {
  assert.deepEqual(
    [...pianoMapping(0, "ionian").values()].slice(0, 8),
    [36, 38, 40, 41, 43, 45, 47, 48],
  );
  assert.equal(pianoMapping(0, "ionian").has("Digit1"), false);
  assert.ok(pianoMapping(0, "chromatic").has("Digit1"));
});
