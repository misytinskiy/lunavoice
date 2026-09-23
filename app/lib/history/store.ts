import {
  openHistory,
  readHistory,
  writeHistory,
  type Mutation,
} from "./database";
import {
  DEFAULT_PROGRESS,
  normalizeProgress,
  mergeProgress,
  attemptFromEvent,
  validAttempt,
  validSession,
  type AttemptRecord,
  type SessionRecord,
  type ProgressPreferences,
} from "./model";
import { SHORT_SESSION } from "../exercises";
import { EXERCISES } from "../exercises";
import { LIBRARY_KEY, parseLibrary } from "../library";
import type { AttemptEvent } from "../audio/engine";
import type { PracticeSettings } from "../practice";
export type HistorySnapshot = {
  ready: boolean;
  saving: boolean;
  notice: string;
  attempts: AttemptRecord[];
  sessions: SessionRecord[];
  preferences: ProgressPreferences;
  favorites: string[];
  profileName: string;
};
const EMPTY: HistorySnapshot = {
  ready: false,
  saving: false,
  notice: "",
  attempts: [],
  sessions: [],
  preferences: DEFAULT_PROGRESS,
  favorites: [],
  profileName: "",
};
function apply(state: HistorySnapshot, mutation: Mutation): HistorySnapshot {
  if (mutation.kind === "profile")
    return { ...state, profileName: mutation.name };
  if (mutation.kind === "favorite")
    return {
      ...state,
      favorites: mutation.enabled
        ? [...new Set([...state.favorites, mutation.id])]
        : state.favorites.filter((id) => id !== mutation.id),
    };
  if (mutation.kind === "preferences")
    return {
      ...state,
      preferences: mergeProgress(state.preferences, mutation.value),
    };
  if (mutation.kind === "clear")
    return { ...state, attempts: [], sessions: [] };
  if (mutation.kind === "deleteSession")
    return {
      ...state,
      sessions: state.sessions.filter((r) => r.id !== mutation.id),
      attempts: state.attempts.filter((r) => r.sessionId !== mutation.id),
    };
  if (mutation.kind === "deleteAttempt") {
    const group = state.attempts.find((r) => r.id === mutation.id)?.sessionId;
    return {
      ...state,
      attempts: state.attempts.filter((r) => r.id !== mutation.id),
      sessions: state.sessions.filter((r) => r.id !== group),
    };
  }
  const field = mutation.kind === "attempt" ? "attempts" : "sessions";
  if (
    !mutation.initial &&
    !state[field].some((r) => r.id === mutation.record.id)
  )
    return state;
  return {
    ...state,
    [field]: [
      mutation.record,
      ...state[field].filter((r) => r.id !== mutation.record.id),
    ].sort(
      (a, b) =>
        b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id),
    ),
  };
}
export class HistoryStore {
  constructor(readonly owner?: string) {}
  private state = EMPTY;
  private listeners = new Set<() => void>();
  private db: IDBDatabase | null = null;
  private initialization: Promise<void> | null = null;
  private pending: Mutation[] = [];
  private flushing = false;
  private channel: BroadcastChannel | null = null;
  private group: { id: string; index: number } | null = null;
  private purged = false;
  getSnapshot = () => this.state;
  getServerSnapshot = () => EMPTY;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private publish(patch: Partial<HistorySnapshot>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }
  connect = () => {
    if (typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel(
        `lunavoice-history-${this.owner ?? "guest"}`,
      );
      this.channel.onmessage = () => {
        void this.refresh();
      };
    }
    void this.init();
    return () => {
      this.channel?.close();
      this.channel = null;
    };
  };
  private async refresh(strict = false) {
    if (!this.db) return;
    try {
      const loaded = await readHistory(this.db);
      const attempts = loaded.attempts
          .filter(validAttempt)
          .sort(
            (a, b) =>
              b.startedAt.localeCompare(a.startedAt) ||
              b.id.localeCompare(a.id),
          ),
        sessions = loaded.sessions
          .filter(validSession)
          .sort(
            (a, b) =>
              b.startedAt.localeCompare(a.startedAt) ||
              b.id.localeCompare(a.id),
          );
      const ignored =
        attempts.length !== loaded.attempts.length ||
        sessions.length !== loaded.sessions.length;
      let next = {
        ...this.state,
        attempts,
        sessions,
        preferences: normalizeProgress(loaded.preferences),
        favorites: loaded.favorites.filter((id) =>
          EXERCISES.some((e) => e.id === id),
        ),
        profileName: loaded.profileName.slice(0, 80),
        ready: true,
      };
      for (const operation of this.pending) next = apply(next, operation);
      this.publish({
        ...next,
        notice: ignored
          ? "Некоторые записи имеют неизвестный формат и не показаны. Исходные записи сохранены в базе."
          : this.state.notice,
      });
    } catch (error) {
      if (strict) throw error;
      this.publish({
        ready: true,
        notice: error instanceof Error ? error.message : "История недоступна.",
      });
    }
  }
  init = () => {
    if (!this.initialization)
      this.initialization = (async () => {
        try {
          this.db = await openHistory(indexedDB, this.owner);
          await this.refresh(true);
        } catch (error) {
          this.db?.close();
          this.db = null;
          this.publish({
            ready: true,
            notice: `${error instanceof Error ? error.message : "История недоступна."} Новые результаты пока хранятся только в этой вкладке.`,
          });
        }
      })();
    return this.initialization;
  };
  private enqueue(mutation: Mutation) {
    if (this.purged) return;
    this.pending.push(mutation);
    this.publish({ ...apply(this.state, mutation), saving: true });
    void this.flush();
  }
  private async flush() {
    if (this.flushing) return;
    this.flushing = true;
    await this.init();
    try {
      if (!this.db) return;
      while (this.pending.length) {
        await writeHistory(this.db, this.pending[0], !!this.owner);
        this.pending.shift();
      }
      this.publish({ notice: "" });
      this.channel?.postMessage("changed");
    } catch (error) {
      this.publish({
        notice: `${error instanceof Error ? error.message : "Не удалось сохранить историю."} Новые изменения пока доступны только в этой вкладке.`,
      });
      this.db?.close();
      this.db = null;
    } finally {
      this.flushing = false;
      this.publish({ saving: false });
    }
  }
  retry = async () => {
    if (this.flushing) return;
    this.db?.close();
    this.db = null;
    this.initialization = null;
    this.publish({ saving: true });
    await this.init();
    await this.flush();
  };
  updatePreferences = (patch: Partial<ProgressPreferences>) =>
    this.enqueue({
      kind: "preferences",
      value: patch,
    });
  rememberPractice = (practice: PracticeSettings) =>
    this.updatePreferences({
      baseMidi: practice.baseMidi,
      lastExerciseId: practice.exerciseId,
      tempos: { [practice.exerciseId ?? "ladder"]: practice.bpm },
    });
  onAttempt = (event: AttemptEvent) => {
    const previous = this.state.attempts.find((r) => r.id === event.id);
    if (event.type !== "started" && !previous) return;
    if (previous?.status === "completed" || previous?.status === "interrupted")
      return;
    const record = attemptFromEvent(
      event,
      previous?.sessionId ?? this.group?.id ?? null,
    );
    this.enqueue({
      kind: "attempt",
      record,
      initial: event.type === "started",
    });
    if (event.type === "started" && this.group) {
      const session = this.state.sessions.find((r) => r.id === this.group!.id);
      if (session) {
        const attemptIds = [...session.attemptIds];
        attemptIds[this.group.index] = event.id;
        this.enqueue({
          kind: "session",
          record: { ...session, attemptIds },
          initial: false,
        });
      }
    }
    if (event.type === "completed" && record.sessionId) {
      const session = this.state.sessions.find(
        (r) => r.id === record.sessionId,
      );
      if (
        session &&
        session.attemptIds.every((id) =>
          this.state.attempts.some(
            (r) => r.id === id && r.status === "completed",
          ),
        )
      )
        this.enqueue({
          kind: "session",
          record: {
            ...session,
            status: "completed",
            endedAt: new Date().toISOString(),
          },
          initial: false,
        });
    }
  };
  startSession = (queue: PracticeSettings[]) => {
    this.endSession();
    const id = crypto.randomUUID();
    this.group = { id, index: 0 };
    this.enqueue({
      kind: "session",
      initial: true,
      record: {
        recordVersion: 1,
        id,
        title: SHORT_SESSION.title,
        startedAt: new Date().toISOString(),
        endedAt: null,
        status: "incomplete",
        queue: structuredClone(queue),
        attemptIds: queue.map(() => null),
      },
    });
  };
  setSessionStage = (index: number) => {
    if (this.group) this.group.index = index;
  };
  endSession = () => {
    const session = this.state.sessions.find((r) => r.id === this.group?.id);
    this.group = null;
    if (session && session.status !== "completed")
      this.enqueue({
        kind: "session",
        initial: false,
        record: {
          ...session,
          status: "interrupted",
          endedAt: new Date().toISOString(),
        },
      });
  };
  deleteAttempt = (id: string) => this.enqueue({ kind: "deleteAttempt", id });
  deleteSession = (id: string) => this.enqueue({ kind: "deleteSession", id });
  clear = () => this.enqueue({ kind: "clear" });
  updateProfile = (name: string) =>
    this.enqueue({ kind: "profile", name: name.trim().slice(0, 80) });
  toggleFavorite = (id: string) => {
    if (EXERCISES.some((e) => e.id === id))
      this.enqueue({
        kind: "favorite",
        id,
        enabled: !this.state.favorites.includes(id),
      });
  };
  syncDatabase = async () => {
    await this.init();
    if (!this.db)
      throw new Error("Сначала восстановите локальное сохранение истории.");
    return this.db;
  };
  refreshAfterSync = async () => {
    await this.refresh(true);
    this.channel?.postMessage("changed");
  };
  importGuest = async () => {
    if (!this.owner) return;
    const guest = await openHistory();
    try {
      const data = await readHistory(guest);
      for (const record of data.sessions.filter(validSession))
        if (!this.state.sessions.some((r) => r.id === record.id))
          this.enqueue({ kind: "session", record, initial: true });
      for (const record of data.attempts.filter(validAttempt))
        if (!this.state.attempts.some((r) => r.id === record.id))
          this.enqueue({ kind: "attempt", record, initial: true });
      const library = parseLibrary(window.localStorage.getItem(LIBRARY_KEY));
      for (const id of library.favorites)
        this.enqueue({ kind: "favorite", id, enabled: true });
    } finally {
      guest.close();
    }
  };
  purgeAccountCache = async () => {
    if (!this.owner) return;
    this.purged = true;
    this.pending = [];
    this.group = null;
    const db = await this.syncDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(
        ["attempts", "sessions", "preferences", "outbox"],
        "readwrite",
      );
      for (const name of ["attempts", "sessions", "preferences", "outbox"])
        tx.objectStore(name).clear();
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () =>
        reject(
          new Error(
            "Аккаунт удалён, но локальный кэш очистить не удалось. Очистите данные сайта в браузере.",
          ),
        );
    });
    try {
      window.localStorage.removeItem(`lunavoice.library.v1-${this.owner}`);
    } catch {
      /* history is already cleared */
    }
    this.publish({ ...EMPTY, ready: true });
    this.channel?.postMessage("changed");
  };
  export = () => {
    const payload = {
      format: "lunavoice-history",
      version: 1,
      exportedAt: new Date().toISOString(),
      attempts: this.state.attempts,
      sessions: this.state.sessions,
      preferences: this.state.preferences,
      profileName: this.state.profileName,
      favorites: this.state.favorites,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `luna-voice-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
}
