"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { earText as text } from "../lib/ear-training";
import {
  KEY_ROWS,
  keyLabel,
  PIANO_MODES,
  pianoMapping,
  pianoNotes,
} from "../lib/piano";
import { PianoPlayer } from "../lib/piano-player";
import { noteName } from "../lib/pitch";
import { Select, SelectOption } from "./select";

const allNotes = Array.from({ length: 49 }, (_, i) => 36 + i);
const black = (n: number) => [1, 3, 6, 8, 10].includes(n % 12);
export function Piano() {
  const [tonic, setTonic] = useState(0),
    [mode, setMode] = useState("ionian");
  const [volume, setVolume] = useState(0.6),
    [sustain, setSustain] = useState(false);
  const [held, setHeld] = useState<Map<string, number>>(new Map());
  const [last, setLast] = useState<number | null>(null),
    [error, setError] = useState(false);
  const player = useRef<PianoPlayer | null>(null);
  const mapping = useMemo(() => pianoMapping(tonic, mode), [tonic, mode]);
  const allowed = useMemo(
    () => new Set(pianoNotes(tonic, mode)),
    [tonic, mode],
  );
  useEffect(() => {
    const audio = new PianoPlayer();
    player.current = audio;
    return () => {
      audio.dispose();
      player.current = null;
    };
  }, []);
  useEffect(() => {
    player.current?.setVolume(volume);
  }, [volume]);
  useEffect(() => {
    player.current?.setSustain(sustain);
  }, [sustain]);
  useEffect(() => {
    const audio = player.current!;
    function stop() {
      audio.stop();
      setHeld(new Map());
    }
    function down(event: KeyboardEvent) {
      if (
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        (event.target instanceof Element &&
          event.target.closest(
            'input, textarea, select, [contenteditable="true"], [role="combobox"], [role="listbox"], [role="option"]',
          ))
      )
        return;
      const midi = mapping.get(event.code);
      if (midi === undefined) return;
      event.preventDefault();
      setLast(midi);
      setError(false);
      setHeld((old) => new Map(old).set(event.code, midi));
      void audio.press(event.code, midi).catch(() => setError(true));
    }
    function up(event: KeyboardEvent) {
      audio.lift(event.code);
      setHeld((old) => {
        const next = new Map(old);
        next.delete(event.code);
        return next;
      });
    }
    function visibility() {
      if (document.hidden) stop();
    }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      audio.stop();
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [mapping]);
  function change(action: () => void) {
    player.current?.stop();
    setHeld(new Map());
    setLast(null);
    action();
  }
  function press(event: PointerEvent<HTMLButtonElement>, midi: number) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const id = `pointer-${event.pointerId}`;
    setHeld((old) => new Map(old).set(id, midi));
    setLast(midi);
    setError(false);
    void player.current?.press(id, midi).catch(() => setError(true));
  }
  function lift(event: PointerEvent<HTMLButtonElement>) {
    const id = `pointer-${event.pointerId}`;
    player.current?.lift(id);
    setHeld((old) => {
      const next = new Map(old);
      next.delete(id);
      return next;
    });
  }
  const active = new Set(held.values());
  const pointers = (midi: number) => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => press(e, midi),
    onPointerUp: lift,
    onPointerCancel: lift,
    onLostPointerCapture: lift,
    onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if ((e.key === "Enter" || e.key === " ") && !e.repeat) {
        e.preventDefault();
        setLast(midi);
        setError(false);
        setHeld((old) => new Map(old).set("accessible", midi));
        void player.current
          ?.press("accessible", midi)
          .catch(() => setError(true));
      }
    },
    onKeyUp: (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        player.current?.lift("accessible");
        setHeld((old) => {
          const next = new Map(old);
          next.delete("accessible");
          return next;
        });
      }
    },
    onBlur: () => {
      player.current?.lift("accessible");
      setHeld((old) => {
        const next = new Map(old);
        next.delete("accessible");
        return next;
      });
    },
  });
  let whiteIndex = 0;
  return (
    <section className="piano-page">
      <header className="ear-heading">
        <div>
          <span className="ear-eyebrow">STUDIO / LUNA KEYS</span>
          <h1>
            {text(["Piano", "Піаніно", "Пианино"])}
            <span className="piano-dot">.</span>
          </h1>
          <p>
            {text([
              "Find your sound. Every key belongs to your scale.",
              "Знайди своє звучання. Кожна клавіша — у твоєму ладі.",
              "Найди своё звучание. Каждая клавиша — в твоём ладу.",
            ])}
          </p>
        </div>
        <span className="ear-badge">C2 — C6</span>
      </header>
      <div className="piano-instrument">
        <div className="piano-console">
          <div className="piano-brand">
            LUNA
            <br />
            KEYS<span>PLAY / EXPLORE / CREATE</span>
          </div>
          <div className="piano-display" data-playing={active.size > 0}>
            <svg viewBox="0 0 400 80" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((i) => (
                <path
                  key={i}
                  opacity={1 - i * 0.16}
                  d={`M0 45 Q40 ${5 + i * 5} 80 45 T160 45 Q190 ${-30 + i * 9} 210 40 T290 40 Q330 ${i * 8} 400 45`}
                />
              ))}
            </svg>
            <div>
              <strong>{last === null ? "—" : noteName(last)}</strong>
              <span>
                {last === null
                  ? text(["Ready to play", "Готово до гри", "Можно играть"])
                  : `${(440 * 2 ** ((last - 69) / 12)).toFixed(1)} Hz`}
              </span>
            </div>
          </div>
          <div className="piano-mixer">
            <span>Grand Piano</span>
            <label>
              {text(["Volume", "Гучність", "Громкость"])}
              <input
                aria-label={text(["Volume", "Гучність", "Громкость"])}
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
              />
            </label>
            <button
              className="piano-sustain"
              aria-pressed={sustain}
              onClick={() => setSustain(!sustain)}
            >
              Sustain <span>{sustain ? "ON" : "OFF"}</span>
            </button>
          </div>
        </div>
        <div className="piano-selectors">
          <label>
            {text(["Tonic", "Тоніка", "Тоника"])}
            <Select
              aria-label={text(["Tonic", "Тоніка", "Тоника"])}
              value={tonic}
              onValueChange={(v) => change(() => setTonic(Number(v)))}
            >
              {Array.from({ length: 12 }, (_, i) => (
                <SelectOption key={i} value={i}>
                  {noteName(60 + i).replace(/\d/g, "")}
                </SelectOption>
              ))}
            </Select>
          </label>
          <label>
            {text(["Scale", "Лад", "Лад"])}
            <Select
              aria-label={text(["Scale", "Лад", "Лад"])}
              value={mode}
              onValueChange={(v) => change(() => setMode(v))}
            >
              {PIANO_MODES.map((s) => (
                <SelectOption key={s.id} value={s.id}>
                  {text(s.name)}
                </SelectOption>
              ))}
            </Select>
          </label>
          <span>
            {text([
              "Only notes in the selected scale are active",
              "Активні лише ноти обраного ладу",
              "Активны только ноты выбранного лада",
            ])}
          </span>
        </div>
        <div className="piano-scroll">
          <div
            className="piano-keys"
            aria-label={text([
              "Piano keys",
              "Клавіші піаніно",
              "Клавиши пианино",
            ])}
          >
            {allNotes.map((midi) => {
              const isBlack = black(midi);
              const position = isBlack ? whiteIndex - 0.32 : whiteIndex++;
              const code = [...mapping].find(([, n]) => n === midi)?.[0];
              return (
                <button
                  key={midi}
                  className={`piano-key ${isBlack ? "black" : "white"} ${active.has(midi) ? "pressed" : ""}`}
                  style={{ left: `${(position / 29) * 100}%` }}
                  disabled={!allowed.has(midi)}
                  aria-label={noteName(midi)}
                  aria-pressed={active.has(midi)}
                  {...pointers(midi)}
                >
                  <span>
                    {code && <small>{keyLabel(code)}</small>}
                    {noteName(midi)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      {error && (
        <p role="alert" className="piano-error">
          {text([
            "Could not load the sound. Check your connection and press the key again.",
            "Не вдалося завантажити звук. Перевір з’єднання та натисни клавішу ще раз.",
            "Не удалось загрузить звук. Проверь соединение и нажми клавишу ещё раз.",
          ])}
        </p>
      )}
      <div className="piano-keyboard-heading">
        <h2>{text(["Your keyboard", "Твоя клавіатура", "Твоя клавиатура"])}</h2>
        <span>
          {text([
            "Low notes: Z → / · higher notes: A → Q → 1",
            "Низькі ноти: Z → / · вище: A → Q → 1",
            "Низкие ноты: Z → / · выше: A → Q → 1",
          ])}
        </span>
      </div>
      <div className="piano-computer">
        {[...KEY_ROWS].reverse().map((row, index) => (
          <div className="piano-key-row" key={index}>
            {row.map((code) => {
              const midi = mapping.get(code);
              return (
                <button
                  key={code}
                  className={`piano-keycap ${midi !== undefined && active.has(midi) ? "pressed" : ""}`}
                  disabled={midi === undefined}
                  aria-label={`${keyLabel(code)}${midi === undefined ? "" : `: ${noteName(midi)}`}`}
                  {...(midi === undefined ? {} : pointers(midi))}
                >
                  <strong>{keyLabel(code)}</strong>
                  <span>{midi === undefined ? "—" : noteName(midi)}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <p className="ear-note piano-footnote">
        {text([
          "Click, touch or use your keyboard in any language. Hold several keys for chords. Unassigned keys are outside the available range; all active piano keys remain playable with the mouse. Sounds load on first use.",
          "Грай мишею, дотиком або клавіатурою з будь-якою розкладкою. Затискай кілька клавіш для акордів. Непризначені клавіші поза доступним діапазоном; усі активні клавіші піаніно доступні мишею. Звуки завантажуються під час першої гри.",
          "Играй мышью, касанием или клавиатурой с любой раскладкой. Зажимай несколько клавиш для аккордов. Неназначенные клавиши вне доступного диапазона; все активные клавиши пианино доступны мышью. Звуки загружаются при первой игре.",
        ])}
      </p>
    </section>
  );
}
