import type { ReactNode } from "react";

/* The full-screen fallback for a route that could not render — a missing
 * project or chat, or an error. Outside AppShell, so it carries its own way
 * out: the installed app has no browser Back button, and a screen without a
 * link is a dead end. Pure markup, so both the server-rendered not-found and
 * the client-side error boundary can use it. */
export function RecoveryScreen({
  title,
  body,
  detail,
  actions,
}: {
  title: string;
  body: string;
  /** small print under the body — an error digest, for matching server logs */
  detail?: string;
  actions: ReactNode;
}) {
  return (
    <main className="h-app pt-safe pb-safe px-safe flex flex-col items-center justify-center gap-4 bg-page text-center">
      {/* Readable and copyable: the shell suppresses selection on chrome, but
        * this is the one thing on screen worth quoting. */}
      <div data-selectable className="flex max-w-sm flex-col gap-2">
        <h1 className="text-[24px] leading-tight font-semibold text-balance text-ink">{title}</h1>
        <p className="text-ui text-balance text-ink-2">{body}</p>
        {detail && <p className="font-mono text-meta text-ink-3">{detail}</p>}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{actions}</div>
    </main>
  );
}

/* The two button shapes the fallback screens use, matching the app's pills. */
export const recoveryPrimary =
  "flex h-10 items-center rounded-full bg-ink px-4 text-ui font-medium text-page transition-transform duration-150 active:scale-[0.97]";
export const recoverySecondary =
  "flex h-10 items-center rounded-full px-4 text-ui font-medium text-ink shadow-btn transition-[background-color,transform] duration-150 hover:bg-hover active:scale-[0.97]";
