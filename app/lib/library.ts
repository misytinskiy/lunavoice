import { EXERCISES } from "./exercises";
import type { StorageLike } from "./audio/settings";
export const LIBRARY_KEY = "lunavoice.library.v1";
export type LibraryPreferences = {
  favorites: string[];
  recent: string[];
  notice: string;
};
const EMPTY: LibraryPreferences = { favorites: [], recent: [], notice: "" };
export function parseLibrary(raw: string | null): LibraryPreferences {
  try {
    const value = raw ? JSON.parse(raw) : null;
    if (value?.version !== 1) return EMPTY;
    const ids = (items: unknown) =>
      Array.isArray(items)
        ? [
            ...new Set(
              items.filter(
                (id): id is string =>
                  typeof id === "string" && EXERCISES.some((e) => e.id === id),
              ),
            ),
          ].slice(0, 12)
        : [];
    return {
      favorites: ids(value.favorites),
      recent: ids(value.recent),
      notice: "",
    };
  } catch {
    return EMPTY;
  }
}
export class LibraryStore {
  constructor(readonly key = LIBRARY_KEY) {}
  private state = EMPTY;
  private listeners = new Set<() => void>();
  private storage: StorageLike | null = null;
  getSnapshot = () => this.state;
  getServerSnapshot = () => EMPTY;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  restore = () => {
    try {
      this.storage = window.localStorage;
      this.state = parseLibrary(this.storage.getItem(this.key));
    } catch {
      this.storage = null;
      this.state = {
        ...this.state,
        notice:
          "Избранное и недавние упражнения доступны только до закрытия вкладки.",
      };
    }
    this.listeners.forEach((fn) => fn());
  };
  private save(next: LibraryPreferences) {
    this.state = next;
    try {
      if (!this.storage) throw new Error("Storage unavailable");
      this.storage.setItem(
        this.key,
        JSON.stringify({
          version: 1,
          favorites: next.favorites,
          recent: next.recent,
        }),
      );
    } catch {
      this.state = {
        ...next,
        notice:
          "Не удалось сохранить список. В этой вкладке он продолжает работать.",
      };
    }
    this.listeners.forEach((fn) => fn());
  }
  toggleFavorite = (id: string) => {
    if (!EXERCISES.some((e) => e.id === id)) return;
    const favorites = this.state.favorites.includes(id)
      ? this.state.favorites.filter((item) => item !== id)
      : [...this.state.favorites, id];
    this.save({ ...this.state, favorites });
  };
  visit = (id: string) => {
    if (!EXERCISES.some((e) => e.id === id)) return;
    this.save({
      ...this.state,
      recent: [id, ...this.state.recent.filter((item) => item !== id)].slice(
        0,
        6,
      ),
    });
  };
}
