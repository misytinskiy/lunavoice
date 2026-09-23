import en from "./en.json";
import uk from "./uk.json";

export type Locale = "en" | "uk" | "ru";
export const LOCALE_KEY = "lunavoice.locale.v1";
export const DEFAULT_LOCALE: Locale = "en";
const dictionaries: Record<"en" | "uk", Record<string, string>> = { en, uk };
let locale: Locale = DEFAULT_LOCALE;
const listeners = new Set<() => void>();
export const isLocale = (value: unknown): value is Locale =>
  value === "en" || value === "uk" || value === "ru";
export const getLocale = () => locale;
export const getServerLocale = () => DEFAULT_LOCALE;
export function subscribeLocale(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function setLocale(value: Locale, persist = true) {
  if (!isLocale(value)) return;
  locale = value;
  if (typeof document !== "undefined") {
    document.documentElement.lang = value;
    document.title = translate("Luna Voice — вокальная практика", value);
  }
  if (persist && typeof window !== "undefined") {
    try {
      localStorage.setItem(LOCALE_KEY, value);
    } catch {
      /* The current tab still switches. */
    }
  }
  listeners.forEach((listener) => listener());
}
let initialized = false;
export function initializeLocale() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(LOCALE_KEY);
  } catch {
    /* Default English. */
  }
  setLocale(isLocale(saved) ? saved : DEFAULT_LOCALE, false);
  window.addEventListener("storage", (event) => {
    if (event.key === LOCALE_KEY || event.key === null)
      setLocale(
        isLocale(event.newValue) ? event.newValue : DEFAULT_LOCALE,
        false,
      );
  });
}
export const localeTag = () =>
  ({ en: "en-US", uk: "uk-UA", ru: "ru-RU" })[locale];
const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const keys = Object.keys(en);
// Legacy engine notices and stored history keep their original text. Translate them
// at the presentation boundary so switching languages never mutates saved records.
const patterns = keys
  .filter((key) => /\{\d+\}/.test(key))
  .map((key) => ({
    key,
    regex: new RegExp(
      "^" +
        key
          .split(/\{\d+\}/)
          .map(escapeRegExp)
          .join("(.+?)") +
        "$",
    ),
    slots: [...key.matchAll(/\{(\d+)\}/g)].map((match) => match[1]),
  }))
  .sort((a, b) => b.key.length - a.key.length);
const fragments = new RegExp(
  "(?<![\\p{L}])(?:" +
    keys
      .filter((key) => !key.includes("{") && key.trim() === key)
      .sort((a, b) => b.length - a.length)
      .map(escapeRegExp)
      .join("|") +
    ")(?![\\p{L}])",
  "gu",
);
export function translate(source: string, language: Locale = locale): string {
  if (language === "ru" || !source) return source;
  const dictionary = dictionaries[language];
  if (Object.hasOwn(dictionary, source)) return dictionary[source];
  if (!/[а-яё]/i.test(source)) return source;
  for (const pattern of patterns) {
    const match = source.match(pattern.regex);
    if (match) {
      const values = Object.fromEntries(
        pattern.slots.map((slot, i) => [
          slot,
          translate(match[i + 1], language),
        ]),
      );
      return dictionary[pattern.key].replace(
        /\{(\d+)\}/g,
        (_, slot) => values[slot],
      );
    }
  }
  // Composite labels such as "Add to favorites: The ladder" contain several
  // catalogue messages. Only complete known phrases/words are substituted.
  return source.replace(fragments, (match) => dictionary[match] ?? match);
}
/** Localize text only; numeric values, React elements and event handlers pass through. */
export function t<T>(value: T): T {
  return (typeof value === "string" ? translate(value) : value) as T;
}
