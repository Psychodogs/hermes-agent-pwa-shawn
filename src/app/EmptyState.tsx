"use client";

import { useState } from "react";
import { NewProjectDialog } from "@/components/nav/NewProjectDialog";
import { IconPlus, IconSparkle } from "@/components/primitives/icons";

export function EmptyState() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-surface text-ink-2 shadow-card">
        <IconSparkle size={20} />
      </span>
      <div className="flex flex-col gap-2">
        <h2 className="text-[24px] leading-tight font-semibold text-balance text-ink">No projects yet</h2>
        <span className="max-w-sm text-ui text-balance text-ink-2">
          A project is one durable thread — same conversation next week, next
          month. Start with the thing you keep coming back to.
        </span>
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-ui font-medium text-page
          transition-transform duration-150 active:scale-[0.97]"
      >
        <IconPlus size={16} />
        New project
      </button>

      <NewProjectDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
