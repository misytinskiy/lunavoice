"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { LibraryStore } from "../lib/library";
export function useLibrary(owner?: string) {
  const [store] = useState(
    () => new LibraryStore(owner ? `lunavoice.library.v1-${owner}` : undefined),
  );
  const value = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  useEffect(() => {
    store.restore();
    const changed = (event: StorageEvent) => {
      if (event.key === store.key || event.key === null) store.restore();
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [store]);
  return { ...value, store };
}
