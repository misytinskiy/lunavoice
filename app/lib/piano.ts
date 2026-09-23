import { SCALES, type Sound } from "./ear-training";

export const PIANO_MODES: Sound[] = [
  ...SCALES.filter((s) => !s.id.endsWith("-five")),
  {
    id: "chromatic",
    name: ["Chromatic", "Хроматичний", "Хроматический"],
    notes: Array.from({ length: 12 }, (_, i) => i),
  },
];
export const KEY_ROWS = [
  [
    "KeyZ",
    "KeyX",
    "KeyC",
    "KeyV",
    "KeyB",
    "KeyN",
    "KeyM",
    "Comma",
    "Period",
    "Slash",
  ],
  [
    "KeyA",
    "KeyS",
    "KeyD",
    "KeyF",
    "KeyG",
    "KeyH",
    "KeyJ",
    "KeyK",
    "KeyL",
    "Semicolon",
    "Quote",
  ],
  [
    "KeyQ",
    "KeyW",
    "KeyE",
    "KeyR",
    "KeyT",
    "KeyY",
    "KeyU",
    "KeyI",
    "KeyO",
    "KeyP",
    "BracketLeft",
    "BracketRight",
  ],
  [
    "Digit1",
    "Digit2",
    "Digit3",
    "Digit4",
    "Digit5",
    "Digit6",
    "Digit7",
    "Digit8",
    "Digit9",
    "Digit0",
    "Minus",
    "Equal",
  ],
];
export const KEY_LABELS: Record<string, string> = {
  Comma: ",",
  Period: ".",
  Slash: "/",
  Semicolon: ";",
  Quote: "'",
  BracketLeft: "[",
  BracketRight: "]",
  Minus: "−",
  Equal: "=",
};
export const keyLabel = (code: string) =>
  KEY_LABELS[code] ?? code.replace(/^(Key|Digit)/, "");
export function pianoNotes(tonic: number, mode: string) {
  const scale = PIANO_MODES.find((s) => s.id === mode) ?? PIANO_MODES[0];
  const offsets = new Set(scale.notes.map((n) => n % 12));
  return Array.from({ length: 49 }, (_, i) => i + 36).filter((n) =>
    offsets.has((n - tonic + 120) % 12),
  );
}
export function pianoMapping(tonic: number, mode: string) {
  const notes = pianoNotes(tonic, mode);
  return new Map(
    KEY_ROWS.flat().flatMap((code, i) =>
      notes[i] === undefined ? [] : [[code, notes[i]] as const],
    ),
  );
}
