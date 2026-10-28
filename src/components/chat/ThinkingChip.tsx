"use client";

import { useEffect, useRef, useState } from "react";
import { effortLabel, type ReasoningEffort } from "@/lib/model-options";
import { IconSparkle } from "@/components/primitives/icons";

/* How hard the model reasons, next to the composer rather than three taps
 * deep in the model sheet. It is a per-turn decision — you raise it for the
 * hard question and drop it back — so it belongs where the turn is written.
 *
 * Distinct from Settings → Thinking trace, which only decides whether this
 * device renders the reasoning it gets back. This one decides whether there
 * is any: it writes model_options.reasoning, which rides on POST /v1/runs.
 *
 * Opens upward. The composer is pinned to the bottom of the viewport with the
 * keyboard under it, so the shared Menu primitive — which anchors below its
 * trigger — would open off-screen. */

const LEVELS: { value: ReasoningEffort | null; label: string; hint: string }[] = [
  { value: null, label: "Off", hint: "answer directly" },
  { value: "low", label: "Low", hint: "a little" },
  { value: "medium", label: "Medium", hint: "balanced" },
  { value: "high", label: "High", hint: "slower, costs more" },
];

export function ThinkingChip({
  effort,
  onChange,
  disabled = false,
}: {
  /** null when reasoning is off */
  effort: string | null;
  onChange: (next: ReasoningEffort | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // A phone has no blur to lean on, so dismissal is an outside tap plus
  // Escape — same contract as the Menu primitive, without its anchoring.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const on = effort !== null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Thinking: ${on ? effort : "off"}. Change it.`}
        onClick={() => setOpen((v) => !v)}
        className={`tap-target flex h-9 shrink-0 items-center gap-1.5 rounded-full px-2.5
          text-label transition-[color,background-color,transform] duration-150 enabled:hover:bg-hover
          enabled:hover:text-ink enabled:active:scale-[0.96] disabled:opacity-40 ${
            on ? "text-ink-2" : "text-ink-3"
          }`}
      >
        <IconSparkle size={15} className="shrink-0" />
        <span>{effortLabel(effort)}</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Thinking"
          // Anchored to the chip's left edge: the chip sits at the left of the
          // composer, so opening leftward ran off a phone's edge.
          className="absolute bottom-full left-0 z-50 mb-2 min-w-[220px] rounded-popover
            bg-surface p-1.5 shadow-overlay"
          style={{
            animation: "pop-in var(--duration-quick) var(--ease-out-strong) both",
            transformOrigin: "bottom left",
          }}
        >
          <p className="px-2.5 pt-1.5 pb-2 text-label leading-snug text-ink-3">
            How hard the model reasons before answering.
          </p>
          {LEVELS.map((level) => {
            const active = level.value === null ? !on : effort === level.value;
            return (
              <button
                key={level.label}
                type="button"
                role="menuitem"
                // Keep the composer's focus: on iOS a blur closes the keyboard
                // and the draft loses its caret.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(level.value);
                  setOpen(false);
                }}
                className={`flex h-9 w-full items-center gap-2.5 rounded-control px-2.5 text-left
                  text-ui transition-colors duration-150
                  hover:bg-hover active:scale-[0.98] ${
                    active ? "text-ink" : "text-ink-2"
                  }`}
              >
                <span className="flex size-3.5 shrink-0 items-center justify-center">
                  {active && <span className="size-1.5 rounded-full bg-ink" />}
                </span>
                <span className="flex-1">{level.label}</span>
                <span className="shrink-0 text-label text-ink-3">
                  {level.hint}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
