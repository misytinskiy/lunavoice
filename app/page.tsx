"use client";
import { LanguageSwitcher } from "./components/language-switcher";
import { useLocale } from "./hooks/use-locale";
import { t } from "./lib/i18n";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LEAD_IN, noteName } from "./lib/pitch";
import {
  DEFAULT_PRACTICE,
  normalizePractice,
  practiceNotes,
  practiceDuration,
  type PracticeSettings,
} from "./lib/practice";
import { PracticeControls } from "./components/practice-controls";
import { PracticeResult } from "./components/practice-result";
import { drawStaff } from "./components/pitch-canvas";
import { AudioSetup } from "./components/audio-setup";
import { VoiceRangeDialog } from "./components/voice-range";
import { getExercise } from "./lib/exercises";
import { ExerciseLibrary } from "./components/exercise-library";
import { SessionPanel } from "./components/session-panel";
import { useHistory } from "./hooks/use-history";
import { ProgressView } from "./components/progress-view";
import { EarTraining } from "./components/ear-training";
import { Piano } from "./components/piano";
import { EAR_TITLE, earText } from "./lib/ear-training";
import { practiceRound } from "./lib/practice";
import { fitVoiceRange, readVoiceRange } from "./lib/voice-range";
import { completedSeconds, localDay } from "./lib/history/model";
import { useLibrary } from "./hooks/use-library";
import {
  createSession,
  acceptSessionResult,
  type PracticeSession,
} from "./lib/session";
import { useAccount, type Account } from "./hooks/use-account";
import { useCloudSync } from "./hooks/use-cloud-sync";
import { AccountView } from "./components/account-view";
import { useAudioEngine } from "./hooks/use-audio-engine";
function Icon({
  name,
  size = 20,
}: {
  name: "mic" | "play" | "pause" | "headphones" | "reset" | "arrow" | "music";
  size?: number;
}) {
  const paths = {
    mic: (
      <>
        <rect x="9" y="2" width="6" height="13" rx="3" />
        <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" />
      </>
    ),
    play: <path d="m9 5 11 7-11 7Z" />,
    pause: (
      <>
        <path d="M8 5v14M16 5v14" strokeWidth="4" />
      </>
    ),
    headphones: (
      <>
        <path d="M4 14v-3a8 8 0 0 1 16 0v3" />
        <rect x="3" y="12" width="4" height="8" rx="2" />
        <rect x="17" y="12" width="4" height="8" rx="2" />
      </>
    ),
    reset: (
      <>
        <path d="M4 10a8 8 0 1 1 1 8M4 4v6h6" />
      </>
    ),
    arrow: <path d="m14 6-6 6 6 6" />,
    music: (
      <>
        <path d="M9 17V5l11-2v12M9 8l11-2" />
        <ellipse cx="6" cy="18" rx="3" ry="2" />
        <ellipse cx="17" cy="16" rx="3" ry="2" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {t(paths[name])}
    </svg>
  );
}
export default function Page() {
  useLocale();
  const account = useAccount();
  if (!account.ready)
    return (
      <div className="account-loading" role="status">
        {t("Luna Voice · загрузка…")}
      </div>
    );
  return <Home key={account.session?.user.id ?? "guest"} account={account} />;
}
function Home({ account }: { account: Account }) {
  const owner = account.session?.user.id;
  const audio = useAudioEngine();
  const library = useLibrary(owner);
  const history = useHistory(audio.engine, owner);
  const cloud = useCloudSync(account.client, history.store);
  const preferencesRestored = useRef(false);
  const lastAppliedPreferences = useRef("");
  const [reminderHidden, setReminderHidden] = useState(false);
  const [view, setView] = useState<
    "practice" | "library" | "progress" | "account" | "ear" | "piano"
  >(account.returned || account.recovery ? "account" : "library");
  const [session, setSession] = useState<PracticeSession | null>(null);
  const { engine, status, time, pitch, error, listening, volume } = audio;
  const [practice, setPractice] = useState<PracticeSettings>(() =>
    normalizePractice({ ...DEFAULT_PRACTICE, series: { rounds: 8, step: 1 } }),
  );
  const [manualSetupOpen, setSetupOpen] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);
  const setupOpen = !rangeOpen && (manualSetupOpen || audio.setupRequired);
  const canvas = useRef<HTMLCanvasElement>(null);
  const exercise = getExercise(practice.exerciseId);
  const notes = practiceNotes(practice);
  const savedRange = readVoiceRange(owner);
  const outsideRange =
    savedRange &&
    notes.some(
      (n) => n.midi < savedRange.low + 1 || n.midi > savedRange.high - 1,
    );
  const duration = practiceDuration(notes);
  const active = notes.find(
    (note) => time >= note.start && time < note.start + note.duration,
  );
  const running = status === "playing" || status === "paused";
  const microphoneHint = {
    silence: "Пока тишина — потяните «Ма»",
    quiet: "Тихо — подойдите ближе к микрофону",
    clipping: "Перегрузка — отойдите от микрофона",
    unstable: "Высота неустойчива — потяните звук",
    voiced: "Слышим ваш голос",
  }[audio.reading.state];
  useEffect(
    () =>
      history.store.subscribe(() => {
        const value = history.store.getSnapshot();
        if (!value.ready) return;
        const prefs = value.preferences;
        const signature = JSON.stringify(prefs);
        if (signature === lastAppliedPreferences.current) return;
        if (
          preferencesRestored.current &&
          (!owner ||
            ["playing", "paused", "loading", "checking"].includes(
              engine.getSnapshot().status,
            ))
        )
          return;
        preferencesRestored.current = true;
        lastAppliedPreferences.current = signature;
        let restored = normalizePractice({
          exerciseId: prefs.lastExerciseId,
          baseMidi: prefs.baseMidi,
          bpm: prefs.tempos[prefs.lastExerciseId],
          series: { rounds: 8, step: 1 },
        });
        const range = readVoiceRange(owner);
        if (range) restored = fitVoiceRange(restored, range) ?? restored;
        setPractice(restored);
        engine.setVolume(prefs.volume);
      }),
    [engine, history.store, owner],
  );
  const reset = engine.reset;
  const togglePause = engine.togglePause;
  function start(preview = false) {
    launch(practice, preview);
  }
  function launch(value: PracticeSettings, preview = false) {
    preferencesRestored.current = true;
    history.store.rememberPractice(value);
    library.store.visit(getExercise(value.exerciseId).id);
    const needsSetup = !preview && !engine.getSnapshot().settings.checked;
    setSetupOpen(needsSetup);
    void engine.prepare(value, preview, !needsSetup && !preview);
  }
  async function changePractice(value: PracticeSettings) {
    preferencesRestored.current = true;
    const next = normalizePractice(value);
    if (status === "checking") {
      if (await engine.retarget(next)) {
        setPractice(next);
        history.store.rememberPractice(next);
      }
    } else {
      engine.reset();
      setPractice(next);
      history.store.rememberPractice(next);
    }
  }
  function openExercise(id: string) {
    preferencesRestored.current = true;
    engine.reset();
    history.store.endSession();
    setSetupOpen(false);
    setSession(null);
    let next = normalizePractice({
      exerciseId: id,
      baseMidi: practice.baseMidi,
      bpm: history.preferences.tempos[id],
      series: { rounds: 8, step: 1 },
    });
    const range = readVoiceRange(owner);
    if (range) next = fitVoiceRange(next, range) ?? next;
    setPractice(next);
    setView("practice");
    history.store.rememberPractice(next);
    library.store.visit(id);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function openLibrary() {
    engine.reset();
    history.store.endSession();
    setSetupOpen(false);
    setSession(null);
    setView("library");
  }
  function openProgress() {
    engine.reset();
    history.store.endSession();
    setSetupOpen(false);
    setSession(null);
    setView("progress");
  }
  function startSession() {
    engine.reset();
    const next = createSession(practice.baseMidi);
    const range = readVoiceRange(owner);
    next.queue = next.queue.map((item) => {
      const value = normalizePractice({
        ...item,
        series: { rounds: 8, step: 1 },
      });
      return range ? (fitVoiceRange(value, range) ?? value) : value;
    });
    history.store.startSession(next.queue);
    setSession(next);
    setPractice(next.queue[0]);
    setView("practice");
    launch(next.queue[0]);
  }
  function nextInSession() {
    if (!session || session.phase !== "rest" || Date.now() < session.resumeAt)
      return;
    const index = session.index + 1;
    let next = normalizePractice({
      ...session.queue[index],
      baseMidi: practice.baseMidi,
    });
    const range = readVoiceRange(owner);
    if (range) next = fitVoiceRange(next, range) ?? next;
    const queue = session.queue.map((item, i) => (i === index ? next : item));
    history.store.setSessionStage(index);
    setSession({ ...session, queue, index, phase: "active" });
    setPractice(next);
    launch(next);
  }
  useEffect(
    () =>
      engine.subscribe(() => {
        const snapshot = engine.getSnapshot();
        if (snapshot.setupRequired) setSetupOpen(true);
        if (snapshot.status === "finished")
          setSession((previous) =>
            previous
              ? acceptSessionResult(previous, snapshot, Date.now())
              : null,
          );
      }),
    [engine],
  );
  function repeat(fragment: PracticeSettings["fragment"]) {
    const next = { ...audio.practice, fragment };
    setPractice(next);
    launch(next);
  }
  useEffect(() => {
    const element = canvas.current;
    if (!element || view !== "practice") return;
    let frame = 0;
    const font = window.getComputedStyle(element).fontFamily;
    const sequence = practiceNotes(practice);
    const draw = () => {
      const visual = engine.getVisual();
      drawStaff(
        element,
        visual.time,
        sequence,
        visual.history,
        practiceRound(practice, visual.time).root,
        font,
      );
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [engine, practice, view]);
  const percent = Math.min(
    100,
    Math.max(0, ((time - LEAD_IN) / (duration - LEAD_IN)) * 100),
  );
  const completedNotes = notes.filter(
    (note) => time >= note.start + note.duration,
  ).length;
  const transportLabel =
    status === "loading"
      ? "Подготовка…"
      : status === "playing"
        ? "Пауза"
        : status === "paused"
          ? "Продолжить"
          : "Начать упражнение";
  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="brand" href="/" aria-label={t("Luna Voice — главная")}>
          <span className="brand-dot" />
          <span>Luna Voice</span>
        </Link>
        <div className="left-part">
          <LanguageSwitcher />
          <button
            className="account-header-button"
            aria-current={view === "account" ? "page" : undefined}
            onClick={() => {
              engine.reset();
              history.store.endSession();
              setSetupOpen(false);
              setSession(null);
              setView("account");
            }}
          >
            {t(owner ? "Аккаунт" : "Войти")}
          </button>
        </div>
      </header>
      {setupOpen && (
        <AudioSetup
          state={audio}
          engine={engine}
          onCheck={() => {
            setSetupOpen(true);
            void engine.prepare(practice);
          }}
          onClose={() => {
            engine.reset();
            setSetupOpen(false);
          }}
          onBegin={async () => {
            if (await engine.begin()) setSetupOpen(false);
          }}
        />
      )}
      {rangeOpen && (
        <VoiceRangeDialog
          engine={engine}
          state={audio}
          practice={practice}
          owner={owner}
          onApply={changePractice}
          onClose={() => {
            engine.reset();
            setRangeOpen(false);
          }}
        />
      )}
      <main>
        <nav
          className="practice-navigation"
          aria-label={t("Разделы приложения")}
        >
          <button
            aria-current={view === "library" ? "page" : undefined}
            onClick={openLibrary}
          >
            {t("Библиотека")}
          </button>
          <button
            aria-current={view === "practice" ? "page" : undefined}
            onClick={() => setView("practice")}
          >
            {t("Практика")}
          </button>
          <button
            aria-current={view === "progress" ? "page" : undefined}
            onClick={openProgress}
          >
            {t("Прогресс")}
          </button>
          <button
            aria-current={view === "ear" ? "page" : undefined}
            onClick={() => {
              engine.reset();
              history.store.endSession();
              setSetupOpen(false);
              setSession(null);
              setView("ear");
            }}
          >
            {earText(EAR_TITLE)}
          </button>
          <button
            aria-current={view === "piano" ? "page" : undefined}
            onClick={() => {
              engine.reset();
              history.store.endSession();
              setSetupOpen(false);
              setRangeOpen(false);
              setSession(null);
              setView("piano");
            }}
          >
            {earText(["Piano", "Піаніно", "Пианино"])}
          </button>
        </nav>
        {owner && view !== "account" && cloud.error && (
          <div className="storage-notice" role="status">
            <span>{t(cloud.error)}</span>
            <button
              className="secondary-button"
              onClick={cloud.retry}
              disabled={cloud.busy}
            >
              {t("Повторить синхронизацию")}
            </button>
          </div>
        )}
        {history.notice && (
          <div className="storage-notice" role="status">
            <span>{t(history.notice)}</span>
            <button
              className="secondary-button"
              disabled={history.saving}
              onClick={history.store.retry}
            >
              {t("Повторить сохранение")}
            </button>
          </div>
        )}
        {history.ready &&
          history.preferences.reminder &&
          !reminderHidden &&
          !running &&
          !setupOpen &&
          view !== "progress" &&
          view !== "account" &&
          completedSeconds(history.attempts, localDay(new Date())) <
            history.preferences.goalMinutes * 60 && (
            <div className="practice-reminder">
              <span>
                {t("Ваша цель сегодня —") + " "}
                {t(history.preferences.goalMinutes)}
                {" " + t("мин практики.")}
              </span>
              <div className="practice-reminder-buttons">
                <button onClick={openProgress}>
                  {t("Посмотреть прогресс")}
                </button>
                <button
                  aria-label={t("Скрыть напоминание")}
                  onClick={() => setReminderHidden(true)}
                  className="close-button"
                >
                  ×
                </button>
              </div>
            </div>
          )}
        {view === "account" && (
          <AccountView account={account} store={history.store} sync={cloud} />
        )}
        {view === "progress" && (
          <ProgressView history={history} store={history.store} />
        )}
        {view === "ear" && <EarTraining />}
        {view === "piano" && <Piano />}

        {view === "library" && (
          <ExerciseLibrary
            preferences={
              owner ? { ...library, favorites: history.favorites } : library
            }
            onFavorite={
              owner
                ? history.store.toggleFavorite
                : library.store.toggleFavorite
            }
            onSelect={openExercise}
            onSession={startSession}
            baseMidi={practice.baseMidi}
          />
        )}
        <div hidden={view !== "practice"}>
          <div className="breadcrumb">
            <span>{t("Вокальная практика")}</span>
            <span>/</span>
            <span>{t("Первые шаги")}</span>
          </div>
          {session && (
            <SessionPanel
              session={session}
              onNext={nextInSession}
              onExit={openLibrary}
            />
          )}
          <section
            className="exercise-heading"
            hidden={session?.phase === "complete"}
          >
            <div>
              <div className="eyebrow">
                {t(exercise.goal)} · {t(exercise.level)}
                {" " + t("уровень")}
              </div>
              <h1>
                {t(exercise.title)}
                <span>.</span>
              </h1>
              <p>
                {t(exercise.description)}
                {" " + t("· пойте на «")}
                {t(exercise.syllable)}
                {t("»")}
              </p>
            </div>
            <div
              className="lesson-progress"
              aria-label={t(
                `Завершено ${completedNotes} из ${notes.length} нот`,
              )}
            >
              <div>
                <strong>{t(String(completedNotes).padStart(2, "0"))}</strong>
                <span>/ {t(String(notes.length).padStart(2, "0"))}</span>
              </div>
              <div className="progress-segments" aria-hidden="true">
                {notes.map((note, index) => (
                  <span
                    key={note.start}
                    className={
                      index < completedNotes
                        ? "complete"
                        : active === note
                          ? "current"
                          : ""
                    }
                  />
                ))}
              </div>
              <span className="progress-caption">
                {t("ТРЕНИРУЕМ ТОЧНОСТЬ ИНТОНАЦИИ")}
              </span>
            </div>
          </section>
          <section
            className="practice-card"
            aria-label={t("Вокальное упражнение")}
            hidden={session?.phase === "complete"}
          >
            {outsideRange && (
              <p className="setup-note" role="status">
                {earText([
                  "This exercise extends beyond your saved comfortable range. Adjust the key or number of passes in the controls, or choose a narrower melody.",
                  "Вправа виходить за збережений комфортний діапазон. Зміни тональність чи кількість проходів або обери вужчу мелодію.",
                  "Упражнение выходит за сохранённый комфортный диапазон. Измени тональность или число проходов либо выбери более узкую мелодию.",
                ])}
              </p>
            )}
            <div className="practice-toolbar">
              <div className="exercise-info">
                <span className="live-dot" />
                <strong>{t(exercise.title.toUpperCase())}</strong>
                <span className="toolbar-separator" />
                <span>
                  {t("Нот:") + " "}
                  {t(notes.length)}
                </span>
                <span className="duration-label">
                  ~{t(Math.ceil(duration))}
                  {" " + t("сек")}
                </span>
              </div>
              <button
                className="audio-settings-button"
                disabled={running || status === "loading"}
                onClick={() => {
                  engine.reset();
                  setSetupOpen(false);
                  setRangeOpen(true);
                }}
              >
                {earText([
                  "Vocal range",
                  "Вокальний діапазон",
                  "Вокальный диапазон",
                ])}
              </button>
              <button
                className="audio-settings-button"
                disabled={running || status === "loading"}
                onClick={() => setSetupOpen(true)}
              >
                <Icon name="mic" size={14} />
                {t("Настроить звук")}
              </button>
            </div>
            <div className="exercise-description">
              <span>
                {t(exercise.level)}
                {" " + t("уровень")}
              </span>
              <span>
                {t("Цель:") + " "}
                {t(exercise.goal.toLowerCase())}
              </span>
              {practice.fragment && (
                <strong>
                  {t("Фрагмент: ноты") + " "}
                  {t(practice.fragment.from + 1)}–{t(practice.fragment.to + 1)}
                </strong>
              )}
            </div>
            <PracticeControls
              value={practice}
              disabled={running || status === "loading" || !!session}
              onChange={changePractice}
            />
            {status === "finished" && (
              <PracticeResult
                audio={audio}
                onRepeat={repeat}
                canRepeat={!session}
              />
            )}
            <div className="staff-wrapper" hidden={status === "finished"}>
              <div className="staff-top" aria-hidden="true">
                <span className="past-label">{t("ПРОШЛОЕ")}</span>
                <span className="now-label">{t("СЕЙЧАС")}</span>
                <span className="next-label">{t("ДАЛЬШЕ")}</span>
              </div>
              <canvas
                ref={canvas}
                className="staff-canvas"
                aria-label={t(
                  "Ноты движутся справа налево. Пойте, когда начало ноты пересечёт пунктир. Линия показывает высоту вашего голоса.",
                )}
                role="img"
              />
              {status === "idle" && !setupOpen && (
                <div className="staff-hint">
                  <span className="hint-symbol">
                    <Icon name="mic" size={22} />
                  </span>
                  <strong>{t("Найдите свою ноту")}</strong>
                  <span>
                    {t("Нажмите «Начать» и пойте на слог «")}
                    {t(exercise.syllable)}
                    {t("»")}
                  </span>
                </div>
              )}
              {status === "playing" && time < LEAD_IN && (
                <div className="countdown" aria-live="polite">
                  <strong>{t(Math.max(1, Math.ceil(LEAD_IN - time)))}</strong>
                  <span>
                    {t(listening ? "Слушайте мелодию" : "Приготовьтесь петь")}
                  </span>
                </div>
              )}
              {status === "loading" && !setupOpen && (
                <div className="state-overlay">
                  <h2>{t("Готовим упражнение")}</h2>
                  <p>{t(audio.notice)}</p>
                  <button className="secondary-button" onClick={reset}>
                    {t("Отменить")}
                  </button>
                </div>
              )}
              {status === "paused" && (
                <div className="state-overlay">
                  <span className="overlay-icon">
                    <Icon name="pause" size={26} />
                  </span>
                  <h2>{t("Небольшая пауза")}</h2>
                  <p>{t(audio.notice || "Продолжим, когда будете готовы.")}</p>
                  <button className="primary-button" onClick={togglePause}>
                    <Icon name="play" />
                    {t("Продолжить")}
                  </button>
                </div>
              )}
            </div>
            <div className="voice-readout">
              <span>
                {t(listening && running ? "ПРОСЛУШИВАНИЕ" : "ВАШ ГОЛОС")}
              </span>
              <strong
                className={
                  pitch !== null &&
                  active &&
                  Math.abs(pitch - active.midi) <= 0.5
                    ? "on-pitch"
                    : ""
                }
              >
                {t(
                  running && !listening && pitch !== null
                    ? noteName(pitch)
                    : "—",
                )}
              </strong>
              <div className="chart-legend">
                <span className="legend-note" />
                {" " + t("Нота")} <span className="legend-voice" />
                {" " + t("Ваш голос")}
              </div>
            </div>
            <div className="controls">
              <div
                className={`mic-status ${running && !listening ? "connected" : ""}`}
              >
                <span className="mic-icon">
                  <Icon name="mic" />
                </span>
                <div>
                  <strong>
                    {t(
                      running && !listening
                        ? pitch === null
                          ? "Пойте в микрофон"
                          : `Ваш голос · ${noteName(pitch)}`
                        : listening && running
                          ? "Прослушивание"
                          : "Ваш микрофон",
                    )}
                  </strong>
                  <span>
                    {t(
                      running && !listening
                        ? audio.reading.state !== "voiced"
                          ? microphoneHint
                          : active && pitch !== null
                            ? Math.abs(pitch - active.midi) <= 0.5
                              ? "Точно в ноту"
                              : pitch > active.midi
                                ? "Попробуйте чуть ниже"
                                : "Попробуйте чуть выше"
                            : "Слушаем ваш голос"
                        : "Проверка перед стартом",
                    )}
                  </span>
                </div>
              </div>
              <div className="play-controls">
                <button
                  className="icon-button"
                  onClick={reset}
                  disabled={status === "idle"}
                  aria-label={t("Сбросить упражнение")}
                >
                  <Icon name="reset" />
                </button>
                <button
                  className="primary-button transport-button"
                  aria-label={t(transportLabel)}
                  title={t(transportLabel)}
                  disabled={
                    status === "loading" ||
                    (!!session && session.phase !== "active")
                  }
                  onClick={() => (running ? togglePause() : start())}
                >
                  <Icon name={status === "playing" ? "pause" : "play"} />
                  <span className="transport-label">{t(transportLabel)}</span>
                </button>
                <button
                  className="icon-button"
                  disabled={running || status === "loading" || !!session}
                  onClick={() => start(true)}
                  title={t("Послушать упражнение без микрофона")}
                  aria-label={t("Послушать упражнение без микрофона")}
                >
                  <Icon name="headphones" />
                </button>
              </div>
              <label className="volume-control">
                <Icon name="music" size={17} />
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  aria-label={t("Громкость фортепиано")}
                  onChange={(e) => {
                    preferencesRestored.current = true;
                    const volume = Number(e.target.value);
                    engine.setVolume(volume);
                    history.store.updatePreferences({ volume });
                  }}
                />
              </label>
            </div>
            <div className="timeline">
              <div className="timeline-track">
                <div style={{ width: `${percent}%` }} />
              </div>
              <span>
                {t(
                  String(
                    status === "finished"
                      ? Math.ceil(duration)
                      : Math.floor(Math.min(time, duration)),
                  ).padStart(2, "0"),
                )}{" "}
                / {t(Math.ceil(duration))}
                {" " + t("сек")}
              </span>
            </div>
            <div className="sing-prompt">
              <span />
              {t("Пойте на «")}
              {t(exercise.syllable)}
              {t("»")}
              <span />
            </div>
            {running && audio.scoreReason && !listening && (
              <p className="score-mode-note">{t(audio.scoreReason)}</p>
            )}
            {error && !setupOpen && (
              <div className="error-message" role="alert">
                {t(error)}
              </div>
            )}
          </section>
          <div className="below-card">
            <div className="headphone-tip">
              <Icon name="headphones" size={17} />
              <span>
                {t("Лучше в наушниках — так микрофон услышит только вас")}
              </span>
            </div>
            <span className="privacy-note">
              {t("Голос обрабатывается на вашем устройстве")}
            </span>
          </div>
          <section className="instructions" aria-label={t("Как заниматься")}>
            <div>
              <span className="step-number">01</span>
              <div>
                <h3>{t("Слушайте ноту")}</h3>
                <p>
                  {t("Звук прозвучит, когда нота")}
                  <br className="desktop-break" />
                  {" " + t("дойдёт до пунктирной линии.")}
                </p>
              </div>
            </div>
            <div>
              <span className="step-number">02</span>
              <div>
                <h3>
                  {t("Пойте на «")}
                  {t(exercise.syllable)}
                  {t("»")}
                </h3>
                <p>
                  {t("Ведите линию голоса через ноту.")}
                  <br className="desktop-break" />
                  {" " + t("Зелёный цвет — вы попали.")}
                </p>
              </div>
            </div>
            <div>
              <span className="step-number">03</span>
              <div>
                <h3>{t("Следите за прогрессом")}</h3>
                <p>
                  {t("Удерживайте звук до конца ноты.")}
                  <br className="desktop-break" />
                  {" " + t("После упражнения — ваш результат.")}
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>
      <footer>
        <span>{t("Немного практики. Больше уверенности.")}</span>
        <span>LUNA VOICE</span>
      </footer>
    </div>
  );
}
