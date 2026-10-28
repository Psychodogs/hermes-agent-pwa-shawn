"use client";

import { IconCross } from "@/components/primitives/icons";

/* Hand-rolled rather than shadcn's Sonner wrapper: the token layer here is
 * beautifului.dev's, and shadcn init would lay its own --background/--foreground
 * set over the top. One toast at a time is all this app needs. */

export function Toast({
  message,
  tone = "neutral",
  action,
  onDismiss,
}: {
  message: string;
  tone?: "neutral" | "error";
  action?: { label: string; onClick: () => void };
  onDismiss?: () => void;
}) {
  return (
    <div
      role="status"
      className={`pointer-events-auto flex h-11 items-center gap-2.5 rounded-full bg-surface pl-4 shadow-overlay ${
        action || onDismiss ? "pr-1.5" : "pr-4"
      }`}
      style={{ animation: "toast-in var(--duration-fast) var(--ease-out-strong) both" }}
    >
      {tone === "error" && <span className="size-2 shrink-0 rounded-full bg-red" />}
      <span className="min-w-0 flex-1 truncate text-ui text-ink">{message}</span>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="h-8 shrink-0 rounded-full px-3 text-ui font-medium text-ink
            transition-[transform,background-color] duration-150 hover:bg-hover active:scale-[0.97]"
        >
          {action.label}
        </button>
      )}
      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-ink-2
            transition-[transform,background-color,color] duration-150 hover:bg-hover
            hover:text-ink active:scale-[0.97]"
        >
          <IconCross size={14} />
        </button>
      )}
    </div>
  );
}
