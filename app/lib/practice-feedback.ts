import { noteName } from "./pitch";
import type { NoteResult, PitchScore } from "./audio/analysis";
export type PracticeResult = ReturnType<PitchScore["result"]>;
export function noteFeedback(note: NoteResult) {
  if (note.voicedPercent < 10) return "Голос не распознан";
  if (note.percent >= 80) return "Точно в ноту";
  if (note.voicedPercent < 60) return "Удерживайте дольше";
  if (
    note.aboveSeconds > note.belowSeconds * 1.5 &&
    note.aboveSeconds > note.voicedSeconds * 0.25
  )
    return "Выше цели";
  if (
    note.belowSeconds > note.aboveSeconds * 1.5 &&
    note.belowSeconds > note.voicedSeconds * 0.25
  )
    return "Ниже цели";
  return "Высота менялась";
}
export function weakestFragment(result: PracticeResult) {
  if (!result.notes.length || result.voicedSeconds < 0.3) return null;
  const size = result.notes.length > 3 ? 3 : 1;
  let lowest = Infinity,
    start = 0;
  for (let i = 0; i <= result.notes.length - size; i++) {
    const window = result.notes.slice(i, i + size);
    const ratio =
      window.reduce((sum, n) => sum + n.matchedSeconds, 0) /
      window.reduce((sum, n) => sum + n.duration, 0);
    if (ratio < lowest) {
      lowest = ratio;
      start = i;
    }
  }
  if (lowest >= 0.9) return null;
  return {
    from: result.notes[start].position,
    to: result.notes[start + size - 1].position,
  };
}
export function practiceAdvice(result: PracticeResult) {
  if (result.observedSeconds < result.targetSeconds * 0.8)
    return "Часть звука не удалось обработать. Закройте лишние приложения и повторите упражнение.";
  if (result.voicedPercent < 10)
    return "Голос почти не распознан. Проверьте уровень микрофона и потяните «Ма» перед повтором.";
  if (result.voicedPercent < 60)
    return `Голос распознан ${result.voicedPercent}% времени нот. В следующей попытке удерживайте «Ма» до конца каждого прямоугольника.`;
  const worst = [...result.notes].sort((a, b) => a.percent - b.percent)[0];
  if (result.percent >= 90)
    return "Высота удерживается точно. Попробуйте следующий темп, сохранив ту же точность.";
  if (
    result.aboveSeconds > result.belowSeconds * 1.5 &&
    result.aboveSeconds > result.voicedSeconds * 0.2
  )
    return `Голос чаще был выше цели. Послушайте ${noteName(worst.midi)} и в повторе попробуйте немного опустить высоту.`;
  if (
    result.belowSeconds > result.aboveSeconds * 1.5 &&
    result.belowSeconds > result.voicedSeconds * 0.2
  )
    return `Голос чаще был ниже цели. Послушайте ${noteName(worst.midi)} и в повторе попробуйте немного поднять высоту.`;
  return `Начните с ноты ${noteName(worst.midi)} (№${worst.position + 1}): послушайте её и удерживайте звук ровнее в более медленном темпе.`;
}
