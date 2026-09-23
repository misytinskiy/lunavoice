import { Select, SelectOption } from "./select";
import { t, localeTag } from "../lib/i18n";
import { useState } from "react";
import {
  comparable,
  comparisonKey,
  completedSeconds,
  groupScore,
  isScored,
  localDay,
  type AttemptRecord,
} from "../lib/history/model";
import type { HistorySnapshot, HistoryStore } from "../lib/history/store";
import { noteName } from "../lib/pitch";
import { noteFeedback } from "../lib/practice-feedback";
const dateLabel = (iso: string) =>
  new Date(iso).toLocaleString(localeTag(), {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
const statusLabel = (status: string) =>
  status === "completed"
    ? "Завершено"
    : status === "interrupted"
      ? "Прервано"
      : "Не завершено";
function configuration(record: AttemptRecord) {
  return `${noteName(record.practice.baseMidi)} · ${record.practice.bpm} BPM · ${record.practice.fragment ? `ноты ${record.practice.fragment.from + 1}–${record.practice.fragment.to + 1}` : "целиком"}`;
}
export function ProgressView({
  history,
  store,
}: {
  history: HistorySnapshot;
  store: HistoryStore;
}) {
  const [kind, setKind] = useState("attempts"),
    [status, setStatus] = useState("all"),
    [exercise, setExercise] = useState("all"),
    [selectedKey, setSelectedKey] = useState(""),
    [limit, setLimit] = useState(20);
  const records = history.attempts;
  const finished = records.filter((r) => r.status === "completed");
  const today = localDay(new Date());
  const todaySeconds = completedSeconds(records, today);
  const goal = history.preferences.goalMinutes;
  const groups = [
    ...new Map(
      records.filter(isScored).map((record) => [comparisonKey(record), record]),
    ).values(),
  ];
  const chosen =
    groups.find((r) => comparisonKey(r) === selectedKey) ?? groups[0];
  const series = chosen ? comparable(records, chosen).slice(-20) : [];
  const latest = series.at(-1),
    previous = series.at(-2);
  const days = Array.from({ length: 28 }, (_, i) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - 27 + i);
    return date;
  });
  const activeDays = new Set(
    finished.map((r) => localDay(new Date(r.endedAt ?? r.startedAt))),
  ).size;
  const filtered = records.filter(
    (r) =>
      (exercise === "all" || r.practice.exerciseId === exercise) &&
      (status === "all" ||
        (status === "completed"
          ? r.status === "completed"
          : r.status !== "completed")),
  );
  const sessions = history.sessions.filter(
    (r) =>
      status === "all" ||
      (status === "completed"
        ? r.status === "completed"
        : r.status !== "completed"),
  );
  const exerciseOptions = [
    ...new Map(
      records.map((r) => [r.practice.exerciseId ?? "ladder", r.title]),
    ).entries(),
  ];
  if (!history.ready)
    return (
      <section className="progress-page">
        <h1>
          {t("Ваш прогресс")}
          <span>.</span>
        </h1>
        <p role="status">{t("Загружаем локальную историю…")}</p>
      </section>
    );
  return (
    <section className="progress-page" aria-label={t("История и прогресс")}>
      <div className="library-heading">
        <span className="eyebrow">{t("ШАГ ЗА ШАГОМ")}</span>
        <h1>
          {t("Ваш прогресс")}
          <span>.</span>
        </h1>
        <p>
          {t(
            "Замечайте, что получается лучше. Возвращайтесь к своей практике.",
          )}
        </p>
      </div>
      <p className="history-save-status" role="status">
        {t(
          history.saving
            ? "Сохраняем изменения…"
            : history.notice
              ? "Проверьте сообщение о хранилище выше."
              : "История сохранена в этом браузере.",
        )}
      </p>
      <div className="progress-summary">
        <div>
          <strong>{t(finished.length)}</strong>
          <span>{t("Завершённых упражнений")}</span>
        </div>
        <div>
          <strong>{t((completedSeconds(records) / 60).toFixed(1))}</strong>
          <span>{t("Минут практики")}</span>
        </div>
        <div>
          <strong>{t(activeDays)}</strong>
          <span>{t("Дней с практикой")}</span>
        </div>
      </div>
      <div className="progress-panels">
        <section className="goal-panel">
          <span className="eyebrow">{t("СЕГОДНЯ")}</span>
          <h2>
            {t((todaySeconds / 60).toFixed(1))}{" "}
            <span>
              / {t(goal)}
              {" " + t("мин")}
            </span>
          </h2>
          <progress
            aria-label={t("Сегодняшняя цель")}
            max={goal * 60}
            value={Math.min(goal * 60, todaySeconds)}
          />
          <label>
            {t("Ежедневная цель")}
            <Select
              aria-label={t("Ежедневная цель")}
              value={goal}
              onValueChange={(selectedValue) =>
                store.updatePreferences({ goalMinutes: Number(selectedValue) })
              }
            >
              {[1, 3, 5, 10, 15].map((value) => (
                <SelectOption key={value} value={value}>
                  {t(value)}
                  {" " + t("мин")}
                </SelectOption>
              ))}
            </Select>
          </label>
          <label className="reminder-checkbox">
            <input
              type="checkbox"
              checked={history.preferences.reminder}
              onChange={(e) =>
                store.updatePreferences({ reminder: e.target.checked })
              }
            />
            {t("Напоминать внутри приложения")}
          </label>
          <p>
            {t(
              "Считаем длительность нот завершённых упражнений. Паузы и прослушивание не входят в цель.",
            )}
          </p>
        </section>
        <section className="calendar-panel">
          <span className="eyebrow">{t("ПОСЛЕДНИЕ 28 ДНЕЙ")}</span>
          <h2>{t("Ритм занятий")}</h2>
          <div className="activity-calendar">
            {days.map((date) => {
              const day = localDay(date),
                seconds = completedSeconds(records, day);
              const label = `${date.toLocaleDateString(localeTag(), { day: "numeric", month: "long" })}: ${(seconds / 60).toFixed(1)} мин`;
              return (
                <div
                  key={day}
                  className={seconds ? "active-day" : ""}
                  title={t(label)}
                  aria-label={t(label)}
                >
                  <span>{t(date.getDate())}</span>
                  {seconds > 0 && <b aria-hidden="true">✓</b>}
                </div>
              );
            })}
          </div>
          <p>
            {t(
              "✓ — есть завершённые упражнения. Незавершённые попытки не отмечаются.",
            )}
          </p>
        </section>
      </div>
      {finished.length > 0 && (
        <section className="exercise-statistics">
          <span className="eyebrow">{t("ПРАКТИКА ПО УПРАЖНЕНИЯМ")}</span>
          {[
            ...new Set(finished.map((record) => record.practice.exerciseId)),
          ].map((id) => {
            const attempts = finished.filter(
              (record) => record.practice.exerciseId === id,
            );
            return (
              <div key={id}>
                <strong>{t(attempts[0].title)}</strong>
                <span>
                  {t("Завершено:") + " "}
                  {t(attempts.length)}
                </span>
                <span>
                  {t((completedSeconds(attempts) / 60).toFixed(1))}
                  {" " + t("мин")}
                </span>
              </div>
            );
          })}
        </section>
      )}
      <section className="comparison-panel" id="comparison-panel">
        <div className="comparison-heading">
          <div>
            <span className="eyebrow">{t("СРАВНИВАЕМ СОПОСТАВИМОЕ")}</span>
            <h2>{t("Точность со временем")}</h2>
          </div>
          {latest && (
            <div className="comparison-score">
              <strong>{t(latest.score)}%</strong>
              <span>
                {t(
                  previous
                    ? `${latest.score! - previous.score! > 0 ? "+" : ""}${latest.score! - previous.score!} п. п. к прошлой попытке`
                    : "Первая попытка с этими настройками",
                )}
              </span>
            </div>
          )}
        </div>
        {chosen ? (
          <>
            <label>
              {t("Группа попыток")}
              <Select
                aria-label={t("Группа попыток")}
                value={comparisonKey(chosen)}
                onValueChange={(selectedValue) => setSelectedKey(selectedValue)}
              >
                {groups.map((r, i) => (
                  <SelectOption key={comparisonKey(r)} value={comparisonKey(r)}>
                    {t(r.title)} · {t(configuration(r))}
                    {" " + t("· вариант") + " "}
                    {t(i + 1)}
                  </SelectOption>
                ))}
              </Select>
            </label>
            <p>
              {t(
                "Совпадают упражнение и его версия, диапазон, темп, фрагмент, алгоритм оценки, микрофон и настройки звука. Показываем последние 20 попыток этой группы.",
              )}
            </p>
            <svg
              className="progress-chart"
              viewBox="0 0 600 180"
              role="img"
              aria-label={t(
                `Точность по порядку: ${series.map((r) => `${r.score}%`).join(", ")}`,
              )}
            >
              <line x1="70" y1="150" x2="580" y2="150" />
              <line x1="70" y1="20" x2="580" y2="20" />
              <text x="0" y="154">
                0
              </text>
              <text x="0" y="24">
                100
              </text>
              <polyline
                points={series
                  .map(
                    (r, i) =>
                      `${series.length === 1 ? 325 : 70 + (i * 510) / (series.length - 1)},${150 - r.score! * 1.3}`,
                  )
                  .join(" ")}
              />
              {series.map((r, i) => (
                <circle
                  key={r.id}
                  cx={
                    series.length === 1
                      ? 325
                      : 70 + (i * 510) / (series.length - 1)
                  }
                  cy={150 - r.score! * 1.3}
                  r="4"
                >
                  <title>
                    {t(dateLabel(r.startedAt))} · {t(r.score)}%
                  </title>
                </circle>
              ))}
            </svg>
            <div className="chart-dates">
              <span>{t(dateLabel(series[0].startedAt))}</span>
              <span>{t(dateLabel(latest!.startedAt))}</span>
            </div>
          </>
        ) : (
          <p className="history-empty">
            {t(
              "Здесь появится график после завершённой попытки с оценкой. Для оценки используйте наушники.",
            )}
          </p>
        )}
      </section>
      <section className="history-panel">
        <div className="history-heading">
          <h2>{t("История")}</h2>
          <div className="history-actions">
            <button
              className="secondary-button"
              onClick={store.export}
              disabled={!records.length && !history.sessions.length}
            >
              {t("Скачать JSON")}
            </button>
            <button
              className="secondary-button danger-button"
              disabled={!records.length && !history.sessions.length}
              onClick={() => {
                if (
                  window.confirm(
                    t(
                      "Удалить всю историю упражнений и занятий на этом устройстве? Настройки и избранное сохранятся.",
                    ),
                  )
                )
                  store.clear();
              }}
            >
              {t("Удалить историю")}
            </button>
          </div>
        </div>
        <div className="library-collections">
          <button
            aria-pressed={kind === "attempts"}
            onClick={() => {
              setKind("attempts");
              setLimit(20);
            }}
          >
            {t("Упражнения")}
          </button>
          <button
            aria-pressed={kind === "sessions"}
            onClick={() => {
              setKind("sessions");
              setLimit(20);
            }}
          >
            {t("Занятия")}
          </button>
        </div>
        <div className="library-filters">
          <label>
            {t("Состояние")}
            <Select
              aria-label={t("Состояние попытки")}
              value={status}
              onValueChange={(selectedValue) => {
                setStatus(selectedValue);
                setLimit(20);
              }}
            >
              <SelectOption value="all">{t("Все попытки")}</SelectOption>
              <SelectOption value="completed">{t("Завершённые")}</SelectOption>
              <SelectOption value="unfinished">
                {t("Прерванные и незавершённые")}
              </SelectOption>
            </Select>
          </label>
          {kind === "attempts" && (
            <label>
              {t("Упражнение")}
              <Select
                aria-label={t("Упражнение в истории")}
                value={exercise}
                onValueChange={(selectedValue) => {
                  setExercise(selectedValue);
                  setLimit(20);
                }}
              >
                <SelectOption value="all">{t("Все упражнения")}</SelectOption>
                {exerciseOptions.map(([id, title]) => (
                  <SelectOption key={id} value={id}>
                    {t(title)}
                  </SelectOption>
                ))}
              </Select>
            </label>
          )}
        </div>
        {kind === "attempts" ? (
          <div className="history-list">
            {filtered.slice(0, limit).map((record) => (
              <details className="history-attempt" key={record.id}>
                <summary>
                  <span>
                    <strong>{t(record.title)}</strong>
                    <small>
                      {t(dateLabel(record.startedAt))} ·{" "}
                      {t(configuration(record))}
                    </small>
                  </span>
                  <span className="attempt-score">
                    {t(
                      record.status === "completed"
                        ? record.score === null
                          ? "Без оценки"
                          : `${record.score}%`
                        : statusLabel(record.status),
                    )}
                  </span>
                </summary>
                <div className="history-detail">
                  <p>
                    {t(record.sessionId ? "Часть короткого занятия. " : "")}
                    {t(statusLabel(record.status))}. {t(record.reason)}
                  </p>
                  {record.result && record.score !== null && (
                    <>
                      <p>
                        {t("Голос распознан") + " "}
                        {t(record.result.voicedPercent)}
                        {t("% времени. Выше цели:") + " "}
                        {t(record.result.aboveSeconds.toFixed(1))}
                        {" " + t("с · ниже:") + " "}
                        {t(record.result.belowSeconds.toFixed(1))}
                        {" " + t("с.")}
                      </p>
                      <ol className="history-notes">
                        {record.result.notes.map((note) => (
                          <li key={note.position}>
                            <span>
                              #{t(note.position + 1)} · {t(noteName(note.midi))}
                            </span>
                            <strong>{t(note.percent)}%</strong>
                            <span>{t(noteFeedback(note))}</span>
                          </li>
                        ))}
                      </ol>
                    </>
                  )}
                  <div className="history-actions">
                    {isScored(record) && (
                      <button
                        className="secondary-button"
                        onClick={() => {
                          setSelectedKey(comparisonKey(record));
                          document
                            .getElementById("comparison-panel")
                            ?.scrollIntoView({ behavior: "smooth" });
                        }}
                      >
                        {t("Сравнить такие попытки")}
                      </button>
                    )}
                    <button
                      className="secondary-button danger-button"
                      onClick={() => {
                        if (
                          window.confirm(
                            t(
                              "Удалить эту попытку? Если она входит в занятие, его общий итог тоже будет удалён.",
                            ),
                          )
                        )
                          store.deleteAttempt(record.id);
                      }}
                    >
                      {t("Удалить попытку")}
                    </button>
                  </div>
                </div>
              </details>
            ))}
            {!filtered.length && (
              <p className="history-empty">
                {t(
                  "Пока нет таких попыток. Завершите упражнение или измените фильтр.",
                )}
              </p>
            )}
          </div>
        ) : (
          <div className="history-list">
            {sessions.slice(0, limit).map((session) => (
              <details className="history-attempt" key={session.id}>
                <summary>
                  <span>
                    <strong>{t(session.title)}</strong>
                    <small>
                      {t(dateLabel(session.startedAt))} ·{" "}
                      {t(statusLabel(session.status))}
                    </small>
                  </span>
                  <span className="attempt-score">
                    {t(
                      groupScore(session, records) === null
                        ? "—"
                        : `${groupScore(session, records)}%`,
                    )}
                  </span>
                </summary>
                <div className="history-detail">
                  <p>
                    {t(
                      "Общий результат взвешен по длительности нот. Упражнения этого занятия также доступны во вкладке «Упражнения».",
                    )}
                  </p>
                  <ol className="history-notes">
                    {session.attemptIds.map((id, i) => {
                      const record = records.find((r) => r.id === id);
                      return (
                        <li key={i}>
                          <span>
                            {t(record?.title ?? `Упражнение ${i + 1}`)}
                          </span>
                          <span>
                            {t(
                              record
                                ? record.status === "completed"
                                  ? record.score === null
                                    ? "Без оценки"
                                    : `${record.score}%`
                                  : statusLabel(record.status)
                                : "Не начато",
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                  <button
                    className="secondary-button danger-button"
                    onClick={() => {
                      if (
                        window.confirm(t("Удалить занятие и все его попытки?"))
                      )
                        store.deleteSession(session.id);
                    }}
                  >
                    {t("Удалить занятие")}
                  </button>
                </div>
              </details>
            ))}
            {!sessions.length && (
              <p className="history-empty">
                {t("Здесь появятся короткие занятия из библиотеки.")}
              </p>
            )}
          </div>
        )}
        {(kind === "attempts" ? filtered.length : sessions.length) > limit && (
          <button
            className="secondary-button"
            onClick={() => setLimit(limit + 20)}
          >
            {t("Показать ещё")}
          </button>
        )}
      </section>
      <p className="library-footnote">
        {t(
          "История хранится в этом браузере. Исходное аудио не записывается. Очистка данных сайта удалит локальную историю; JSON позволяет сохранить её копию.",
        )}
      </p>
    </section>
  );
}
