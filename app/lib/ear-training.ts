import { getLocale } from "./i18n";

export type Text = readonly [string, string, string];
export const earText = (text: Text) =>
  text[getLocale() === "uk" ? 1 : getLocale() === "ru" ? 2 : 0];
export const EAR_TITLE: Text = [
  "Ear training",
  "Тренування слуху",
  "Тренировка слуха",
];
export const QUESTION_COUNT = 20;
export type Kind =
  | "pitch"
  | "notes"
  | "intervals"
  | "comparison"
  | "chords"
  | "inversions"
  | "progressions"
  | "scales";
export type Mode = "ascending" | "descending" | "harmonic" | "combined";
export type Sound = {
  id: string;
  name: Text;
  notes: number[];
  group?: Text;
  chords?: number[][];
};
const sound = (
  id: string,
  name: Text,
  notes: number[],
  group?: Text,
): Sound => ({ id, name, notes, group });
const first: Text = [
  "Simple intervals",
  "Прості інтервали",
  "Простые интервалы",
];
const compound: Text = [
  "Compound intervals",
  "Складені інтервали",
  "Составные интервалы",
];
const intervalNames: Text[] = [
  ["Unison", "Прима", "Прима"],
  ["Minor 2nd", "Мала секунда", "Малая секунда"],
  ["Major 2nd", "Велика секунда", "Большая секунда"],
  ["Minor 3rd", "Мала терція", "Малая терция"],
  ["Major 3rd", "Велика терція", "Большая терция"],
  ["Perfect 4th", "Чиста кварта", "Чистая кварта"],
  ["Tritone", "Тритон", "Тритон"],
  ["Perfect 5th", "Чиста квінта", "Чистая квинта"],
  ["Minor 6th", "Мала секста", "Малая секста"],
  ["Major 6th", "Велика секста", "Большая секста"],
  ["Minor 7th", "Мала септима", "Малая септима"],
  ["Major 7th", "Велика септима", "Большая септима"],
  ["Octave", "Октава", "Октава"],
  ["Minor 9th", "Мала нона", "Малая нона"],
  ["Major 9th", "Велика нона", "Большая нона"],
  ["Minor 10th", "Мала децима", "Малая децима"],
  ["Major 10th", "Велика децима", "Большая децима"],
  ["Perfect 11th", "Чиста ундецима", "Чистая ундецима"],
  ["Augmented 11th", "Збільшена ундецима", "Увеличенная ундецима"],
  ["Perfect 12th", "Чиста дуодецима", "Чистая дуодецима"],
  ["Minor 13th", "Мала терцдецима", "Малая терцдецима"],
  ["Major 13th", "Велика терцдецима", "Большая терцдецима"],
  ["Minor 14th", "Мала квартдецима", "Малая квартдецима"],
  ["Major 14th", "Велика квартдецима", "Большая квартдецима"],
  ["Double octave", "Подвійна октава", "Двойная октава"],
];
export const INTERVALS = intervalNames.map((name, i) =>
  sound(String(i), name, [0, i], i <= 12 ? first : compound),
);
const triads: Text = ["Triads", "Тризвуки", "Трезвучия"];
const sevenths: Text = ["Seventh chords", "Септакорди", "Септаккорды"];
export const CHORDS = [
  sound("major", ["Major", "Мажорний", "Мажорный"], [0, 4, 7], triads),
  sound("minor", ["Minor", "Мінорний", "Минорный"], [0, 3, 7], triads),
  sound("dim", ["Diminished", "Зменшений", "Уменьшённый"], [0, 3, 6], triads),
  sound("aug", ["Augmented", "Збільшений", "Увеличенный"], [0, 4, 8], triads),
  sound(
    "maj7",
    ["Major 7", "Великий мажорний", "Большой мажорный"],
    [0, 4, 7, 11],
    sevenths,
  ),
  sound(
    "dom7",
    ["Dominant 7", "Домінантсептакорд", "Доминантсептаккорд"],
    [0, 4, 7, 10],
    sevenths,
  ),
  sound(
    "min7",
    ["Minor 7", "Малий мінорний", "Малый минорный"],
    [0, 3, 7, 10],
    sevenths,
  ),
  sound(
    "minmaj7",
    ["Minor major 7", "Великий мінорний", "Большой минорный"],
    [0, 3, 7, 11],
    sevenths,
  ),
  sound(
    "dim7",
    ["Diminished 7", "Зменшений септакорд", "Уменьшённый септаккорд"],
    [0, 3, 6, 9],
    sevenths,
  ),
  sound(
    "halfDim7",
    ["Half-diminished 7", "Напівзменшений", "Полууменьшённый"],
    [0, 3, 6, 10],
    sevenths,
  ),
  sound(
    "augmaj7",
    ["Augmented major 7", "Великий збільшений", "Большой увеличенный"],
    [0, 4, 8, 11],
    sevenths,
  ),
];
const modes: Text = ["Modes", "Лади", "Лады"];
const minor: Text = ["Minor scales", "Мінорні гами", "Минорные гаммы"];
const pent: Text = ["Pentatonic scales", "Пентатоніки", "Пентатоники"];
export const SCALES = [
  sound(
    "ionian",
    ["Ionian / major", "Іонійський / мажор", "Ионийский / мажор"],
    [0, 2, 4, 5, 7, 9, 11, 12],
    modes,
  ),
  sound(
    "dorian",
    ["Dorian", "Дорійський", "Дорийский"],
    [0, 2, 3, 5, 7, 9, 10, 12],
    modes,
  ),
  sound(
    "phrygian",
    ["Phrygian", "Фригійський", "Фригийский"],
    [0, 1, 3, 5, 7, 8, 10, 12],
    modes,
  ),
  sound(
    "lydian",
    ["Lydian", "Лідійський", "Лидийский"],
    [0, 2, 4, 6, 7, 9, 11, 12],
    modes,
  ),
  sound(
    "mixolydian",
    ["Mixolydian", "Міксолідійський", "Миксолидийский"],
    [0, 2, 4, 5, 7, 9, 10, 12],
    modes,
  ),
  sound(
    "aeolian",
    [
      "Aeolian / natural minor",
      "Еолійський / натуральний мінор",
      "Эолийский / натуральный минор",
    ],
    [0, 2, 3, 5, 7, 8, 10, 12],
    modes,
  ),
  sound(
    "locrian",
    ["Locrian", "Локрійський", "Локрийский"],
    [0, 1, 3, 5, 6, 8, 10, 12],
    modes,
  ),
  sound(
    "harmonic-minor",
    ["Harmonic minor", "Гармонічний мінор", "Гармонический минор"],
    [0, 2, 3, 5, 7, 8, 11, 12],
    minor,
  ),
  sound(
    "melodic-minor",
    [
      "Jazz melodic minor",
      "Джазовий мелодичний мінор",
      "Джазовый мелодический минор",
    ],
    [0, 2, 3, 5, 7, 9, 11, 12],
    minor,
  ),
  sound(
    "do-pent",
    [
      "Do pentatonic / major",
      "До-пентатоніка / мажорна",
      "До-пентатоника / мажорная",
    ],
    [0, 2, 4, 7, 9, 12],
    pent,
  ),
  sound(
    "re-pent",
    ["Re pentatonic", "Ре-пентатоніка", "Ре-пентатоника"],
    [0, 2, 5, 7, 10, 12],
    pent,
  ),
  sound(
    "mi-pent",
    ["Mi pentatonic", "Мі-пентатоніка", "Ми-пентатоника"],
    [0, 3, 5, 8, 10, 12],
    pent,
  ),
  sound(
    "sol-pent",
    ["Sol pentatonic", "Соль-пентатоніка", "Соль-пентатоника"],
    [0, 2, 5, 7, 9, 12],
    pent,
  ),
  sound(
    "la-pent",
    [
      "La pentatonic / minor",
      "Ля-пентатоніка / мінорна",
      "Ля-пентатоника / минорная",
    ],
    [0, 3, 5, 7, 10, 12],
    pent,
  ),
  sound(
    "major-five",
    ["Major pentachord", "Мажорний пентахорд", "Мажорный пентахорд"],
    [0, 2, 4, 5, 7],
  ),
  sound(
    "minor-five",
    ["Minor pentachord", "Мінорний пентахорд", "Минорный пентахорд"],
    [0, 2, 3, 5, 7],
  ),
];
export const INVERSIONS = [
  sound("root", ["Root position", "Основний вид", "Основной вид"], [0, 4, 7]),
  sound(
    "first",
    ["First inversion", "Перше обернення", "Первое обращение"],
    [4, 7, 12],
  ),
  sound(
    "second",
    ["Second inversion", "Друге обернення", "Второе обращение"],
    [7, 12, 16],
  ),
];
const degreeChords = [
  [0, 4, 7],
  [2, 5, 9],
  [4, 7, 11],
  [5, 9, 12],
  [7, 11, 14],
  [9, 12, 16],
];
export const PROGRESSIONS: Sound[] = [
  ["I – IV", [0, 3]],
  ["I – V", [0, 4]],
  ["I – vi", [0, 5]],
  ["ii – V – I", [1, 4, 0]],
  ["I – IV – V – I", [0, 3, 4, 0]],
  ["I – vi – IV – V", [0, 5, 3, 4]],
  ["I – V – vi – IV", [0, 4, 5, 3]],
].map(([label, degrees]) => ({
  id: String(label),
  name: [String(label), String(label), String(label)],
  notes: [],
  chords: (degrees as number[]).map((i) => degreeChords[i]),
}));
export const NOTE_NAMES = [
  "C",
  "C♯ / D♭",
  "D",
  "D♯ / E♭",
  "E",
  "F",
  "F♯ / G♭",
  "G",
  "G♯ / A♭",
  "A",
  "A♯ / B♭",
  "B",
];
const NOTES = NOTE_NAMES.map((name, i) =>
  sound(String(i), [name, name, name], [i]),
);
const DIRECTIONS = [
  sound("higher", ["Higher", "Вище", "Выше"], [0, 4]),
  sound("lower", ["Lower", "Нижче", "Ниже"], [4, 0]),
  sound("same", ["Same pitch", "Однакова висота", "Одинаковая высота"], [0, 0]),
];
export const EXERCISES: {
  id: Kind;
  title: Text;
  description: Text;
  symbol: string;
}[] = [
  {
    id: "pitch",
    title: ["Pitch direction", "Напрямок мелодії", "Направление мелодии"],
    description: [
      "Is the second note higher, lower or the same?",
      "Друга нота вища, нижча чи така сама?",
      "Вторая нота выше, ниже или такая же?",
    ],
    symbol: "↗",
  },
  {
    id: "notes",
    title: ["Find the note", "Впізнай ноту", "Узнай ноту"],
    description: [
      "Hear C4 as a reference, then identify the target note.",
      "Послухай опорну C4 та визнач наступну ноту.",
      "Послушай опорную C4 и определи следующую ноту.",
    ],
    symbol: "♩",
  },
  {
    id: "intervals",
    title: ["Name the interval", "Впізнай інтервал", "Узнай интервал"],
    description: [
      "Recognize the distance between two notes.",
      "Визнач відстань між двома нотами.",
      "Определи расстояние между двумя нотами.",
    ],
    symbol: "↔",
  },
  {
    id: "comparison",
    title: ["Compare intervals", "Порівняй інтервали", "Сравни интервалы"],
    description: [
      "Listen to two intervals. Which one is wider?",
      "Послухай два інтервали. Який ширший?",
      "Послушай два интервала. Какой шире?",
    ],
    symbol: "≷",
  },
  {
    id: "chords",
    title: ["Chord colours", "Барви акордів", "Краски аккордов"],
    description: [
      "Identify triads and seventh chords by their sound.",
      "Впізнавай тризвуки та септакорди на слух.",
      "Узнавай трезвучия и септаккорды на слух.",
    ],
    symbol: "≡",
  },
  {
    id: "inversions",
    title: ["Chord positions", "Обернення акордів", "Обращения аккордов"],
    description: [
      "Find the inversion of a major triad.",
      "Визнач обернення мажорного тризвуку.",
      "Определи обращение мажорного трезвучия.",
    ],
    symbol: "⇅",
  },
  {
    id: "progressions",
    title: ["Harmonic paths", "Гармонічні шляхи", "Гармонические пути"],
    description: [
      "Hear the tonic chord, then recognize a progression in major.",
      "Послухай тонічний акорд і впізнай послідовність у мажорі.",
      "Послушай тонический аккорд и узнай последовательность в мажоре.",
    ],
    symbol: "→",
  },
  {
    id: "scales",
    title: ["Mode palette", "Палітра ладів", "Палитра ладов"],
    description: [
      "Recognize modes, minor scales and pentatonics.",
      "Впізнавай лади, мінорні гами та пентатоніки.",
      "Узнавай лады, минорные гаммы и пентатоники.",
    ],
    symbol: "⌁",
  },
];
export const MODE_NAMES: Record<Mode, Text> = {
  ascending: ["Ascending", "Висхідний", "Восходящий"],
  descending: ["Descending", "Низхідний", "Нисходящий"],
  harmonic: ["Together", "Одночасно", "Одновременно"],
  combined: [
    "Together, then ascending",
    "Разом, потім вгору",
    "Вместе, затем вверх",
  ],
};
export const poolFor = (kind: Kind): Sound[] =>
  ({
    pitch: DIRECTIONS,
    notes: NOTES,
    intervals: INTERVALS,
    comparison: INTERVALS,
    chords: CHORDS,
    inversions: INVERSIONS,
    progressions: PROGRESSIONS,
    scales: SCALES,
  })[kind];
export const modesFor = (kind: Kind): Mode[] =>
  kind === "pitch" || kind === "notes"
    ? ["ascending"]
    : kind === "scales"
      ? ["ascending", "descending"]
      : kind === "intervals" || kind === "comparison"
        ? ["ascending", "descending", "harmonic"]
        : ["ascending", "descending", "harmonic", "combined"];
export type Settings = {
  kind: Kind;
  selected: string[];
  mode: Mode;
  root: number;
  fixed: boolean;
  common: boolean;
  bpm: number;
};
export function defaultSettings(kind: Kind): Settings {
  const pool = poolFor(kind);
  const selected =
    kind === "intervals" || kind === "comparison"
      ? ["0", "2", "4", "5", "7", "12"]
      : kind === "scales"
        ? ["ionian", "aeolian", "dorian", "mixolydian"]
        : kind === "chords"
          ? pool.slice(0, 4).map((s) => s.id)
          : pool.map((s) => s.id);
  return {
    kind,
    selected,
    mode:
      kind === "chords" || kind === "inversions" || kind === "progressions"
        ? "harmonic"
        : "ascending",
    root: 60,
    fixed: true,
    common: true,
    bpm: 100,
  };
}
export type Event = { notes: number[]; beat: number; duration: number };
export type Question = {
  events: Event[];
  answer: string;
  options: Sound[];
  detail: Text;
};
export function phrase(notes: number[], mode: Mode, beat = 0): Event[] {
  if (mode === "harmonic")
    return [{ notes: [...new Set(notes)], beat, duration: 1.8 }];
  const ordered = mode === "descending" ? [...notes].reverse() : notes;
  const events = ordered.map((note, i) => ({
    notes: [note],
    beat: beat + i,
    duration: 0.85,
  }));
  return mode === "combined"
    ? [
        { notes: [...new Set(notes)], beat, duration: 1.8 },
        ...phrase(notes, "ascending", beat + 2.5),
      ]
    : events;
}
const end = (events: Event[]) =>
  Math.max(...events.map((e) => e.beat + e.duration));
export function soundEvents(sound: Sound, root: number, mode: Mode): Event[] {
  if (!sound.chords)
    return phrase(
      sound.notes.map((n) => n + root),
      mode,
    );
  const events: Event[] = [];
  for (const chord of sound.chords)
    events.push(
      ...phrase(
        chord.map((n) => n + root),
        mode,
        events.length ? end(events) + 0.8 : 0,
      ),
    );
  return events;
}
export function generateQuestions(
  settings: Settings,
  random = Math.random,
): Question[] {
  const pool = poolFor(settings.kind).filter((s) =>
    settings.selected.includes(s.id),
  );
  if (pool.length < 2) throw new Error("Select at least two sounds");
  if (
    !modesFor(settings.kind).includes(settings.mode) ||
    !Number.isInteger(settings.root) ||
    settings.root < 36 ||
    settings.root > 60 ||
    !Number.isFinite(settings.bpm) ||
    settings.bpm < 60 ||
    settings.bpm > 180
  )
    throw new Error("Invalid ear training settings");
  const pick = <T>(items: T[]) =>
    items[
      Math.min(
        items.length - 1,
        Math.max(0, Math.floor(random() * items.length)),
      )
    ];
  return Array.from({ length: QUESTION_COUNT }, () => {
    const target = pick(pool),
      root = settings.fixed ? settings.root : 48 + Math.floor(random() * 13);
    let events = soundEvents(target, root, settings.mode),
      answer = target.id,
      options = pool,
      detail = target.name;
    if (settings.kind === "notes") {
      events = [
        { notes: [60], beat: 0, duration: 0.9 },
        { notes: [60 + Number(target.id)], beat: 2.3, duration: 1.2 },
      ];
    } else if (settings.kind === "pitch") {
      const delta = 1 + Math.floor(random() * 12);
      events = phrase(
        target.id === "higher"
          ? [root, root + delta]
          : target.id === "lower"
            ? [root + delta, root]
            : [root, root],
        "ascending",
      );
    } else if (settings.kind === "comparison") {
      const second = pick(pool.filter((s) => s.id !== target.id));
      const next = soundEvents(
        second,
        settings.common ? root : 48 + Math.floor(random() * 13),
        settings.mode,
      );
      const offset = end(events) + 1.4;
      events = [
        ...events,
        ...next.map((e) => ({ ...e, beat: e.beat + offset })),
      ];
      answer = Number(target.id) > Number(second.id) ? "a" : "b";
      options = [
        sound(
          "a",
          ["First interval", "Перший інтервал", "Первый интервал"],
          [],
        ),
        sound(
          "b",
          ["Second interval", "Другий інтервал", "Второй интервал"],
          [],
        ),
      ];
      detail = [
        `${target.name[0]} → ${second.name[0]}`,
        `${target.name[1]} → ${second.name[1]}`,
        `${target.name[2]} → ${second.name[2]}`,
      ];
    } else if (settings.kind === "progressions") {
      events = [
        { notes: [root, root + 4, root + 7], beat: 0, duration: 1.5 },
        ...events.map((e) => ({ ...e, beat: e.beat + 3 })),
      ];
    }
    return { events, answer, options, detail };
  });
}
export const scoreAnswers = (questions: Question[], answers: string[]) =>
  questions.reduce((sum, q, i) => sum + Number(q.answer === answers[i]), 0);
