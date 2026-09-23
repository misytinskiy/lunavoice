import { Select, SelectOption } from "./select";
import { t } from "../lib/i18n";
import { useState } from "react";
import {
  EXERCISES,
  EXERCISE_GROUPS,
  intervalBounds,
  SHORT_SESSION,
  type ExerciseDefinition,
} from "../lib/exercises";
import {
  normalizePractice,
  practiceDuration,
  practiceNotes,
  practiceRange,
} from "../lib/practice";
import type { LibraryPreferences } from "../lib/library";
export function ExerciseLibrary({
  preferences,
  onFavorite,
  onSelect,
  onSession,
  baseMidi,
}: {
  preferences: LibraryPreferences;
  onFavorite: (id: string) => void;
  onSelect: (id: string) => void;
  onSession: () => void;
  baseMidi: number;
}) {
  const [goal, setGoal] = useState("Все цели"),
    [group, setGroup] = useState("all"),
    [level, setLevel] = useState("Все уровни"),
    [duration, setDuration] = useState("Любая длительность"),
    [collection, setCollection] = useState("Все");
  const seconds = (exercise: ExerciseDefinition) =>
    practiceDuration(practiceNotes({ exerciseId: exercise.id }));
  const filtered = EXERCISES.filter(
    (e) =>
      (group === "all" || e.group === group) &&
      (goal === "Все цели" || e.goal === goal) &&
      (level === "Все уровни" || e.level === level) &&
      (duration === "Любая длительность" ||
        (duration === "До 15 секунд" ? seconds(e) <= 15 : seconds(e) > 15)) &&
      (collection === "Все" ||
        (collection === "Избранное"
          ? preferences.favorites.includes(e.id)
          : preferences.recent.includes(e.id))),
  );
  if (collection === "Недавние")
    filtered.sort(
      (a, b) =>
        preferences.recent.indexOf(a.id) - preferences.recent.indexOf(b.id),
    );
  const sessionSeconds =
    SHORT_SESSION.exercises.reduce(
      (sum, id) => sum + practiceDuration(practiceNotes({ exerciseId: id })),
      0,
    ) +
    SHORT_SESSION.restSeconds * (SHORT_SESSION.exercises.length - 1);
  return (
    <section
      className="exercise-library"
      aria-label={t("Библиотека упражнений")}
    >
      <div className="library-heading">
        <span className="eyebrow">{t("ВАША ЕЖЕДНЕВНАЯ ПРАКТИКА")}</span>
        <h1>
          {t("Найдите свой звук")}
          <span>.</span>
        </h1>
        <p>{t("Одна задача за раз. Выберите, над чем поработать сегодня.")}</p>
      </div>
      <div className="session-card">
        <div>
          <span className="eyebrow">
            {t("КОРОТКОЕ ЗАНЯТИЕ ·") + " "}
            {t(Math.ceil(sessionSeconds))}
            {" " + t("СЕК")}
          </span>
          <h2>{t(SHORT_SESSION.title)}</h2>
          <p>{t(SHORT_SESSION.description)}</p>
          <span>
            {t("3 упражнения · паузы по 10 секунд · общий результат")}
          </span>
        </div>
        <button className="primary-button" onClick={onSession}>
          {t("Начать занятие")}
        </button>
      </div>
      <div className="library-collections" aria-label={t("Подборка")}>
        {["Все", "Избранное", "Недавние"].map((item) => (
          <button
            key={item}
            aria-pressed={collection === item}
            onClick={() => setCollection(item)}
          >
            {t(item)}
            {t(item === "Избранное" && ` · ${preferences.favorites.length}`)}
          </button>
        ))}
      </div>
      <div
        className="library-collections library-groups"
        aria-label={t("Раздел упражнений")}
      >
        {[{ id: "all", title: "Все разделы" }, ...EXERCISE_GROUPS].map(
          (item) => (
            <button
              key={item.id}
              aria-pressed={group === item.id}
              onClick={() => setGroup(item.id)}
            >
              {t(item.title)}
            </button>
          ),
        )}
      </div>
      <div className="library-filters">
        <label>
          {t("Цель")}
          <Select
            value={goal}
            onValueChange={(selectedValue) => setGoal(selectedValue)}
            aria-label={t("Цель")}
          >
            {["Все цели", "Устойчивость", "Интонация", "Интервалы"].map(
              (value) => (
                <SelectOption key={value} value={value}>
                  {t(value)}
                </SelectOption>
              ),
            )}
          </Select>
        </label>
        <label>
          {t("Уровень")}
          <Select
            value={level}
            onValueChange={(selectedValue) => setLevel(selectedValue)}
            aria-label={t("Уровень")}
          >
            {["Все уровни", "Начальный", "Средний"].map((value) => (
              <SelectOption key={value} value={value}>
                {t(value)}
              </SelectOption>
            ))}
          </Select>
        </label>
        <label>
          {t("Длительность")}
          <Select
            value={duration}
            onValueChange={(selectedValue) => setDuration(selectedValue)}
            aria-label={t("Длительность")}
          >
            {["Любая длительность", "До 15 секунд", "Больше 15 секунд"].map(
              (value) => (
                <SelectOption key={value} value={value}>
                  {t(value)}
                </SelectOption>
              ),
            )}
          </Select>
        </label>
      </div>
      <p className="library-count" role="status">
        {t("Упражнений:") + " "}
        {t(filtered.length)}
      </p>
      {(collection === "Недавние"
        ? [
            {
              id: "recent",
              title: "Недавние",
              description: "В порядке последнего открытия",
              exercises: filtered,
            },
          ]
        : EXERCISE_GROUPS.map((section) => ({
            ...section,
            exercises: filtered.filter((e) => e.group === section.id),
          }))
      )
        .filter((section) => section.exercises.length > 0)
        .map((section) => (
          <section
            className="exercise-group"
            key={section.id}
            aria-label={t(section.title)}
          >
            <div className="exercise-group-heading">
              <div>
                <h2>{t(section.title)}</h2>
                <p>{t(section.description)}</p>
              </div>
              <span>
                {t(section.exercises.length.toString().padStart(2, "0"))}
              </span>
            </div>
            <div className="exercise-grid">
              {section.exercises.map((exercise) => {
                const practice = normalizePractice({
                  exerciseId: exercise.id,
                  baseMidi,
                });
                const bounds = intervalBounds(exercise);
                const totalBeats = exercise.notes.reduce(
                  (sum, note) => sum + note.beats + note.rest,
                  0,
                );
                let beat = 0;
                return (
                  <article className="exercise-tile" key={exercise.id}>
                    <div className="tile-top">
                      <span className="eyebrow">{t(exercise.goal)}</span>
                      <button
                        className="favorite-button"
                        aria-label={t(
                          `${preferences.favorites.includes(exercise.id) ? "Убрать из избранного" : "В избранное"}: ${exercise.title}`,
                        )}
                        aria-pressed={preferences.favorites.includes(
                          exercise.id,
                        )}
                        onClick={() => onFavorite(exercise.id)}
                      >
                        {preferences.favorites.includes(exercise.id)
                          ? "★"
                          : "☆"}
                      </button>
                    </div>
                    <svg
                      className="exercise-miniature"
                      viewBox="0 0 260 64"
                      aria-hidden="true"
                    >
                      {exercise.notes.map((note, i) => {
                        const x = 4 + (beat / totalBeats) * 252;
                        beat += note.beats + note.rest;
                        return (
                          <rect
                            key={i}
                            x={x}
                            y={
                              bounds.max === bounds.min
                                ? 28
                                : 50 -
                                  ((note.interval - bounds.min) /
                                    (bounds.max - bounds.min)) *
                                    42
                            }
                            width={Math.max(2, (note.beats / totalBeats) * 252)}
                            height={6}
                            rx={3}
                          />
                        );
                      })}
                    </svg>
                    <h2>{t(exercise.title)}</h2>
                    <p>{t(exercise.description)}</p>
                    <div className="tile-meta">
                      <span>{t(exercise.level)}</span>
                      <span>
                        {t(Math.ceil(seconds(exercise)))}
                        {" " + t("сек")}
                      </span>
                      <span>
                        {t("«")}
                        {t(exercise.syllable)}
                        {t("»")}
                      </span>
                    </div>
                    <div className="tile-bottom">
                      <span>{t(practiceRange(practice))}</span>
                      <button
                        className="secondary-button"
                        onClick={() => onSelect(exercise.id)}
                        aria-label={t(`Открыть: ${exercise.title}`)}
                      >
                        {t("Открыть →")}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      {!filtered.length && (
        <div className="library-empty">
          <h2>{t("Пока ничего не найдено")}</h2>
          <p>
            {t(
              collection === "Избранное"
                ? "Нажмите звёздочку на карточке, чтобы сохранить упражнение."
                : collection === "Недавние"
                  ? "Здесь появятся упражнения, которые вы откроете."
                  : "Попробуйте другую цель или длительность.",
            )}
          </p>
          <button
            className="secondary-button"
            onClick={() => {
              setGoal("Все цели");
              setGroup("all");
              setLevel("Все уровни");
              setDuration("Любая длительность");
              setCollection("Все");
            }}
          >
            {t("Показать все")}
          </button>
        </div>
      )}
      {preferences.notice && (
        <p className="library-count" role="status">
          {t(preferences.notice)}
        </p>
      )}
      <p className="library-footnote">
        {t(
          "Длительность указана для стандартного темпа, включая отсчёт. Начните с удобной высоты и пойте без напряжения.",
        )}
      </p>
    </section>
  );
}
