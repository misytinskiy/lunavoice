"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { AudioEngine } from "../lib/audio/engine";

export function useAudioEngine() {
  const [engine] = useState(() => new AudioEngine());
  const state = useSyncExternalStore(
    engine.subscribe,
    engine.getSnapshot,
    engine.getSnapshot,
  );
  useEffect(() => {
    engine.restoreSettings();
    const onVisibility = () => {
      if (document.hidden) engine.interrupt();
    };
    const onPageHide = () => engine.reset();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    const media = navigator.mediaDevices;
    media?.addEventListener("devicechange", engine.refreshDevices);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      media?.removeEventListener("devicechange", engine.refreshDevices);
      engine.reset();
    };
  }, [engine]);
  return { engine, ...state };
}
