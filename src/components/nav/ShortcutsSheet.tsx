"use client";

import { Sheet } from "@/components/ui/Sheet";
import { IconCross } from "@/components/primitives/icons";
import { keyLabels } from "@/hooks/useShortcuts";

/* The cheatsheet behind `?`. Listed by what they do, not grouped by owner —
 * the reader doesn't care which component carries a shortcut out. */

export function ShortcutsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  // keyLabels() reads navigator, so nothing renders until it is opened
  if (!open) return null;
  const { mod, shift, alt } = keyLabels();
  const rows: [string, string][] = [
    [`${mod}K`, "Search projects and chats"],
    [`${mod}${shift}O`, "New chat in this project"],
    [`${mod}/`, "Focus the message box"],
    [`${mod}.`, "Stop the run"],
    [`${alt}↑ / ${alt}↓`, "Previous / next chat"],
    ["↑", "Recall your last prompt (empty box)"],
    ["Enter", "Send · Shift+Enter for a new line"],
    ["?", "This list"],
  ];

  return (
    <Sheet open={open} onClose={onClose} label="Keyboard shortcuts">
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <span className="text-ui font-medium text-ink">Keyboard shortcuts</span>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="primitive-icon-button flex items-center justify-center text-ink-3 hover:bg-hover-2 hover:text-ink"
        >
          <IconCross size={14} />
        </button>
      </div>
      <dl className="flex flex-col px-3 pb-3">
        {rows.map(([keys, action]) => (
          <div
            key={keys}
            className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-b-0"
          >
            <dt className="text-label text-ink-2">{action}</dt>
            <dd>
              <kbd className="rounded-chip bg-field px-1.5 py-0.5 font-mono text-meta text-ink shadow-hairline">
                {keys}
              </kbd>
            </dd>
          </div>
        ))}
      </dl>
    </Sheet>
  );
}
