/** Abort does not cancel a browser permission prompt; onLate disposes a late stream. */
export function bounded<T>(
  promise: Promise<T>,
  signal: AbortSignal,
  timeoutMs: number,
  onLate?: (value: T) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown, value?: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve(value as T);
    };
    const abort = () => finish(new DOMException("Отменено", "AbortError"));
    const timer = setTimeout(
      () =>
        finish(
          new Error(
            "Подготовка заняла слишком много времени. Проверьте разрешение микрофона и соединение, затем повторите.",
          ),
        ),
      timeoutMs,
    );
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    promise.then(
      (value) => (settled ? onLate?.(value) : finish(undefined, value)),
      (error) => finish(error),
    );
  });
}
export function audioError(cause: unknown) {
  const name = cause instanceof Error ? cause.name : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Разрешите микрофон в настройках сайта и повторите проверку.";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "Выбранный микрофон недоступен. Выберите другой или используйте системный микрофон.";
  if (name === "NotReadableError")
    return "Не удалось открыть микрофон. Возможно, он занят другим приложением.";
  return cause instanceof Error
    ? cause.message
    : "Не удалось подготовить звук. Попробуйте снова.";
}
