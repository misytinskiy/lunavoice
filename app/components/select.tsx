"use client";

import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type OptionProps = {
  value: string | number;
  children: ReactNode;
  disabled?: boolean;
  lang?: string;
};
/** Declarative option data. Select renders the accessible listbox itself. */
export function SelectOption(_props: OptionProps) {
  void _props;
  return null;
}

type Props = {
  value: string | number;
  onValueChange: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
  "aria-label": string;
};
const plainText = (node: ReactNode): string =>
  Children.toArray(node)
    .map((child) =>
      typeof child === "string" || typeof child === "number"
        ? String(child)
        : isValidElement<{ children?: ReactNode }>(child)
          ? plainText(child.props.children)
          : "",
    )
    .join("");
function readOptions(children: ReactNode): OptionProps[] {
  const options: OptionProps[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement<OptionProps>(child)) return;
    if (child.type === Fragment)
      options.push(...readOptions(child.props.children));
    else if (child.type === SelectOption) options.push(child.props);
  });
  return options;
}
export function Select({
  value,
  onValueChange,
  children,
  disabled,
  id,
  className = "",
  "aria-label": label,
}: Props) {
  const options = readOptions(children);
  const selected = options.findIndex(
    (option) => String(option.value) === String(value),
  );
  const listId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const search = useRef({ text: "", time: 0 });
  const [open, setOpen] = useState(false);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState({
    top: 0,
    left: 0,
    width: 200,
    maxHeight: 280,
  });
  const expanded = open && !disabled;
  const enabled = options
    .map((option, index) => (option.disabled ? -1 : index))
    .filter((index) => index >= 0);
  function show(edge?: "first" | "last") {
    if (disabled || !enabled.length || !button.current) return;
    setHost(button.current.closest("dialog") ?? document.body);
    const rect = button.current.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 16;
    const above = rect.top - 16;
    const height = Math.min(280, options.length * 44 + 12);
    const upward = below < height && above > below;
    const maxHeight = Math.max(44, Math.min(height, upward ? above : below));
    const width = Math.min(Math.max(rect.width, 200), window.innerWidth - 24);
    setPosition({
      width,
      maxHeight,
      left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      top: upward ? rect.top - maxHeight - 6 : rect.bottom + 6,
    });
    setActive(
      edge === "first"
        ? enabled[0]
        : edge === "last"
          ? enabled.at(-1)!
          : enabled.includes(selected)
            ? selected
            : enabled[0],
    );
    setOpen(true);
  }
  function choose(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    setOpen(false);
    button.current?.focus();
    onValueChange(String(option.value));
  }
  useEffect(() => {
    if (!expanded) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!button.current?.contains(target) && !popup.current?.contains(target))
        setOpen(false);
    };
    const dismiss = (event: Event) => {
      if (event.target instanceof Node && popup.current?.contains(event.target))
        return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [expanded]);
  useEffect(() => {
    if (!expanded || !popup.current) return;
    const list = popup.current;
    const option = list.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (!option) return;
    const top = option.offsetTop;
    const bottom = top + option.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight)
      list.scrollTop = bottom - list.clientHeight;
  }, [active, expanded]);
  return (
    <>
      <button
        ref={button}
        id={id}
        type="button"
        role="combobox"
        aria-label={label}
        aria-expanded={expanded}
        aria-haspopup="listbox"
        aria-controls={expanded ? listId : undefined}
        aria-activedescendant={expanded ? `${listId}-${active}` : undefined}
        disabled={disabled || !enabled.length}
        className={`custom-select ${className}`}
        data-value={value}
        onBlur={() => setOpen(false)}
        onClick={() => (expanded ? setOpen(false) : show())}
        onKeyDown={(event) => {
          if (event.key === "Tab") {
            setOpen(false);
            return;
          }
          if (event.key === "Escape") {
            if (expanded) {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
            }
            return;
          }
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (expanded) choose(active);
            else show();
            return;
          }
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            if (!expanded) {
              show(
                event.key === "Home"
                  ? "first"
                  : event.key === "End"
                    ? "last"
                    : undefined,
              );
              return;
            }
            const current = enabled.indexOf(active);
            setActive(
              event.key === "Home"
                ? enabled[0]
                : event.key === "End"
                  ? enabled.at(-1)!
                  : enabled[
                      (current +
                        (event.key === "ArrowDown" ? 1 : -1) +
                        enabled.length) %
                        enabled.length
                    ],
            );
            return;
          }
          if (
            event.key.length === 1 &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.altKey
          ) {
            event.preventDefault();
            const now = Date.now();
            search.current.text =
              (now - search.current.time > 700 ? "" : search.current.text) +
              event.key.toLocaleLowerCase();
            search.current.time = now;
            const query = [...search.current.text].every(
              (char) => char === search.current.text[0],
            )
              ? search.current.text[0]
              : search.current.text;
            const start = expanded ? active : selected;
            const ordered = [
              ...enabled.filter((index) => index > start),
              ...enabled.filter((index) => index <= start),
            ];
            const match = ordered.find((index) =>
              plainText(options[index].children)
                .trim()
                .toLocaleLowerCase()
                .startsWith(query),
            );
            if (match !== undefined) {
              if (!expanded) show();
              setActive(match);
            }
          }
        }}
      >
        <span className="custom-select-value">
          {options[selected]?.children ?? "—"}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="m4 6 4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {expanded &&
        host &&
        createPortal(
          <div
            ref={popup}
            id={listId}
            role="listbox"
            aria-label={label}
            className="select-popup"
            style={position}
            onPointerDown={(event) => event.preventDefault()}
            onClick={(event) => event.stopPropagation()}
          >
            {options.map((option, index) => (
              <div
                key={String(option.value)}
                id={`${listId}-${index}`}
                data-index={index}
                data-value={String(option.value)}
                role="option"
                aria-selected={index === selected}
                aria-disabled={option.disabled || undefined}
                lang={option.lang}
                className={`select-option ${active === index ? "is-active" : ""}`}
                onPointerMove={(event) => {
                  if (event.pointerType === "mouse" && !option.disabled)
                    setActive(index);
                }}
                onClick={() => choose(index)}
              >
                <span>{option.children}</span>
                <span aria-hidden="true" className="select-check">
                  {index === selected ? "✓" : ""}
                </span>
              </div>
            ))}
          </div>,
          host,
          listId,
        )}
    </>
  );
}
