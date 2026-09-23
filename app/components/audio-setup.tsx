"use client";
import { Select, SelectOption } from "./select";

import { t } from "../lib/i18n";

import { useEffect, useRef } from "react";
import { noteName } from "../lib/pitch";
import type { AudioEngine, AudioSnapshot } from "../lib/audio/engine";
import type { OutputMode } from "../lib/audio/settings";
const SIGNAL_LABELS = {
  silence: "Пока тишина — спойте удобную ноту",
  quiet: "Слишком тихо — подойдите ближе или увеличьте чувствительность",
  clipping: "Перегрузка — отойдите немного от микрофона",
  unstable: "Слышим звук, но высота неустойчива — потяните «Ма»",
  voiced: "Голос слышен, высота определяется",
};
export function AudioSetup({
  state,
  engine,
  onClose,
  onBegin,
  onCheck,
}: {
  state: AudioSnapshot;
  engine: AudioEngine;
  onClose: () => void;
  onBegin: () => void;
  onCheck: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const checking = state.status === "checking";
  const loading = state.status === "loading";
  const calibrating =
    state.calibrationProgress !== null ||
    state.delayProgress !== null ||
    state.referencePlaying;
  const progress = state.calibrationProgress ?? state.delayProgress;
  const chosenDevice = state.devices.find(
    (device) => device.id === state.settings.deviceId,
  );
  return (
    <dialog
      ref={dialog}
      className="audio-dialog"
      aria-labelledby="audio-setup-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="setup-heading">
        <div>
          <span className="eyebrow">{t("ПЕРЕД ПРАКТИКОЙ")}</span>
          <h2 id="audio-setup-title">{t("Настроим ваш звук")}</h2>
        </div>
        <button
          className="icon-button"
          aria-label={t("Закрыть проверку микрофона")}
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      <p className="setup-intro">
        {t(
          "Проверьте микрофон и потяните «Ма» на удобной высоте. Голос остаётся на вашем устройстве.",
        )}
      </p>
      <div className="setup-fields">
        <label>
          {t("Микрофон")}
          <Select
            value={state.settings.deviceId}
            disabled={loading || calibrating}
            onValueChange={(selectedValue) =>
              engine.configure({ deviceId: selectedValue })
            }
            aria-label={t("Микрофон")}
          >
            <SelectOption value="default">
              {t("Системный микрофон")}
            </SelectOption>
            {!chosenDevice && state.settings.deviceId !== "default" && (
              <SelectOption value={state.settings.deviceId}>
                {t("Последний выбранный микрофон")}
              </SelectOption>
            )}
            {state.devices.map((device) => (
              <SelectOption key={device.id} value={device.id}>
                {t(device.label)}
              </SelectOption>
            ))}
          </Select>
        </label>
        <label>
          {t("Слушаю через")}
          <Select
            value={state.settings.outputMode}
            disabled={loading || calibrating}
            onValueChange={(selectedValue) =>
              engine.selectOutput(selectedValue as OutputMode)
            }
            aria-label={t("Слушаю через")}
          >
            <SelectOption value="speakers">
              {t("Динамики · без оценки")}
            </SelectOption>
            <SelectOption value="wired">{t("Проводные наушники")}</SelectOption>
            <SelectOption value="bluetooth">
              {t("Bluetooth-наушники")}
            </SelectOption>
          </Select>
        </label>
      </div>
      {state.settings.outputMode === "speakers" && (
        <p className="setup-note">
          {t(
            "С динамиками можно практиковаться, но процент отключён: микрофон слышит и голос, и фортепиано. Для оценки выберите наушники.",
          )}
        </p>
      )}
      <section
        className="input-check"
        aria-label={t("Проверка входящего звука")}
      >
        <div className="input-check-title">
          <span>
            {t(
              loading
                ? "Подключаем микрофон…"
                : checking
                  ? "МИКРОФОН ВКЛЮЧЁН"
                  : "МИКРОФОН ВЫКЛЮЧЕН",
            )}
          </span>
          <strong>
            {t(checking && state.pitch !== null ? noteName(state.pitch) : "—")}
          </strong>
        </div>
        <div
          className={`input-meter ${state.reading.state === "clipping" ? "clipping" : ""}`}
          role="meter"
          aria-label={t("Уровень микрофона")}
          aria-valuemin={-80}
          aria-valuemax={0}
          aria-valuenow={Math.round(
            Math.max(-80, Math.min(0, state.reading.db)),
          )}
        >
          <div
            style={{
              width: `${Math.max(0, Math.min(100, ((state.reading.db + 80) / 80) * 100))}%`,
            }}
          />
        </div>
        <p>
          {t(
            checking
              ? SIGNAL_LABELS[state.reading.state]
              : "Нажмите «Проверить микрофон», чтобы услышать ваш голос.",
          )}
        </p>
        <div className="setup-ready" role="status">
          {t(
            checking && state.heardVoice && !calibrating
              ? "✓ Микрофон готов к практике"
              : loading
                ? "Ожидаем разрешение или загружаем звуки. Проверку можно отменить."
                : "",
          )}
        </div>
      </section>
      <div className="setup-adjustment">
        <div>
          <h3>{t("Чувствительность")}</h3>
          <p>
            {t(
              "Если голос слишком тихий — сдвиньте влево. Если мешает шум — вправо.",
            )}
          </p>
        </div>
        <output>
          {t(state.settings.thresholdDb)}
          {" " + t("дБ")}
        </output>
      </div>
      <input
        className="setup-range"
        type="range"
        aria-label={t("Порог чувствительности микрофона")}
        min={-60}
        max={-20}
        step={1}
        value={state.settings.thresholdDb}
        disabled={loading || calibrating}
        onChange={(event) =>
          engine.configure({
            thresholdDb: Number(event.target.value),
            noiseFloorDb: null,
          })
        }
      />
      <div className="range-captions">
        <span>{t("Тихий голос")}</span>
        <span>{t("Шумная комната")}</span>
      </div>
      <button
        className="secondary-button"
        disabled={!checking || calibrating}
        onClick={engine.calibrate}
      >
        {t("Настроить по тишине · 2 сек")}
      </button>
      <details className="delay-settings">
        <summary>
          {t("Настройка задержки")}{" "}
          <span>
            {state.settings.correctionMs > 0 ? "+" : ""}
            {t(state.settings.correctionMs)}
            {" " + t("мс")}
          </span>
        </summary>
        <p>
          {t(
            "Если вы поёте вовремя, а линия запаздывает, увеличьте поправку. Настройка сохраняется для выбранного микрофона и типа наушников.",
          )}
        </p>
        <label className="setup-adjustment">
          {t("Поправка задержки") + " "}
          <output>
            {t(state.settings.correctionMs)}
            {" " + t("мс")}
          </output>
        </label>
        <input
          className="setup-range"
          aria-label={t("Поправка задержки")}
          type="range"
          min={-200}
          max={800}
          step={1}
          value={state.settings.correctionMs}
          disabled={loading || calibrating}
          onChange={(event) =>
            engine.configure({ correctionMs: Number(event.target.value) })
          }
        />
        <div className="range-captions">
          <span>{t("−200 мс")}</span>
          <span>{t("+800 мс")}</span>
        </div>
        <p>
          {t(
            "Для измерения поднесите один наушник к микрофону. Прозвучат три коротких сигнала. После измерения наденьте наушник обратно.",
          )}
        </p>
        <button
          className="secondary-button"
          disabled={
            !checking || calibrating || state.settings.outputMode === "speakers"
          }
          onClick={engine.measureDelay}
        >
          {t("Измерить задержку")}
        </button>
        {state.roundTripMs !== null && (
          <p>
            {t("Последнее измерение выхода и входа:") + " "}
            {t(state.roundTripMs)}
            {" " + t("мс. При смене наушников повторите настройку.")}
          </p>
        )}
      </details>
      {progress !== null && (
        <progress
          className="calibration-progress"
          aria-label={t("Ход измерения")}
          max={1}
          value={progress}
        />
      )}
      {state.notice && (
        <p className="setup-notice" role="status">
          {t(state.notice)}
        </p>
      )}
      {state.error && (
        <p className="setup-error" role="alert">
          {t(state.error)}
        </p>
      )}
      <div className="setup-actions">
        <button className="secondary-button" onClick={onClose}>
          {t(loading ? "Отменить подготовку" : "Закрыть")}
        </button>
        {checking ? (
          <button
            className="primary-button"
            disabled={!state.heardVoice || calibrating}
            onClick={onBegin}
          >
            {t("Начать практику")}
          </button>
        ) : (
          <button
            className="primary-button"
            disabled={loading}
            onClick={onCheck}
          >
            {t("Проверить микрофон")}
          </button>
        )}
      </div>
      {state.diagnostics && (
        <details className="audio-diagnostics">
          <summary>{t("Сведения о звуке")}</summary>
          <dl>
            <dt>{t("Частота записи")}</dt>
            <dd>
              {t(state.diagnostics.sampleRate)}
              {" " + t("Гц")}
            </dd>
            <dt>{t("Задержка входа по данным браузера")}</dt>
            <dd>
              {t(
                state.diagnostics.inputMs === null
                  ? "Не сообщается"
                  : `${state.diagnostics.inputMs} мс`,
              )}
            </dd>
            <dt>{t("Оценка задержки выхода")}</dt>
            <dd>
              {t(state.diagnostics.outputMs)}
              {" " + t("мс")}
            </dd>
            <dt>{t("Анализ кадра, среднее / максимум")}</dt>
            <dd>
              {t(state.diagnostics.analysisMs.toFixed(1))} /{" "}
              {t(state.diagnostics.maxAnalysisMs.toFixed(1))}
              {" " + t("мс")}
            </dd>
            <dt>{t("Наибольший интервал анализа")}</dt>
            <dd>
              {t(state.diagnostics.maxGapMs.toFixed(0))}
              {" " + t("мс")}
            </dd>
            <dt>{t("Подавление эха")}</dt>
            <dd>
              {t(
                state.diagnostics.echoCancellation === null
                  ? "Не сообщается"
                  : state.diagnostics.echoCancellation
                    ? "Включено"
                    : "Выключено",
              )}
            </dd>
          </dl>
          <p>
            {t(
              "Показатели браузера — оценки, не полное измерение задержки устройства.",
            )}
          </p>
        </details>
      )}
    </dialog>
  );
}
