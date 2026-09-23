import { t } from "../lib/i18n";
import { useEffect, useRef } from "react";
import type { AudioSnapshot } from "../lib/audio/engine";
import { noteName } from "../lib/pitch";
import {
  noteFeedback,
  practiceAdvice,
  weakestFragment,
} from "../lib/practice-feedback";
import type { PracticeSettings } from "../lib/practice";
export function PracticeResult({
  audio,
  onRepeat,
  canRepeat = true,
}: {
  audio: AudioSnapshot;
  canRepeat?: boolean;
  onRepeat: (fragment: PracticeSettings["fragment"]) => void;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    title.current?.focus();
  }, []);
  const result = audio.score === null ? null : audio.result;
  const weakest = result ? weakestFragment(result) : null;
  const fragment =
    weakest &&
    !(
      weakest.from === audio.practice.fragment?.from &&
      weakest.to === audio.practice.fragment?.to
    )
      ? weakest
      : null;
  return (
    <section className="practice-result" aria-label={t("Результат упражнения")}>
      <h2 ref={title} tabIndex={-1} className="eyebrow">
        {t(audio.listening ? "МЕЛОДИЯ ПРОСЛУШАНА" : "УПРАЖНЕНИЕ ЗАВЕРШЕНО")}
      </h2>
      {result ? (
        <>
          <div className="result-summary">
            <div>
              <div className="result-score">
                {t(result.percent)}
                <span>%</span>
              </div>
              <p>{t("Время точного попадания")}</p>
            </div>
            <div className="result-metrics">
              <div>
                <strong>{t(result.voicedPercent)}%</strong>
                <span>{t("Времени с распознанным голосом")}</span>
              </div>
              <div>
                <strong>
                  {t(result.aboveSeconds.toFixed(1))} /{" "}
                  {t(result.belowSeconds.toFixed(1))}
                  {" " + t("с")}
                </strong>
                <span>{t("Выше / ниже целевой ноты")}</span>
              </div>
            </div>
          </div>
          <p className="result-explanation">
            {t(
              "Попадание — высота в пределах ±50 центов (половины полутона). Тишина и нераспознанный голос снижают результат; паузы между нотами не считаются.",
            )}
          </p>
          <div className="practice-advice">
            <span className="eyebrow">{t("СЛЕДУЮЩИЙ ШАГ")}</span>
            <p>{t(practiceAdvice(result))}</p>
          </div>
          <h3>{t("Каждая нота")}</h3>
          <div className="note-results">
            {result.notes.map((note) => (
              <div className="note-result" key={note.position}>
                <span className="note-order">
                  {t(String(note.position + 1).padStart(2, "0"))}
                </span>
                <strong>{t(noteName(note.midi))}</strong>
                <div>
                  <b>{t(note.percent)}%</b>
                  <span>{t(noteFeedback(note))}</span>
                </div>
                <span className="note-deviation">
                  {t(
                    note.meanCents === null
                      ? "Нет высоты"
                      : `${note.meanCents > 0 ? "+" : ""}${Math.round(note.meanCents)} центов`,
                  )}
                </span>
                {canRepeat && (
                  <button
                    className="secondary-button"
                    aria-label={t(`Повторить ноту ${note.position + 1}`)}
                    onClick={() =>
                      onRepeat({ from: note.position, to: note.position })
                    }
                  >
                    {t("Повторить")}
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      ) : (
        <p>
          {t(
            audio.listening
              ? "Теперь попробуйте спеть мелодию сами."
              : audio.scoreReason,
          )}
        </p>
      )}
      {canRepeat && (
        <div className="result-actions">
          <button className="primary-button" onClick={() => onRepeat(null)}>
            {t(audio.listening ? "Начать петь" : "Повторить целиком")}
          </button>
          {fragment && (
            <button
              className="secondary-button"
              onClick={() => onRepeat(fragment)}
            >
              {t("Отработать ноты") + " "}
              {t(fragment.from + 1)}–{t(fragment.to + 1)}
            </button>
          )}
          {audio.practice.fragment && (
            <button
              className="secondary-button"
              onClick={() => onRepeat(audio.practice.fragment)}
            >
              {t("Повторить этот фрагмент")}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
