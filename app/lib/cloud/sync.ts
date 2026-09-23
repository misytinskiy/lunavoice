import { EXERCISES } from "../exercises";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { HistoryStore } from "../history/store";
import {
  readOutbox,
  acknowledge,
  mergeCloud,
  type CloudRow,
} from "../history/database";
import { validAttempt, validSession } from "../history/model";
export function validCloudRow(value: unknown): value is CloudRow {
  if (!value || typeof value !== "object") return false;
  const row = value as CloudRow;
  if (typeof row.id !== "string" || typeof row.deleted !== "boolean")
    return false;
  if (row.kind === "attempt")
    return row.deleted || (validAttempt(row.data) && row.data.id === row.id);
  if (row.kind === "session")
    return row.deleted || (validSession(row.data) && row.data.id === row.id);
  if (row.kind === "favorite") return typeof row.data === "boolean";
  if (row.kind === "profile")
    return row.id === "name" && typeof row.data === "string";
  return (
    row.kind === "setting" &&
    ["baseMidi", "volume", "goalMinutes", "reminder", "lastExerciseId"]
      .concat(EXERCISES.map((exercise) => `tempo:${exercise.id}`))
      .includes(row.id)
  );
}
export type SyncState = {
  busy: boolean;
  pending: number;
  error: string;
  lastSynced: string | null;
};
export class CloudSync {
  private stopped = false;
  private running = false;
  constructor(
    private client: SupabaseClient,
    private store: HistoryStore,
    private publish: (state: SyncState) => void,
  ) {}
  stop() {
    this.stopped = true;
  }
  run = async () => {
    if (this.stopped || this.running || !this.store.owner) return;
    this.running = true;
    let pending = 0;
    const perform = async () => {
      if (this.stopped) return;
      try {
        const db = await this.store.syncDatabase();
        const batch = await readOutbox(db);
        pending = batch.length;
        this.publish({ busy: true, pending, error: "", lastSynced: null });
        if (!navigator.onLine)
          throw new Error(
            "Нет сети. Изменения ждут отправки на этом устройстве.",
          );
        // Captured account must still own the auth session before every request.
        const check = async () => {
          if (this.stopped) throw new Error("Синхронизация остановлена.");
          const { data } = await this.client.auth.getSession();
          if (
            this.stopped ||
            !data.session ||
            data.session.user.id !== this.store.owner
          )
            throw new Error("Для синхронизации войдите в этот аккаунт снова.");
          return data.session.access_token;
        };
        for (const entry of batch) {
          const token = await check();
          const { error } = await this.client
            .rpc("voice_apply", {
              operation_id: entry.operationId,
              mutation: entry.mutation,
            })
            .setHeader("Authorization", `Bearer ${token}`)
            .abortSignal(AbortSignal.timeout(15000));
          if (error)
            throw new Error(
              "Не удалось отправить изменения. Они сохранены на устройстве; попробуйте синхронизировать снова.",
            );
          await acknowledge(db, entry.sequence);
          pending--;
        }
        const rows: CloudRow[] = [];
        for (let from = 0; ; from += 500) {
          const token = await check();
          const { data, error } = await this.client
            .from("voice_records")
            .select("kind,id,data,deleted")
            .eq("owner_id", this.store.owner)
            .order("kind")
            .order("id")
            .range(from, from + 499)
            .setHeader("Authorization", `Bearer ${token}`)
            .abortSignal(AbortSignal.timeout(15000));
          if (error)
            throw new Error(
              "Не удалось загрузить облачную историю. Локальные данные сохранены.",
            );
          if (!data.every(validCloudRow))
            throw new Error(
              "В облаке есть записи неизвестного формата. Обновите приложение перед синхронизацией.",
            );
          rows.push(...(data as CloudRow[]));
          if (data.length < 500) break;
        }
        await check();
        await mergeCloud(db, rows);
        await this.store.refreshAfterSync();
        pending = (await readOutbox(db)).length;
        if (!this.stopped)
          this.publish({
            busy: false,
            pending,
            error: "",
            lastSynced: new Date().toISOString(),
          });
      } catch (error) {
        if (!this.stopped)
          this.publish({
            busy: false,
            pending,
            error:
              error instanceof Error
                ? error.message
                : "Синхронизация недоступна.",
            lastSynced: null,
          });
      }
    };
    try {
      if (navigator.locks)
        await navigator.locks.request(
          `lunavoice-sync-${this.store.owner}`,
          perform,
        );
      else await perform();
    } finally {
      this.running = false;
    }
  };
}
