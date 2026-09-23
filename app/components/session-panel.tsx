import { t } from "../lib/i18n";
import { useEffect, useState } from "react";
import { getExercise, SHORT_SESSION } from "../lib/exercises";
import { sessionScore, type PracticeSession } from "../lib/session";
function RestButton({
  resumeAt,
  onNext,
}: {
  resumeAt: number;
  onNext: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const remaining = Math.max(0, Math.ceil((resumeAt - now) / 1000));
  return (
    <button
      className="primary-button"
      disabled={remaining > 0}
      onClick={onNext}
    >
      {t(remaining > 0 ? `Отдых · ${remaining} с` : "Следующее упражнение")}
    </button>
  );
}
export function SessionPanel({
  session,
  onNext,
  onExit,
}: {
  session: PracticeSession;
  onNext: () => void;
  onExit: () => void;
}) {
  const total =
    session.phase === "complete" ? sessionScore(session.entries) : null;
  return (
    <section className="session-panel" aria-label={t("Короткое занятие")}>
      <div className="session-panel-top">
        <span className="eyebrow">
          {t(SHORT_SESSION.title)} ·{" "}
          {t(
            session.phase === "complete"
              ? session.queue.length
              : session.index + 1,
          )}{" "}
          / {t(session.queue.length)}
        </span>
        <button className="secondary-button" onClick={onExit}>
          {t(
            session.phase === "complete" ? "В библиотеку" : "Завершить занятие",
          )}
        </button>
      </div>
      <ol className="session-steps">
        {session.queue.map((item, i) => (
          <li key={i} aria-current={i === session.index ? "step" : undefined}>
            <span>{t(i < session.entries.length ? "✓" : i + 1)}</span>
            {t(getExercise(item.exerciseId).title)}
          </li>
        ))}
      </ol>
      {session.phase === "rest" && (
        <div className="session-rest">
          <div>
            <h2>{t("Небольшой отдых")}</h2>
            <p>
              {t("Дайте голосу отдохнуть. Дальше — «")}
              {t(
                getExercise(session.queue[session.index + 1].exerciseId).title,
              )}
              ».
            </p>
          </div>
          <RestButton
            key={session.index}
            resumeAt={session.resumeAt}
            onNext={onNext}
          />
        </div>
      )}
      {session.phase === "complete" && (
        <div className="session-finished" role="status">
          <h2>{t("Занятие завершено")}</h2>
          <strong>
            {t(total === null ? "Без общей оценки" : `${total}%`)}
          </strong>
          <p>
            {t(
              total === null
                ? "В одном или нескольких упражнениях оценка была отключена."
                : "Общая точность с учётом длительности нот во всех упражнениях.",
            )}
          </p>
          <ul>
            {session.entries.map((entry, i) => (
              <li key={i}>
                {t(getExercise(entry.practice.exerciseId).title)}
                <span>
                  {t(entry.score === null ? "Без оценки" : `${entry.score}%`)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
