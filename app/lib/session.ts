import { SHORT_SESSION } from "./exercises";
import { normalizePractice, type PracticeSettings } from "./practice";
import type { AudioSnapshot } from "./audio/engine";
export type SessionEntry = {
  practice: PracticeSettings;
  result: AudioSnapshot["result"];
  score: number | null;
  reason: string;
};
export type PracticeSession = {
  queue: PracticeSettings[];
  index: number;
  entries: SessionEntry[];
  phase: "active" | "rest" | "complete";
  resumeAt: number;
};
export function createSession(baseMidi: number): PracticeSession {
  return {
    queue: SHORT_SESSION.exercises.map((exerciseId) =>
      normalizePractice({ exerciseId, baseMidi }),
    ),
    index: 0,
    entries: [],
    phase: "active",
    resumeAt: 0,
  };
}
export function acceptSessionResult(
  session: PracticeSession,
  audio: AudioSnapshot,
  now: number,
): PracticeSession {
  if (
    session.phase !== "active" ||
    audio.status !== "finished" ||
    audio.listening ||
    audio.practice.exerciseId !== session.queue[session.index].exerciseId ||
    audio.practice.fragment
  )
    return session;
  const entry = {
    practice: audio.practice,
    result: audio.result,
    score: audio.score,
    reason: audio.scoreReason,
  };
  return {
    ...session,
    entries: [...session.entries, entry],
    phase: session.index === session.queue.length - 1 ? "complete" : "rest",
    resumeAt: now + SHORT_SESSION.restSeconds * 1000,
  };
}
export function sessionScore(entries: SessionEntry[]) {
  if (
    !entries.length ||
    entries.some((entry) => entry.score === null || !entry.result)
  )
    return null;
  const target = entries.reduce(
    (sum, entry) => sum + entry.result!.targetSeconds,
    0,
  );
  return target
    ? Math.round(
        (100 *
          entries.reduce(
            (sum, entry) => sum + entry.result!.matchedSeconds,
            0,
          )) /
          target,
      )
    : null;
}
