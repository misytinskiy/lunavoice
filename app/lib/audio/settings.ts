export type OutputMode = "wired" | "bluetooth" | "speakers";
export type AudioSettings = {
  deviceId: string;
  outputMode: OutputMode;
  thresholdDb: number;
  correctionMs: number;
  noiseFloorDb: number | null;
  checked: boolean;
};
export type StorageLike = Pick<Storage, "getItem" | "setItem">;
export const SETTINGS_KEY = "lunavoice.audio.v1";
export const DEFAULT_SETTINGS: AudioSettings = {
  deviceId: "default",
  outputMode: "speakers",
  thresholdDb: -42,
  correctionMs: 0,
  noiseFloorDb: null,
  checked: false,
};
const finite = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
export function normalizeSettings(
  input: Partial<AudioSettings>,
): AudioSettings {
  return {
    checked: input.checked === true,
    deviceId:
      typeof input.deviceId === "string" && input.deviceId.length < 512
        ? input.deviceId
        : "default",
    outputMode: ["wired", "bluetooth", "speakers"].includes(
      input.outputMode ?? "",
    )
      ? input.outputMode!
      : "speakers",
    thresholdDb: finite(input.thresholdDb, -42, -60, -20),
    correctionMs: finite(input.correctionMs, 0, -200, 800),
    noiseFloorDb:
      typeof input.noiseFloorDb === "number" &&
      Number.isFinite(input.noiseFloorDb)
        ? Math.max(-100, Math.min(0, input.noiseFloorDb))
        : null,
  };
}
type Saved = {
  version: 1;
  selected: { deviceId: string; outputMode: OutputMode };
  profiles: Record<string, AudioSettings>;
};
const keyFor = (deviceId: string, mode: OutputMode) =>
  JSON.stringify([deviceId, mode]);
function read(storage: StorageLike | null): Saved | null {
  try {
    const raw = storage?.getItem(SETTINGS_KEY);
    const value = raw ? JSON.parse(raw) : null;
    return value?.version === 1 &&
      value.profiles &&
      typeof value.profiles === "object" &&
      value.selected
      ? value
      : null;
  } catch {
    return null;
  }
}
export function loadSettings(
  storage: StorageLike | null,
  deviceId?: string,
  mode?: OutputMode,
): AudioSettings {
  const saved = read(storage);
  const selected = normalizeSettings(saved?.selected ?? DEFAULT_SETTINGS);
  const id = deviceId ?? selected.deviceId,
    output = mode ?? selected.outputMode;
  return normalizeSettings({
    ...saved?.profiles[keyFor(id, output)],
    deviceId: id,
    outputMode: output,
  });
}
export function saveSettings(
  storage: StorageLike | null,
  settings: AudioSettings,
) {
  if (!storage) return false;
  try {
    const normalized = normalizeSettings(settings);
    const previous = read(storage);
    // Bound storage growth when a browser rotates device IDs.
    const profiles = Object.fromEntries(
      Object.entries(previous?.profiles ?? {}).slice(-19),
    );
    profiles[keyFor(normalized.deviceId, normalized.outputMode)] = normalized;
    storage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        version: 1,
        selected: {
          deviceId: normalized.deviceId,
          outputMode: normalized.outputMode,
        },
        profiles,
      }),
    );
    return true;
  } catch {
    return false;
  }
}
