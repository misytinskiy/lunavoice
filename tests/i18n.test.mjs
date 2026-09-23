import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadTs } from "./load-ts.mjs";
const { translate, t, getLocale, setLocale, localeTag } = loadTs(
  "app/lib/i18n/index.ts",
);
const { EXERCISES, EXERCISE_GROUPS } = loadTs("app/lib/exercises.ts");
const en = JSON.parse(fs.readFileSync("app/lib/i18n/en.json"));
const uk = JSON.parse(fs.readFileSync("app/lib/i18n/uk.json"));
test("English is default; dictionaries cover exercises, syllables and matching placeholders", () => {
  assert.equal(getLocale(), "en");
  assert.deepEqual(Object.keys(en).sort(), Object.keys(uk).sort());
  for (const [key, value] of Object.entries(en)) {
    assert.ok(value && uk[key]);
    const slots = (s) => [...s.matchAll(/\{\d+\}/g)].map((m) => m[0]).sort();
    assert.deepEqual(slots(key), slots(value));
    assert.deepEqual(slots(key), slots(uk[key]));
  }
  for (const exercise of [...EXERCISES, ...EXERCISE_GROUPS]) {
    for (const key of [
      "title",
      "description",
      "goal",
      "level",
      "syllable",
      "instruction",
    ]) {
      if (exercise[key])
        assert.ok(en[exercise[key]] && uk[exercise[key]], exercise[key]);
    }
    for (const note of exercise.notes ?? [])
      if (note.syllable) assert.ok(en[note.syllable] && uk[note.syllable]);
  }
});
test("legacy dynamic messages, saved titles and composite labels translate without changing values", () => {
  assert.equal(
    translate("Завершено 3 из 9 нот", "en"),
    "Completed 3 of 9 notes",
  );
  assert.equal(translate("Завершено 3 из 9 нот", "uk"), "Завершено 3 з 9 нот");
  assert.equal(
    translate("В избранное: Пять гласных", "en"),
    "Add to favorites: Five vowels",
  );
  assert.equal(translate("Лесенка", "uk"), "Драбинка");
  assert.equal(
    translate(
      "Микрофон отключён. Выберите устройство и повторите проверку.",
      "en",
    ),
    "Microphone disconnected. Select a device and check again.",
  );
  assert.equal(t(75), 75);
  const object = { id: "ladder" };
  assert.equal(t(object), object);
  setLocale("uk", false);
  assert.equal(localeTag(), "uk-UA");
  setLocale("ru", false);
  assert.equal(t("Лесенка"), "Лесенка");
  setLocale("en", false);
});
