"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

/* Desktop keyboard shortcuts.
 *
 * Each owner registers the bindings it can carry out — the shell has search
 * and new chat, the thread has stop, the composer has focus — rather than one
 * global table reaching into components it doesn't own.
 *
 * Two rules keep these from fighting with typing:
 *  - A binding without a modifier never fires while an editable element has
 *    focus, so `?` in the composer is still a question mark.
 *  - Nothing fires while a modal dialog or menu is open. Those own the
 *    keyboard, and Escape in particular is already theirs — which is why stop
 *    is ⌘. and not Esc. */

export interface Shortcut {
  /** compared case-insensitively against KeyboardEvent.key */
  key: string;
  /** ⌘ on macOS, Ctrl elsewhere */
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
  run: () => void;
  /** skip without consuming the key, so the browser keeps its default */
  when?: boolean;
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

function overlayOpen(): boolean {
  return document.querySelector('[role="dialog"], [aria-modal="true"], [role="menu"]') !== null;
}

export function useShortcuts(bindings: Shortcut[]) {
  // Read through a ref so callers can pass a fresh array every render without
  // re-subscribing the listener each time.
  const ref = useRef(bindings);
  useEffect(() => {
    ref.current = bindings;
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const mod = event.metaKey || event.ctrlKey;
      for (const binding of ref.current) {
        if (binding.when === false) continue;
        if (event.key.toLowerCase() !== binding.key.toLowerCase()) continue;
        if (Boolean(binding.mod) !== mod) continue;
        if (Boolean(binding.alt) !== event.altKey) continue;
        // `?` is shift+/ on most layouts; only check shift when it was asked for
        if (binding.shift && !event.shiftKey) continue;
        if (!binding.mod && !binding.alt && isEditable(event.target)) continue;
        if (overlayOpen()) continue;
        event.preventDefault();
        binding.run();
        return;
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
}

function isApple(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.platform);
}

/** "⌘" on Apple platforms, "Ctrl+" elsewhere. Client-only — call after mount. */
export function modLabel(): string {
  return isApple() ? "⌘" : "Ctrl+";
}

/** Modifier glyphs as the platform writes them. Client-only. */
export function keyLabels(): { mod: string; shift: string; alt: string } {
  return isApple()
    ? { mod: "⌘", shift: "⇧", alt: "⌥" }
    : { mod: "Ctrl+", shift: "Shift+", alt: "Alt+" };
}

const FINE_POINTER = "(hover: hover) and (pointer: fine)";

/**
 * The modifier label where there is probably a keyboard, else null. A fine
 * pointer is the closest proxy the platform offers; on a phone, shortcut hints
 * are noise. Null on the server, so the first render matches.
 */
export function useKeyboardMod(): string | null {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(FINE_POINTER);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => (window.matchMedia(FINE_POINTER).matches ? modLabel() : null),
    () => null,
  );
}
