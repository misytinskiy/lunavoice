import { mergeProgress } from "./model";
import type {
  AttemptRecord,
  SessionRecord,
  ProgressPreferences,
} from "./model";
export const HISTORY_DB = "lunavoice-history";
export const HISTORY_DB_VERSION = 3;
export const historyDatabaseName = (owner?: string) =>
  owner ? `${HISTORY_DB}-${owner}` : HISTORY_DB;
export type CloudRow = {
  kind: "attempt" | "session" | "setting" | "favorite" | "profile";
  id: string;
  data: unknown;
  deleted: boolean;
};
export type OutboxEntry = {
  sequence: number;
  operationId: string;
  mutation: Mutation;
};
export type Mutation =
  | { kind: "attempt"; record: AttemptRecord; initial: boolean }
  | { kind: "session"; record: SessionRecord; initial: boolean }
  | { kind: "preferences"; value: Partial<ProgressPreferences> }
  | { kind: "favorite"; id: string; enabled: boolean }
  | { kind: "profile"; name: string }
  | { kind: "deleteAttempt"; id: string }
  | { kind: "deleteSession"; id: string }
  | { kind: "clear" };
export function openHistory(
  factory: IDBFactory = indexedDB,
  owner?: string,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const request = factory.open(
      historyDatabaseName(owner),
      HISTORY_DB_VERSION,
    );
    const timeout = setTimeout(() => {
      settled = true;
      reject(new Error("Хранилище не ответило. Попробуйте сохранить ещё раз."));
    }, 5000);
    const fail = (message: string) => {
      clearTimeout(timeout);
      settled = true;
      reject(new Error(message));
    };
    request.onblocked = () =>
      fail(
        "Обновление истории заблокировано другой вкладкой. Закройте другие вкладки Luna Voice и повторите.",
      );
    request.onerror = () =>
      fail("Браузер не разрешил открыть локальную историю.");
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("outbox"))
        db.createObjectStore("outbox", {
          keyPath: "sequence",
          autoIncrement: true,
        });
      if (!db.objectStoreNames.contains("attempts"))
        db.createObjectStore("attempts", { keyPath: "id" });
      if (!db.objectStoreNames.contains("sessions"))
        db.createObjectStore("sessions", { keyPath: "id" });
      if (!db.objectStoreNames.contains("preferences"))
        db.createObjectStore("preferences", { keyPath: "key" });
      const attempts = request.transaction!.objectStore("attempts");
      if (!attempts.indexNames.contains("startedAt"))
        attempts.createIndex("startedAt", "startedAt");
      if (!attempts.indexNames.contains("sessionId"))
        attempts.createIndex("sessionId", "sessionId");
    };
    request.onsuccess = () => {
      clearTimeout(timeout);
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}
export function readHistory(db: IDBDatabase): Promise<{
  attempts: unknown[];
  sessions: unknown[];
  preferences?: ProgressPreferences;
  favorites: string[];
  profileName: string;
}> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      ["attempts", "sessions", "preferences"],
      "readonly",
    );
    const attempts = tx.objectStore("attempts").getAll(),
      sessions = tx.objectStore("sessions").getAll(),
      prefs = tx.objectStore("preferences").get("progress"),
      favorites = tx.objectStore("preferences").get("favorites"),
      profile = tx.objectStore("preferences").get("profile");
    tx.oncomplete = () =>
      resolve({
        attempts: attempts.result,
        sessions: sessions.result,
        preferences: prefs.result?.value,
        favorites: Array.isArray(favorites.result?.value)
          ? favorites.result.value
          : [],
        profileName:
          typeof profile.result?.value === "string" ? profile.result.value : "",
      });
    tx.onabort = tx.onerror = () =>
      reject(new Error("Не удалось прочитать историю."));
  });
}
export function writeHistory(
  db: IDBDatabase,
  mutation: Mutation,
  sync = false,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      ["attempts", "sessions", "preferences", "outbox"],
      "readwrite",
    );
    applyMutation(tx, mutation);
    if (sync)
      tx.objectStore("outbox").add({
        operationId: crypto.randomUUID(),
        mutation,
      });
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () =>
      reject(
        new Error(
          "Не удалось сохранить изменения. Возможно, хранилище заполнено или недоступно.",
        ),
      );
  });
}
function applyMutation(tx: IDBTransaction, mutation: Mutation) {
  const attempts = tx.objectStore("attempts"),
    sessions = tx.objectStore("sessions");
  if (mutation.kind === "attempt" || mutation.kind === "session") {
    const store = mutation.kind === "attempt" ? attempts : sessions;
    if (mutation.initial) store.put(mutation.record);
    else {
      const request = store.getKey(mutation.record.id);
      request.onsuccess = () => {
        if (request.result !== undefined) store.put(mutation.record);
      };
    }
  } else if (mutation.kind === "preferences") {
    const store = tx.objectStore("preferences"),
      previous = store.get("progress");
    previous.onsuccess = () =>
      store.put({
        key: "progress",
        value: mergeProgress(previous.result?.value, mutation.value),
      });
  } else if (mutation.kind === "favorite") {
    const store = tx.objectStore("preferences"),
      request = store.get("favorites");
    request.onsuccess = () => {
      const ids: string[] = request.result?.value ?? [];
      store.put({
        key: "favorites",
        value: mutation.enabled
          ? [...new Set([...ids, mutation.id])]
          : ids.filter((id) => id !== mutation.id),
      });
    };
  } else if (mutation.kind === "profile") {
    tx.objectStore("preferences").put({ key: "profile", value: mutation.name });
  } else if (mutation.kind === "clear") {
    attempts.clear();
    sessions.clear();
  } else if (mutation.kind === "deleteAttempt") {
    const request = attempts.get(mutation.id);
    request.onsuccess = () => {
      const sessionId = request.result?.sessionId;
      attempts.delete(mutation.id);
      // Removing a child also removes its summary, so the summary cannot retain deleted results.
      if (sessionId) sessions.delete(sessionId);
    };
  } else {
    sessions.delete(mutation.id);
    const cursor = attempts
      .index("sessionId")
      .openCursor(IDBKeyRange.only(mutation.id));
    cursor.onsuccess = () => {
      const item = cursor.result;
      if (item) {
        item.delete();
        item.continue();
      }
    };
  }
}

export function readOutbox(db: IDBDatabase): Promise<OutboxEntry[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("outbox", "readonly");
    const request = tx.objectStore("outbox").getAll(undefined, 50);
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = tx.onerror = () =>
      reject(new Error("Очередь синхронизации недоступна."));
  });
}
export function acknowledge(db: IDBDatabase, sequence: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("outbox", "readwrite");
    tx.objectStore("outbox").delete(sequence);
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () =>
      reject(new Error("Не удалось подтвердить синхронизацию."));
  });
}
export function mergeCloud(db: IDBDatabase, rows: CloudRow[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      ["attempts", "sessions", "preferences", "outbox"],
      "readwrite",
    );
    for (const row of rows) {
      if (row.kind !== "attempt" && row.kind !== "session") continue;
      const store = tx.objectStore(
        row.kind === "attempt" ? "attempts" : "sessions",
      );
      if (row.deleted) store.delete(row.id);
      else store.put(row.data);
    }
    const preferences = tx.objectStore("preferences");
    const progress = preferences.get("progress"),
      favorites = preferences.get("favorites");
    progress.onsuccess = () => {
      let value = mergeProgress(progress.result?.value, {});
      for (const row of rows.filter(
        (r) => r.kind === "setting" && !r.deleted,
      )) {
        if (row.id.startsWith("tempo:"))
          value = mergeProgress(value, {
            tempos: { [row.id.slice(6)]: row.data as number },
          });
        else value = mergeProgress(value, { [row.id]: row.data });
      }
      preferences.put({ key: "progress", value });
    };
    favorites.onsuccess = () => {
      const ids = new Set<string>(favorites.result?.value ?? []);
      for (const row of rows.filter((r) => r.kind === "favorite")) {
        if (row.deleted || row.data !== true) ids.delete(row.id);
        else ids.add(row.id);
      }
      preferences.put({ key: "favorites", value: [...ids] });
    };
    const profile = rows.find((r) => r.kind === "profile" && !r.deleted);
    if (profile) preferences.put({ key: "profile", value: profile.data });
    // Replay still-pending local edits after the remote snapshot, within one transaction.
    const cursor = tx.objectStore("outbox").openCursor();
    cursor.onsuccess = () => {
      const item = cursor.result;
      if (item) {
        applyMutation(tx, item.value.mutation);
        item.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () =>
      reject(new Error("Не удалось сохранить облачную историю на устройстве."));
  });
}
