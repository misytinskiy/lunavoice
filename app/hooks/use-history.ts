"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { HistoryStore } from "../lib/history/store";
import type { AudioEngine } from "../lib/audio/engine";
export function useHistory(engine: AudioEngine, owner?: string) {
  const [store] = useState(() => new HistoryStore(owner));
  const value = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  useEffect(() => {
    const disconnect = store.connect(),
      unsubscribe = engine.subscribeAttempts(store.onAttempt);
    const pageHide = () => store.endSession();
    window.addEventListener("pagehide", pageHide);
    return () => {
      store.endSession();
      disconnect();
      unsubscribe();
      window.removeEventListener("pagehide", pageHide);
    };
  }, [store, engine]);
  return { ...value, store };
}
