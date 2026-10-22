"use client";

import { useRunStatus } from "./RunStatusContext";

/* The at-a-glance signal that a run is live, once the thread has scrolled past
 * its own status line. Idle draws nothing: a grey dot that is always there is
 * a dot nobody looks at. Orange is the one hue it borrows, and only because
 * the run is blocked on the reader. */

export function RunDot({ className = "" }: { className?: string }) {
  const { phase } = useRunStatus();
  if (phase === "idle") return null;

  const label =
    phase === "waiting_for_approval"
      ? "Waiting for approval"
      : phase === "stopping"
        ? "Stopping"
        : "Running";

  return (
    <span
      role="status"
      aria-label={label}
      title={label}
      className={`size-2 shrink-0 rounded-full ${className}`}
      style={{
        background: phase === "waiting_for_approval" ? "var(--orange)" : "var(--ink-2)",
        animation: "pulse-dot 1.4s var(--ease-smooth-out) infinite",
      }}
    />
  );
}
