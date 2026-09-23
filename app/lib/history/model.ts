import type { AttemptEvent, AudioSnapshot } from "../audio/engine";
import { getExercise } from "../exercises";
import {
  DEFAULT_PRACTICE,
  normalizePractice,
  type PracticeSettings,
} from "../practice";
export type AttemptRecord = {
  recordVersion: 1;
  id: string;
  startedAt: string;
  endedAt: string | null;
  status: "incomplete" | "completed" | "interrupted";
  title: string;
  practice: PracticeSettings;
  scoreVersion: string | null;
  score: number | null;
  result: AudioSnapshot["result"];
  reason: string;
  audio: Pick<
    AudioSnapshot["settings"],
    "deviceId" | "outputMode" | "thresholdDb" | "correctionMs"
  >;
  sessionId: string | null;
};
export type SessionRecord = {
  recordVersion: 1;
  id: string;
  title: string;
  startedAt: string;
  endedAt: string | null;
  status: AttemptRecord["status"];
  queue: PracticeSettings[];
  attemptIds: (string | null)[];
};
export type ProgressPreferences = {
  baseMidi: number;
  lastExerciseId: string;
  tempos: Record<string, number>;
  volume: number;
  goalMinutes: number;
  reminder: boolean;
};
export const DEFAULT_PROGRESS: ProgressPreferences = {
  baseMidi: 48,
  lastExerciseId: "ladder",
  tempos: {},
  volume: 55,
  goalMinutes: 5,
  reminder: true,
};
export function normalizeProgress(
  input: Partial<ProgressPreferences> = {},
): ProgressPreferences {
  if (!input || typeof input !== "object") input = {};
  const practice = normalizePractice({
    ...DEFAULT_PRACTICE,
    baseMidi: input.baseMidi,
    exerciseId: input.lastExerciseId,
  });
  const tempos: Record<string, number> = {};
  if (input.tempos && typeof input.tempos === "object")
    for (const [id, bpm] of Object.entries(input.tempos)) {
      if (
        getExercise(id).id === id &&
        typeof bpm === "number" &&
        Number.isFinite(bpm)
      )
        tempos[id] = normalizePractice({ exerciseId: id, bpm }).bpm;
    }
  return {
    baseMidi: practice.baseMidi,
    lastExerciseId: practice.exerciseId!,
    tempos,
    volume: Number.isFinite(input.volume)
      ? Math.max(0, Math.min(100, input.volume!))
      : 55,
    goalMinutes: [1, 3, 5, 10, 15].includes(input.goalMinutes!)
      ? input.goalMinutes!
      : 5,
    reminder: input.reminder !== false,
  };
}
export function mergeProgress(
  base: Partial<ProgressPreferences> | undefined,
  patch: Partial<ProgressPreferences>,
) {
  const current = normalizeProgress(base);
  return normalizeProgress({
    ...current,
    ...patch,
    tempos: { ...current.tempos, ...patch.tempos },
  });
}
export function attemptFromEvent(
  event: AttemptEvent,
  sessionId: string | null,
): AttemptRecord {
  const s = event.snapshot;
  const completed = event.type === "completed";
  return {
    recordVersion: 1,
    id: event.id,
    startedAt: event.startedAt,
    endedAt: event.type === "started" ? null : new Date().toISOString(),
    status: completed
      ? "completed"
      : event.type === "started"
        ? "incomplete"
        : "interrupted",
    title: getExercise(s.practice.exerciseId).title,
    practice: structuredClone(s.practice),
    scoreVersion: completed ? (s.result?.version ?? null) : null,
    score: completed ? s.score : null,
    result: completed ? structuredClone(s.result) : null,
    reason: completed
      ? s.scoreReason
      : event.type === "interrupted"
        ? s.error || s.notice || "Попытка остановлена до завершения."
        : "Попытка не завершена.",
    audio: {
      deviceId: s.settings.deviceId,
      outputMode: s.settings.outputMode,
      thresholdDb: s.settings.thresholdDb,
      correctionMs: s.settings.correctionMs,
    },
    sessionId,
  };
}
export function comparisonKey(record: AttemptRecord) {
  return JSON.stringify([
    record.practice.exerciseId,
    record.practice.exerciseVersion,
    record.practice.baseMidi,
    record.practice.bpm,
    record.practice.fragment?.from ?? null,
    record.practice.fragment?.to ?? null,
    record.practice.series?.rounds ?? 1,
    record.practice.series?.step ?? 0,
    record.scoreVersion,
    record.audio.deviceId,
    record.audio.outputMode,
    record.audio.thresholdDb,
    record.audio.correctionMs,
  ]);
}
export function isScored(record: AttemptRecord) {
  return (
    record.status === "completed" &&
    record.score !== null &&
    !!record.result &&
    !!record.scoreVersion
  );
}
export function comparable(records: AttemptRecord[], selected: AttemptRecord) {
  return records
    .filter((r) => isScored(r) && comparisonKey(r) === comparisonKey(selected))
    .sort(
      (a, b) =>
        a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id),
    );
}
export function localDay(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function completedSeconds(records: AttemptRecord[], day?: string) {
  return records
    .filter(
      (r) =>
        r.status === "completed" &&
        (!day || localDay(new Date(r.endedAt ?? r.startedAt)) === day),
    )
    .reduce((sum, r) => sum + (r.result?.targetSeconds ?? 0), 0);
}
export function groupScore(session: SessionRecord, attempts: AttemptRecord[]) {
  const items = session.attemptIds.map((id) =>
    attempts.find((r) => r.id === id),
  );
  if (session.status !== "completed" || items.some((r) => !r || !isScored(r)))
    return null;
  const seconds = items.reduce((sum, r) => sum + r!.result!.targetSeconds, 0);
  return seconds
    ? Math.round(
        (100 * items.reduce((sum, r) => sum + r!.result!.matchedSeconds, 0)) /
          seconds,
      )
    : null;
}
const nonnegative = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const percent = (value: unknown) =>
  nonnegative(value) && (value as number) <= 100;
const nullableNumber = (value: unknown) =>
  value === null || (typeof value === "number" && Number.isFinite(value));
export function validAttempt(value: unknown): value is AttemptRecord {
  if (!value || typeof value !== "object") return false;
  const r = value as AttemptRecord;
  const result = r.result;
  return (
    r.recordVersion === 1 &&
    typeof r.id === "string" &&
    typeof r.title === "string" &&
    Number.isFinite(Date.parse(r.startedAt)) &&
    (r.endedAt === null || Number.isFinite(Date.parse(r.endedAt))) &&
    ["incomplete", "completed", "interrupted"].includes(r.status) &&
    typeof r.reason === "string" &&
    !!r.practice &&
    Number.isFinite(r.practice.baseMidi) &&
    Number.isFinite(r.practice.bpm) &&
    (r.practice.series === undefined ||
      (!!r.practice.series &&
        Number.isInteger(r.practice.series.rounds) &&
        r.practice.series.rounds >= 1 &&
        r.practice.series.rounds <= 10 &&
        [1, 2].includes(r.practice.series.step))) &&
    (r.practice.fragment === null ||
      (!!r.practice.fragment &&
        Number.isInteger(r.practice.fragment.from) &&
        Number.isInteger(r.practice.fragment.to))) &&
    !!r.audio &&
    (r.score === null || percent(r.score)) &&
    (result === null ||
      (Array.isArray(result.notes) &&
        nonnegative(result.targetSeconds) &&
        nonnegative(result.matchedSeconds) &&
        nonnegative(result.aboveSeconds) &&
        nonnegative(result.belowSeconds) &&
        percent(result.voicedPercent) &&
        result.notes.every(
          (n) =>
            Number.isInteger(n.position) &&
            Number.isFinite(n.midi) &&
            percent(n.percent) &&
            percent(n.voicedPercent) &&
            nonnegative(n.aboveSeconds) &&
            nonnegative(n.belowSeconds) &&
            nonnegative(n.voicedSeconds) &&
            nullableNumber(n.meanCents),
        )))
  );
}
export function validSession(value: unknown): value is SessionRecord {
  if (!value || typeof value !== "object") return false;
  const r = value as SessionRecord;
  return (
    r.recordVersion === 1 &&
    typeof r.id === "string" &&
    typeof r.title === "string" &&
    Number.isFinite(Date.parse(r.startedAt)) &&
    Array.isArray(r.queue) &&
    Array.isArray(r.attemptIds) &&
    r.queue.length > 0 &&
    r.queue.length === r.attemptIds.length &&
    r.attemptIds.every((id) => id === null || typeof id === "string") &&
    ["incomplete", "completed", "interrupted"].includes(r.status)
  );
}
