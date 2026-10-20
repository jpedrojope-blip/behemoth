"use client";

import * as React from "react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

type SelectOption = {
  value: string;
  label: React.ReactNode;
  disabled: boolean;
};

type AppSelectChangeEvent = { target: { value: string } };

type AppSelectProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "defaultValue" | "name" | "onChange" | "type" | "value"
> & {
  children?: React.ReactNode;
  defaultValue?: string;
  name?: string;
  onChange?: (event: AppSelectChangeEvent) => void;
  required?: boolean;
  value?: string;
};

function readOptions(children: React.ReactNode): SelectOption[] {
  return React.Children.toArray(children).flatMap((child) => {
    if (!React.isValidElement<React.OptionHTMLAttributes<HTMLOptionElement>>(child) || child.type !== "option") {
      return [];
    }

    const label = child.props.label ?? child.props.children;
    const value = child.props.value ?? (typeof label === "string" ? label : "");
    return [{ value: String(value), label, disabled: Boolean(child.props.disabled) }];
  });
}

function getMenuPosition(rect: DOMRect, menu: HTMLDivElement | null, optionCount: number): React.CSSProperties {
  const width = Math.min(Math.max(rect.width, 220), window.innerWidth - 24);
  const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
  const contentHeight = Math.min(menu?.scrollHeight ?? 16 + optionCount * 44 + Math.max(0, optionCount - 1) * 6, 320);
  const roomBelow = Math.max(0, window.innerHeight - rect.bottom - 12);
  const roomAbove = Math.max(0, rect.top - 12);
  const openAbove = contentHeight > roomBelow && roomAbove > roomBelow;
  const availableHeight = openAbove ? roomAbove : roomBelow;
  const maxHeight = Math.min(320, availableHeight);
  const visibleHeight = Math.min(contentHeight, maxHeight);
  const top = openAbove
    ? Math.max(12, rect.top - visibleHeight - 8)
    : Math.min(rect.bottom + 8, window.innerHeight - visibleHeight - 12);

  return { position: "fixed", top, left, width, maxHeight, zIndex: 1600 };
}

function sameMenuPosition(current: React.CSSProperties | null, next: React.CSSProperties): boolean {
  return current !== null
    && Math.abs(Number(current.top) - Number(next.top)) < 1
    && Math.abs(Number(current.left) - Number(next.left)) < 1
    && Math.abs(Number(current.width) - Number(next.width)) < 1
    && Math.abs(Number(current.maxHeight) - Number(next.maxHeight)) < 1;
}

export function AppSelect({
  children,
  className = "",
  defaultValue,
  disabled = false,
  name,
  onChange,
  required = false,
  value,
  ...buttonProps
}: AppSelectProps) {
  const options = useMemo(() => readOptions(children), [children]);
  const selectId = useId().replace(/:/g, "");
  const triggerId = buttonProps.id ?? `app-select-trigger-${selectId}`;
  const listboxId = `app-select-listbox-${selectId}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [localValue, setLocalValue] = useState(defaultValue ?? options[0]?.value ?? "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties | null>(null);
  const selectedValue = value ?? localValue;
  const selectedOption = options.find((option) => option.value === selectedValue) ?? options[0];

  function firstEnabledIndex(direction = 1) {
    const start = options.findIndex((option) => option.value === selectedValue && !option.disabled);
    if (start >= 0) return start;
    if (direction > 0) return options.findIndex((option) => !option.disabled);
    for (let index = options.length - 1; index >= 0; index -= 1) {
      if (!options[index].disabled) return index;
    }
    return -1;
  }

  function openMenu(direction = 1) {
    const initialIndex = firstEnabledIndex(direction);
    setActiveIndex(Math.max(0, initialIndex));
    setOpen(true);
  }

  function focusOption(index: number, direction = 1) {
    if (!options.length) return;
    let nextIndex = (index + options.length) % options.length;
    for (let attempt = 0; attempt < options.length && options[nextIndex]?.disabled; attempt += 1) {
      nextIndex = (nextIndex + direction + options.length) % options.length;
    }
    setActiveIndex(nextIndex);
    optionRefs.current[nextIndex]?.focus();
  }

  function chooseOption(option: SelectOption) {
    if (option.disabled) return;
    if (value === undefined) setLocalValue(option.value);
    if (option.value !== selectedValue) onChange?.({ target: { value: option.value } });
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function moveFocusOutsideMenu(backward: boolean) {
    const focusable = Array.from(document.querySelectorAll<HTMLElement>(
      'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    )).filter((element) => element.getClientRects().length > 0);
    const triggerIndex = triggerRef.current ? focusable.indexOf(triggerRef.current) : -1;
    const next = focusable[triggerIndex + (backward ? -1 : 1)];
    setOpen(false);
    next?.focus();
  }

  useLayoutEffect(() => {
    if (!open || !menuStyle) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const next = getMenuPosition(rect, menuRef.current, options.length);
    setMenuStyle((current) => sameMenuPosition(current, next) ? current : next);
  }, [menuStyle, open, options.length]);

  useEffect(() => {
    if (!open) return;

    const updateMenuPosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const next = getMenuPosition(rect, menuRef.current, options.length);
      setMenuStyle((current) => sameMenuPosition(current, next) ? current : next);
    };

    updateMenuPosition();
    const focusFrame = window.requestAnimationFrame(() => optionRefs.current[activeIndex]?.focus());
    const closeOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (!rootRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [activeIndex, open, options.length]);

  return (
    <div className="app-select" ref={rootRef}>
      <button
        {...buttonProps}
        id={triggerId}
        ref={triggerRef}
        type="button"
        className={`app-select-trigger ${className}`.trim()}
        role="combobox"
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-expanded={open}
        aria-required={required || undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={(event) => {
          buttonProps.onKeyDown?.(event);
          if (event.defaultPrevented) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openMenu(event.key === "ArrowUp" ? -1 : 1);
          }
        }}
      >
        <span className="app-select-value">{selectedOption?.label ?? "Selecione uma opção"}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {(name || required) && (
        <select
          className="app-select-native"
          aria-hidden="true"
          tabIndex={-1}
          name={name}
          value={selectedValue}
          required={required}
          disabled={disabled}
          onChange={() => undefined}
          onInvalid={(event) => {
            event.preventDefault();
            openMenu();
            window.requestAnimationFrame(() => triggerRef.current?.focus());
          }}
        >
          {options.map((option, index) => (
            <option key={`${option.value}-${index}`} value={option.value} disabled={option.disabled}>{option.label}</option>
          ))}
        </select>
      )}
      {open && menuStyle && typeof document !== "undefined" && createPortal(
        <div className="app-select-menu" ref={menuRef} style={menuStyle}>
          <div
            id={listboxId}
            className="app-select-options"
            role="listbox"
            aria-label={buttonProps["aria-label"]}
            aria-labelledby={buttonProps["aria-label"] ? undefined : triggerId}
          >
            {!options.length && <p className="app-select-empty">Sem opções disponíveis.</p>}
            {options.map((option, index) => (
              <button
                key={`${option.value}-${index}`}
                ref={(element) => { optionRefs.current[index] = element; }}
                type="button"
                role="option"
                aria-selected={option.value === selectedValue}
                aria-disabled={option.disabled || undefined}
                disabled={option.disabled}
                tabIndex={-1}
                className={`app-select-option ${option.value === selectedValue ? "selected" : ""}`}
                onClick={() => chooseOption(option)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    focusOption(index + 1, 1);
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    focusOption(index - 1, -1);
                  } else if (event.key === "Home") {
                    event.preventDefault();
                    focusOption(0, 1);
                  } else if (event.key === "End") {
                    event.preventDefault();
                    focusOption(options.length - 1, -1);
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    setOpen(false);
                    triggerRef.current?.focus();
                  } else if (event.key === "Tab") {
                    event.preventDefault();
                    moveFocusOutsideMenu(event.shiftKey);
                  }
                }}
              >
                <span className="app-select-option-label">{option.label}</span>
                {option.value === selectedValue && <Check size={15} aria-hidden="true" />}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
