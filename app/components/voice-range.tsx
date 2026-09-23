"use client";

import { useEffect, useRef, useState } from "react";
import { earText as tr } from "../lib/ear-training";
import { noteName } from "../lib/pitch";
import {
  fitVoiceRange,
  rangeKey,
  readVoiceRange,
  RangeCapture,
  validRange,
  type VoiceRange,
} from "../lib/voice-range";
import type { AudioEngine, AudioSnapshot } from "../lib/audio/engine";
import type { PracticeSettings } from "../lib/practice";
import { t } from "../lib/i18n";

export function VoiceRangeDialog({
  engine,
  state,
  practice,
  owner,
  onApply,
  onClose,
}: {
  engine: AudioEngine;
  state: AudioSnapshot;
  practice: PracticeSettings;
  owner?: string;
  onApply: (p: PracticeSettings) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const checking = state.status === "checking";
  return (
    <dialog
      ref={dialog}
      className="audio-dialog"
      aria-labelledby="voice-range-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="setup-heading">
        <h2 id="voice-range-title">
          {tr([
            "Your vocal range",
            "Твій вокальний діапазон",
            "Твой вокальный диапазон",
          ])}
        </h2>
        <button
          className="icon-button"
          aria-label={tr([
            "Close range measurement",
            "Закрити вимірювання діапазону",
            "Закрыть измерение диапазона",
          ])}
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      <p className="setup-intro">
        {tr([
          "Measure two comfortable notes to fit exercises to your voice. Your voice stays on this device.",
          "Виміряй дві комфортні ноти, щоб підібрати вправи під твій голос. Голос залишається на цьому пристрої.",
          "Измерь две комфортные ноты, чтобы подобрать упражнения под твой голос. Голос остаётся на этом устройстве.",
        ])}
      </p>
      {!checking && (
        <button
          className="secondary-button"
          disabled={state.status === "loading"}
          onClick={() => void engine.prepare(practice)}
        >
          {tr(
            state.status === "loading"
              ? [
                  "Connecting microphone…",
                  "Підключаємо мікрофон…",
                  "Подключаем микрофон…",
                ]
              : [
                  "Enable microphone",
                  "Увімкнути мікрофон",
                  "Включить микрофон",
                ],
          )}
        </button>
      )}
      {checking && (
        <p role="status">
          {tr(["Current note", "Поточна нота", "Текущая нота"])}:{" "}
          {state.reading.state === "voiced" && state.reading.midi !== null
            ? noteName(state.reading.midi)
            : "—"}
        </p>
      )}
      {state.error && (
        <p className="setup-error" role="alert">
          {t(state.error)}
        </p>
      )}
      <VoiceRangeSetup
        engine={engine}
        practice={practice}
        owner={owner}
        ready={
          checking &&
          !state.referencePlaying &&
          state.calibrationProgress === null &&
          state.delayProgress === null
        }
        onApply={onApply}
      />
      <div className="setup-actions">
        <button className="primary-button" onClick={onClose}>
          {tr(["Done", "Готово", "Готово"])}
        </button>
      </div>
    </dialog>
  );
}

export function VoiceRangeSetup({
  engine,
  practice,
  ready,
  owner,
  onApply,
}: {
  engine: AudioEngine;
  practice: PracticeSettings;
  ready: boolean;
  owner?: string;
  onApply: (p: PracticeSettings) => void;
}) {
  const [stored] = useState(() => readVoiceRange(owner));
  const [low, setLow] = useState<number | null>(stored?.low ?? null),
    [high, setHigh] = useState<number | null>(stored?.high ?? null);
  const [capturing, setCapturing] = useState<"low" | "high" | null>(null),
    [candidate, setCandidate] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!capturing || !ready) return;
    const capture = new RangeCapture();
    let previous = engine.getSnapshot().reading;
    const timer = setInterval(() => {
      const s = engine.getSnapshot();
      const midi =
        s.reading !== previous &&
        s.status === "checking" &&
        !s.referencePlaying &&
        s.calibrationProgress === null &&
        s.delayProgress === null &&
        s.reading.state === "voiced"
          ? s.reading.midi
          : null;
      previous = s.reading;
      const value = capture.add(performance.now(), midi);
      setCandidate(value);
    }, 100);
    return () => clearInterval(timer);
  }, [capturing, ready, engine]);
  const measured: VoiceRange | null =
    low !== null && high !== null && validRange({ low, high })
      ? { low, high }
      : null;
  const fitted = measured ? fitVoiceRange(practice, measured) : null;
  return (
    <section className="voice-range-setup">
      <h3>
        {tr([
          "Measure your comfortable range",
          "Виміряй комфортний діапазон",
          "Измерь комфортный диапазон",
        ])}
      </h3>
      <p>
        {tr([
          "Sing a comfortably low note, then a comfortably high one. Hold each for 2 seconds. Use an easy voice; do not push for your absolute limits.",
          "Заспівай комфортну нижню, потім верхню ноту. Тримай кожну 2 секунди. Співай легко, не шукай граничних нот.",
          "Спой комфортную нижнюю, затем верхнюю ноту. Удерживай каждую 2 секунды. Пой легко, не пытайся взять предельные ноты.",
        ])}
      </p>
      <div className="voice-range-actions">
        {(["low", "high"] as const).map((edge) => (
          <button
            key={edge}
            className="secondary-button"
            disabled={!ready}
            aria-pressed={capturing === edge}
            onClick={() => {
              setCapturing(edge);
              setCandidate(null);
              setMessage("");
            }}
          >
            {edge === "low"
              ? tr(["Measure low", "Виміряти нижню", "Измерить нижнюю"])
              : tr([
                  "Measure high",
                  "Виміряти верхню",
                  "Измерить верхнюю",
                ])}{" "}
            ·{" "}
            {(edge === "low" ? low : high) === null
              ? "—"
              : noteName((edge === "low" ? low : high)!)}
          </button>
        ))}
      </div>
      {capturing && (
        <div role="status">
          <p>
            {ready
              ? candidate === null
                ? tr([
                    "Hold one steady note…",
                    "Тримай рівну ноту…",
                    "Удерживай ровную ноту…",
                  ])
                : `${tr(["Detected", "Визначено", "Определено"])}: ${noteName(candidate)}`
              : tr([
                  "Start the microphone check to continue.",
                  "Увімкни перевірку мікрофона.",
                  "Включи проверку микрофона.",
                ])}
          </p>
          <button
            className="secondary-button"
            disabled={!ready || candidate === null}
            onClick={() => {
              if (capturing === "low") setLow(candidate);
              else setHigh(candidate);
              setCapturing(null);
              setCandidate(null);
            }}
          >
            {tr([
              "This note feels comfortable",
              "Ця нота комфортна",
              "Эту ноту петь комфортно",
            ])}
          </button>{" "}
          <button
            className="account-text-button"
            onClick={() => {
              setCapturing(null);
              setCandidate(null);
            }}
          >
            {tr(["Cancel", "Скасувати", "Отмена"])}
          </button>
        </div>
      )}
      {low !== null && high !== null && (
        <p>
          {noteName(low)} – {noteName(high)} ·{" "}
          {high > low
            ? `${high - low} ${tr(["semitones", "півтонів", "полутонов"])}`
            : tr([
                "The high note must be above the low note.",
                "Верхня нота має бути вищою за нижню.",
                "Верхняя нота должна быть выше нижней.",
              ])}
        </p>
      )}
      {measured && !fitted && (
        <p>
          {tr([
            "This melody does not fit your measured range with a small margin. Choose a narrower exercise.",
            "Ця мелодія не вміщується в діапазон із невеликим запасом. Обери вужчу вправу.",
            "Эта мелодия не помещается в диапазон с небольшим запасом. Выбери более узкое упражнение.",
          ])}
        </p>
      )}
      <button
        className="secondary-button"
        disabled={!fitted || !ready || capturing !== null}
        onClick={() => {
          if (!fitted || !measured) return;
          try {
            localStorage.setItem(rangeKey(owner), JSON.stringify(measured));
            setMessage(
              tr([
                "Range saved on this device.",
                "Діапазон збережено на цьому пристрої.",
                "Диапазон сохранён на этом устройстве.",
              ]),
            );
          } catch {
            setMessage(
              tr([
                "Applied for this session; local storage is unavailable.",
                "Застосовано для заняття; локальне сховище недоступне.",
                "Применено для занятия; локальное хранилище недоступно.",
              ]),
            );
          }
          onApply(fitted);
        }}
      >
        {tr([
          "Apply to exercise",
          "Застосувати до вправи",
          "Применить к упражнению",
        ])}
      </button>
      {message && <p role="status">{message}</p>}
      <p className="account-small">
        {tr([
          "We leave a small margin at both ends. This measures usable notes, not a voice type: soprano, tenor and baritone also depend on tessitura and tone colour.",
          "Залишаємо невеликий запас з обох країв. Це вимірювання нот, а не типу голосу: сопрано, тенор і баритон залежать також від теситури й тембру.",
          "Оставляем небольшой запас с обоих краёв. Это измерение нот, а не типа голоса: сопрано, тенор и баритон зависят также от тесситуры и тембра.",
        ])}
      </p>
    </section>
  );
}
