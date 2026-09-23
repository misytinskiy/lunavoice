"use client";
import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { HistoryStore } from "../lib/history/store";
import { CloudSync, type SyncState } from "../lib/cloud/sync";
export function useCloudSync(
  client: SupabaseClient | null,
  store: HistoryStore,
) {
  const sync = useRef<CloudSync | null>(null);
  const [state, setState] = useState<SyncState>({
    busy: false,
    pending: 0,
    error: "",
    lastSynced: null,
  });
  useEffect(() => {
    if (!client || !store.owner) return;
    const service = new CloudSync(client, store, (next) =>
      setState((prev) => ({
        ...next,
        lastSynced: next.lastSynced ?? prev.lastSynced,
      })),
    );
    sync.current = service;
    void service.run();
    let wasSaving = store.getSnapshot().saving;
    let debounce: ReturnType<typeof setTimeout>;
    const unsubscribe = store.subscribe(() => {
      const saving = store.getSnapshot().saving;
      if (wasSaving && !saving) {
        clearTimeout(debounce);
        debounce = setTimeout(service.run, 250);
      }
      wasSaving = saving;
    });
    const timer = setInterval(service.run, 15000);
    window.addEventListener("online", service.run);
    window.addEventListener("focus", service.run);
    return () => {
      service.stop();
      sync.current = null;
      unsubscribe();
      clearTimeout(debounce);
      clearInterval(timer);
      window.removeEventListener("online", service.run);
      window.removeEventListener("focus", service.run);
    };
  }, [client, store]);
  return {
    ...state,
    stop: () => sync.current?.stop(),
    retry: () => {
      void sync.current?.run();
    },
  };
}
