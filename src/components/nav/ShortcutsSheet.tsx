"use client";

import { Sheet } from "@/components/ui/Sheet";
import { IconCross } from "@/components/primitives/icons";
import { ICON_BUTTON } from "@/components/ui/SettingsControls";
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
      <div className="flex items-center justify-between gap-2 px-5 pt-5 pb-3">
        <span className="text-title font-semibold text-ink">Keyboard shortcuts</span>
        <button type="button" aria-label="Close" onClick={onClose} className={`${ICON_BUTTON} -mr-2`}>
          <IconCross size={16} />
        </button>
      </div>
      <dl className="flex flex-col px-5 pb-5">
        {rows.map(([keys, action]) => (
          <div
            key={keys}
            className="flex items-center justify-between gap-4 border-b border-line py-3 last:border-b-0"
          >
            <dt className="text-ui text-ink">{action}</dt>
            <dd className="shrink-0">
              <kbd className="rounded-chip bg-field px-2 py-1 font-mono text-meta text-ink-2 tabular-nums">
                {keys}
              </kbd>
            </dd>
          </div>
        ))}
      </dl>
    </Sheet>
  );
}
