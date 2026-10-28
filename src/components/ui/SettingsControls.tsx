"use client";

import type { ReactNode } from "react";

/* The three shapes /settings needs, so each section is a list of data rather
 * than a list of hand-built divs. Nothing here is generic beyond that — apart
 * from the button and field recipes at the top, which the dialogs and sheets
 * borrow so that every pressable and every input in the app is one shape. */

type ButtonKind = "primary" | "secondary" | "secondary-danger" | "danger" | "ghost" | "ghost-danger";

const BUTTON_BASE =
  "inline-flex shrink-0 items-center justify-center rounded-full text-ui font-medium whitespace-nowrap transition-[transform,background-color,color,opacity] duration-150 enabled:active:scale-[0.97] disabled:opacity-40";

const BUTTON_KIND: Record<ButtonKind, string> = {
  primary: "bg-ink text-page enabled:hover:opacity-90",
  secondary: "text-ink shadow-btn enabled:hover:bg-hover",
  "secondary-danger": "text-red shadow-btn enabled:hover:bg-hover",
  danger: "bg-red text-white enabled:hover:opacity-90",
  ghost: "text-ink-2 enabled:hover:bg-hover enabled:hover:text-ink",
  "ghost-danger": "text-red enabled:hover:bg-hover",
};

/** Pill buttons. `md` is the dialog footer (40px), `sm` sits inside rows and cards. */
export function buttonClass(kind: ButtonKind, size: "md" | "sm" = "md"): string {
  return `${BUTTON_BASE} ${size === "md" ? "h-10 px-4" : "h-9 px-3.5"} ${BUTTON_KIND[kind]}`;
}

/** A 36px ghost icon button — the close button in every dialog and sheet header. */
export const ICON_BUTTON =
  "tap-target flex size-9 shrink-0 items-center justify-center rounded-control text-ink-2 transition-[transform,background-color,color] duration-150 hover:bg-hover hover:text-ink active:scale-[0.97]";

/** Text inputs and selects. 16px, so iOS never zooms on focus. */
export const FIELD_CLASS =
  "h-10 w-full rounded-control bg-transparent px-3 text-input text-ink shadow-[inset_0_0_0_1px_var(--line-strong)] outline-none transition-shadow duration-150 placeholder:text-ink-3 focus:shadow-[inset_0_0_0_1px_var(--ink-3)]";

export const TEXTAREA_CLASS =
  "w-full resize-y rounded-control bg-transparent px-3 py-2.5 text-input leading-relaxed text-ink shadow-[inset_0_0_0_1px_var(--line-strong)] outline-none transition-shadow duration-150 placeholder:text-ink-3 focus:shadow-[inset_0_0_0_1px_var(--ink-3)]";

/** The label above a field. */
export const LABEL_CLASS = "block text-label font-medium text-ink-2";

/** Supporting copy under a label. */
export const HELP_CLASS = "text-label leading-snug text-ink-3";

export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section
      className="mt-9 first:mt-4"
      style={{ animation: "fade-up var(--duration-medium) var(--ease-out-strong) both" }}
    >
      <h2 className="text-ui font-semibold text-ink">{title}</h2>
      {description && (
        <p className="mt-1 text-label leading-snug text-ink-3">{description}</p>
      )}
      <div className="mt-1 divide-y divide-line">{children}</div>
    </section>
  );
}

/** A labelled row. Rows stack inside a section and hairline between themselves. */
export function SettingsRow({
  label,
  hint,
  control,
  stacked = false,
}: {
  label: string;
  hint?: string;
  control: ReactNode;
  /** put the control on its own line on a phone — segmented controls need the width */
  stacked?: boolean;
}) {
  return (
    <div
      className={`flex gap-3 py-3.5 ${
        stacked ? "flex-col sm:flex-row sm:items-center sm:gap-6" : "items-center gap-6"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="text-ui text-ink">{label}</div>
        {hint && <p className="mt-0.5 text-label leading-snug text-ink-3">{hint}</p>}
      </div>
      <div className={stacked ? "w-full sm:w-72 sm:shrink-0" : "shrink-0"}>{control}</div>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex w-full gap-0.5 rounded-full bg-field p-0.5"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`h-8 min-w-0 flex-1 truncate rounded-full px-2 text-label
              transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.97] ${
                active
                  ? // raised in both themes: white on the light track, a lighter
                    // grey on the dark one (the page grey there read as a hole)
                    "bg-page font-medium text-ink shadow-btn dark:bg-hover-2"
                  : "text-ink-2 hover:text-ink"
              }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`tap-target relative block h-[26px] w-11 shrink-0 rounded-full
        transition-colors duration-200 disabled:opacity-40 ${checked ? "bg-ink" : "bg-line-strong"}`}
    >
      {/* The knob is --page against an ink track and --ink-3 against a field
          one: --ink is near-white in dark and near-black in light, so a fixed
          white knob was white on white. Only the transform animates. */}
      <span
        className={`absolute top-0.5 left-0.5 size-[22px] rounded-full
          transition-[transform,background-color] duration-200 ${
            // off is a white knob on a grey track, the platform's own reading;
            // a dark knob on a light track looked switched on
            checked ? "translate-x-[18px] bg-page" : "translate-x-0 bg-white shadow-[0_1px_3px_oklch(0%_0_0/0.3)]"
          }`}
        style={{ transitionTimingFunction: "var(--ease-out-strong)" }}
      />
    </button>
  );
}

/** A plain action row — the button *is* the row. */
export function SettingsAction({
  label,
  hint,
  actionLabel,
  onAction,
  tone = "default",
  disabled = false,
}: {
  label: string;
  hint?: string;
  actionLabel: string;
  onAction: () => void;
  tone?: "default" | "danger";
  disabled?: boolean;
}) {
  return (
    <SettingsRow
      label={label}
      hint={hint}
      control={
        <button
          type="button"
          onClick={onAction}
          disabled={disabled}
          className={buttonClass(tone === "danger" ? "secondary-danger" : "secondary", "sm")}
        >
          {actionLabel}
        </button>
      }
    />
  );
}
