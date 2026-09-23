"use client";

import { useEffect, useRef, useState } from "react";
import { EarPlayer } from "../lib/ear-player";
import {
  EXERCISES,
  EAR_TITLE,
  MODE_NAMES,
  QUESTION_COUNT,
  defaultSettings,
  earText as tr,
  generateQuestions,
  modesFor,
  poolFor,
  scoreAnswers,
  soundEvents,
  type Event,
  type Kind,
  type Mode,
  type Question,
  type Settings,
  type Text,
} from "../lib/ear-training";
import { noteName } from "../lib/pitch";
import { Select, SelectOption } from "./select";

const copy = {
  back: ["Back to exercises", "До вправ", "К упражнениям"],
  settings: ["Session settings", "Налаштування заняття", "Настройки занятия"],
  start: [
    "Start · 20 questions",
    "Почати · 20 запитань",
    "Начать · 20 вопросов",
  ],
  replay: ["Listen again", "Послухати ще раз", "Послушать ещё раз"],
  listen: ["Listen", "Слухати", "Слушать"],
  playing: ["Playing…", "Відтворення…", "Воспроизведение…"],
  next: ["Next question", "Наступне запитання", "Следующий вопрос"],
  result: ["See results", "Переглянути результат", "Посмотреть результат"],
  correct: ["Correct!", "Правильно!", "Правильно!"],
  incorrect: [
    "Not quite. Correct answer:",
    "Не зовсім. Правильна відповідь:",
    "Не совсем. Правильный ответ:",
  ],
  error: [
    "Could not play the audio. Check your connection and try again.",
    "Не вдалося відтворити звук. Перевір з’єднання та спробуй ще раз.",
    "Не удалось воспроизвести звук. Проверь соединение и попробуй ещё раз.",
  ],
  preview: ["Preview", "Прослухати приклад", "Послушать пример"],
  select: [
    "Choose at least two sounds",
    "Обери щонайменше два звуки",
    "Выбери минимум два звука",
  ],
  mode: ["Playback", "Відтворення", "Воспроизведение"],
  root: ["Root note", "Основна нота", "Основная нота"],
  fixed: [
    "Fixed root note",
    "Фіксована основна нота",
    "Фиксированная основная нота",
  ],
  common: [
    "Same root for both intervals",
    "Спільна основа інтервалів",
    "Общая основа интервалов",
  ],
  tempo: ["Tempo", "Темп", "Темп"],
  volume: ["Volume", "Гучність", "Громкость"],
  restart: ["Try again", "Спробувати ще раз", "Попробовать ещё раз"],
  review: ["Answer review", "Розбір відповідей", "Разбор ответов"],
  selected: ["Selected", "Обрано", "Выбрано"],
} satisfies Record<string, Text>;

export function EarTraining() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"catalogue" | "setup" | "quiz" | "result">(
    "catalogue",
  );
  const [busy, setBusy] = useState(false),
    [heard, setHeard] = useState(false),
    [error, setError] = useState(false);
  const [volume, setVolume] = useState(0.65);
  const player = useRef<EarPlayer | null>(null),
    playback = useRef(0),
    answerLock = useRef(false);
  const stop = () => {
    playback.current++;
    player.current?.stop();
    setBusy(false);
    setError(false);
  };
  useEffect(() => {
    // Invalidate in-flight playback before unmounting or stopping a hidden tab.
    const invalidate = () => {
      playback.current++;
    };
    const onHidden = () => {
      if (document.hidden) {
        invalidate();
        player.current?.stop();
        setBusy(false);
      }
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      invalidate();
      player.current?.dispose();
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, []);
  const play = async (events: Event[], marksHeard = false) => {
    const id = ++playback.current;
    setBusy(true);
    setError(false);
    try {
      const completed = await (player.current ??= new EarPlayer()).play(
        events,
        settings?.bpm ?? 100,
        volume,
      );
      if (id === playback.current && completed && marksHeard) setHeard(true);
    } catch {
      if (id === playback.current) setError(true);
    } finally {
      if (id === playback.current) setBusy(false);
    }
  };
  const select = (kind: Kind) => {
    stop();
    setSettings(defaultSettings(kind));
    setPhase("setup");
  };
  const begin = () => {
    if (!settings || settings.selected.length < 2) return;
    stop();
    const generated = generateQuestions(settings);
    setQuestions(generated);
    setAnswers([]);
    setIndex(0);
    setHeard(false);
    answerLock.current = false;
    setPhase("quiz");
    void play(generated[0].events, true);
  };
  const answer = (id: string) => {
    if (answerLock.current || !heard || busy || answers.length > index) return;
    answerLock.current = true;
    setAnswers((previous) => [...previous, id]);
  };
  const next = () => {
    stop();
    if (index === QUESTION_COUNT - 1) {
      setPhase("result");
      return;
    }
    const nextIndex = index + 1;
    setIndex(nextIndex);
    setHeard(false);
    answerLock.current = false;
    void play(questions[nextIndex].events, true);
  };
  const exercise = EXERCISES.find((e) => e.id === settings?.kind);
  const question = questions[index],
    answered = answers.length > index;
  const total = scoreAnswers(questions, answers);
  const update = (value: Partial<Settings>) => {
    stop();
    setSettings((previous) =>
      previous ? { ...previous, ...value } : previous,
    );
  };
  return (
    <section className="ear-training" aria-label={tr(EAR_TITLE)}>
      <header className="ear-heading">
        <div>
          <span className="ear-eyebrow">LUNA / LISTENING STUDIO</span>
          <h1>
            {phase === "catalogue"
              ? tr(EAR_TITLE)
              : exercise && tr(exercise.title)}
          </h1>
          <p>
            {phase === "catalogue"
              ? tr([
                  "Listen closely. Find the pattern. Train your musical ear.",
                  "Слухай уважно. Знаходь закономірності. Розвивай музичний слух.",
                  "Слушай внимательно. Находи закономерности. Развивай музыкальный слух.",
                ])
              : exercise && tr(exercise.description)}
          </p>
        </div>
        <span className="ear-badge">
          20 {tr(["questions", "запитань", "вопросов"])}
        </span>
      </header>
      {phase !== "catalogue" && (
        <button
          className="ear-back"
          onClick={() => {
            stop();
            setPhase("catalogue");
          }}
        >
          ← {tr(copy.back)}
        </button>
      )}
      {phase === "catalogue" ? (
        <>
          <p className="ear-note">
            {tr([
              "Piano sound · No microphone needed · Repeat any question",
              "Звук фортепіано · Без мікрофона · Повторне прослуховування",
              "Звук фортепиано · Без микрофона · Повторное прослушивание",
            ])}
          </p>
          <div className="ear-catalogue">
            {EXERCISES.map((item, i) => (
              <button
                className="ear-card"
                key={item.id}
                onClick={() => select(item.id)}
              >
                <span className="ear-card-top">
                  <span className="ear-number">0{i + 1}</span>
                  <span aria-hidden="true">↗</span>
                </span>
                <span className="ear-symbol" aria-hidden="true">
                  {item.symbol}
                </span>
                <strong>{tr(item.title)}</strong>
                <span className="ear-card-description">
                  {tr(item.description)}
                </span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          {phase === "setup" && settings && (
            <div className="ear-setup">
              <section className="ear-panel">
                <h2>
                  {tr([
                    "Your listening set",
                    "Твій набір звуків",
                    "Твой набор звуков",
                  ])}
                </h2>
                <p className="ear-note">
                  {tr(copy.select)} · {tr(copy.selected)}:{" "}
                  {settings.selected.length}
                </p>
                <div className="ear-selection-actions">
                  <button
                    onClick={() =>
                      update({
                        selected: poolFor(settings.kind).map((s) => s.id),
                      })
                    }
                  >
                    {tr(["Select all", "Обрати всі", "Выбрать все"])}
                  </button>
                  <button onClick={() => update({ selected: [] })}>
                    {tr(["Clear", "Очистити", "Очистить"])}
                  </button>
                </div>
                <div className="ear-sound-list">
                  {poolFor(settings.kind).map((sound, i, pool) => (
                    <div key={sound.id}>
                      {sound.group && sound.group !== pool[i - 1]?.group && (
                        <h3>{tr(sound.group)}</h3>
                      )}
                      <div className="ear-sound-row">
                        <label>
                          <input
                            type="checkbox"
                            checked={settings.selected.includes(sound.id)}
                            onChange={() =>
                              update({
                                selected: settings.selected.includes(sound.id)
                                  ? settings.selected.filter(
                                      (id) => id !== sound.id,
                                    )
                                  : [...settings.selected, sound.id],
                              })
                            }
                          />
                          <span>{tr(sound.name)}</span>
                        </label>
                        <button
                          className="ear-preview"
                          aria-label={`${tr(copy.preview)}: ${tr(sound.name)}`}
                          onClick={() =>
                            void play(
                              soundEvents(
                                sound,
                                settings.kind === "notes" ? 60 : settings.root,
                                settings.mode,
                              ),
                            )
                          }
                        >
                          ▷
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              <aside className="ear-panel ear-options">
                <h2>{tr(copy.settings)}</h2>
                {modesFor(settings.kind).length > 1 && (
                  <label>
                    {tr(copy.mode)}
                    <Select
                      aria-label={tr(copy.mode)}
                      value={settings.mode}
                      onValueChange={(value) => update({ mode: value as Mode })}
                    >
                      {modesFor(settings.kind).map((mode) => (
                        <SelectOption key={mode} value={mode}>
                          {tr(MODE_NAMES[mode])}
                        </SelectOption>
                      ))}
                    </Select>
                  </label>
                )}
                {settings.kind !== "notes" && (
                  <>
                    <label className="ear-toggle">
                      <span>{tr(copy.fixed)}</span>
                      <input
                        type="checkbox"
                        checked={settings.fixed}
                        onChange={(e) => update({ fixed: e.target.checked })}
                      />
                    </label>
                    <label>
                      {tr(copy.root)}
                      <Select
                        aria-label={tr(copy.root)}
                        value={settings.root}
                        disabled={!settings.fixed}
                        onValueChange={(value) =>
                          update({ root: Number(value) })
                        }
                      >
                        {Array.from({ length: 25 }, (_, i) => (
                          <SelectOption key={i} value={36 + i}>
                            {noteName(36 + i)}
                          </SelectOption>
                        ))}
                      </Select>
                    </label>
                  </>
                )}
                {settings.kind === "comparison" && (
                  <label className="ear-toggle">
                    <span>{tr(copy.common)}</span>
                    <input
                      type="checkbox"
                      checked={settings.common}
                      onChange={(e) => update({ common: e.target.checked })}
                    />
                  </label>
                )}
                <label>
                  {tr(copy.tempo)}
                  <Select
                    aria-label={tr(copy.tempo)}
                    value={settings.bpm}
                    onValueChange={(value) => update({ bpm: Number(value) })}
                  >
                    {Array.from({ length: 13 }, (_, i) => (
                      <SelectOption key={i} value={60 + i * 10}>
                        {60 + i * 10} BPM
                      </SelectOption>
                    ))}
                  </Select>
                </label>
                <label>
                  {tr(copy.volume)}
                  <input
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.05"
                    value={volume}
                    onChange={(e) => {
                      stop();
                      setVolume(Number(e.target.value));
                    }}
                  />
                </label>
                {settings.kind === "scales" && (
                  <p className="ear-note">
                    {tr([
                      "Jazz melodic minor keeps the raised 6th and 7th in both directions. Aeolian and natural minor are one answer.",
                      "Джазовий мелодичний мінор зберігає підвищені VI та VII ступені в обох напрямках. Еолійський і натуральний мінор — одна відповідь.",
                      "Джазовый мелодический минор сохраняет повышенные VI и VII ступени в обоих направлениях. Эолийский и натуральный минор — один ответ.",
                    ])}
                  </p>
                )}
                <button
                  className="ear-primary"
                  disabled={settings.selected.length < 2}
                  onClick={begin}
                >
                  {tr(copy.start)} →
                </button>
                {busy && <p role="status">{tr(copy.playing)}</p>}
              </aside>
            </div>
          )}
          {phase === "quiz" && question && (
            <div className="ear-panel ear-quiz">
              <div className="ear-quiz-top">
                <span>
                  {tr(["Question", "Запитання", "Вопрос"])} {index + 1} /{" "}
                  {QUESTION_COUNT}
                </span>
                <span>
                  {total} {tr(["correct", "правильних", "правильных"])}
                </span>
              </div>
              <progress
                max={QUESTION_COUNT}
                value={answers.length}
                aria-label={tr([
                  "Session progress",
                  "Прогрес заняття",
                  "Прогресс занятия",
                ])}
              />
              <div
                className={`ear-listen-display ${busy ? "is-playing" : ""}`}
                aria-hidden="true"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
                  <i key={i} style={{ height: `${18 + ((i * 17) % 60)}px` }} />
                ))}
              </div>
              <button
                className="ear-primary ear-listen"
                onClick={() =>
                  busy ? stop() : void play(question.events, true)
                }
              >
                {busy
                  ? `■ ${tr(copy.playing)}`
                  : `▷ ${tr(heard ? copy.replay : copy.listen)}`}
              </button>
              <p className="ear-note">
                {tr([
                  "Listen, then choose your answer.",
                  "Послухай, потім обери відповідь.",
                  "Послушай, затем выбери ответ.",
                ])}
              </p>
              <div className="ear-answers">
                {question.options.map((option) => (
                  <button
                    key={option.id}
                    disabled={!heard || busy || answered}
                    className={
                      answered
                        ? option.id === question.answer
                          ? "is-correct"
                          : option.id === answers[index]
                            ? "is-wrong"
                            : ""
                        : ""
                    }
                    onClick={() => answer(option.id)}
                  >
                    {tr(option.name)}
                    {answered && option.id === question.answer
                      ? " ✓"
                      : answered && option.id === answers[index]
                        ? " ×"
                        : ""}
                  </button>
                ))}
              </div>
              {answered && (
                <div className="ear-feedback" role="status">
                  <strong>
                    {answers[index] === question.answer
                      ? tr(copy.correct)
                      : `${tr(copy.incorrect)} ${tr(question.options.find((o) => o.id === question.answer)!.name)}`}
                  </strong>
                  <p>{tr(question.detail)}</p>
                  <button className="ear-primary" onClick={next}>
                    {tr(index === QUESTION_COUNT - 1 ? copy.result : copy.next)}{" "}
                    →
                  </button>
                </div>
              )}
            </div>
          )}
          {phase === "result" && (
            <div className="ear-panel ear-results">
              <span className="ear-eyebrow">
                {tr([
                  "SESSION COMPLETE",
                  "ЗАНЯТТЯ ЗАВЕРШЕНО",
                  "ЗАНЯТИЕ ЗАВЕРШЕНО",
                ])}
              </span>
              <h2>
                {Math.round((total / QUESTION_COUNT) * 100)}
                <small>%</small>
              </h2>
              <p>
                {total} / {QUESTION_COUNT}{" "}
                {tr([
                  "correct answers",
                  "правильних відповідей",
                  "правильных ответов",
                ])}
              </p>
              <div className="ear-result-actions">
                <button className="ear-primary" onClick={begin}>
                  {tr(copy.restart)}
                </button>
                <button
                  onClick={() => {
                    stop();
                    setPhase("setup");
                  }}
                >
                  {tr(copy.settings)}
                </button>
              </div>
              <h3>{tr(copy.review)}</h3>
              <div className="ear-review">
                {questions.map((q, i) => (
                  <div key={i}>
                    <span
                      className={
                        q.answer === answers[i] ? "ear-good" : "ear-bad"
                      }
                    >
                      {q.answer === answers[i] ? "✓" : "×"} {i + 1}
                    </span>
                    <span>
                      <strong>
                        {tr(q.options.find((o) => o.id === q.answer)!.name)}
                      </strong>
                      <small>
                        {tr(q.detail)}
                        {q.answer !== answers[i] && (
                          <>
                            {" "}
                            ·{" "}
                            {tr([
                              "Your answer:",
                              "Твоя відповідь:",
                              "Твой ответ:",
                            ])}{" "}
                            {tr(
                              q.options.find((o) => o.id === answers[i])!.name,
                            )}
                          </>
                        )}
                      </small>
                    </span>
                    <button
                      aria-label={`${tr(copy.replay)} ${i + 1}`}
                      onClick={() => void play(q.events)}
                    >
                      ▷
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {error && (
            <p className="ear-error" role="alert">
              {tr(copy.error)}
            </p>
          )}
        </>
      )}
    </section>
  );
}
