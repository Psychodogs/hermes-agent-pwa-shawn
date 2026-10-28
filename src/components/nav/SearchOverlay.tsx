"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useKeyboardMod } from "@/hooks/useShortcuts";
import { IconCross, IconMessage, IconSearch } from "@/components/primitives/icons";

/* Cross-project search. Full-screen rather than a dropdown: on a phone the
 * results list is the whole job, and a popover anchored to a 36px header
 * button would be a 3-line window onto it. */

interface ProjectHit {
  id: string;
  name: string;
  emoji: string | null;
  snippet: string | null;
}

interface MessageHit {
  projectId: string;
  projectName: string;
  projectEmoji: string | null;
  sessionId: string;
  runId: string;
  preview: string;
  startedAt: number;
}

interface DeliveryHit {
  id: string;
  projectId: string;
  projectName: string;
  projectEmoji: string | null;
  sessionId: string;
  jobName: string;
  snippet: string;
  ts: number;
}

interface Results {
  projects: ProjectHit[];
  messages: MessageHit[];
  deliveries: DeliveryHit[];
}

const EMPTY: Results = { projects: [], messages: [], deliveries: [] };

export function SearchOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;
  // Mounting only while open is what clears the last query — the same trick
  // NewProjectDialog uses to reset its form.
  return <SearchPanel onClose={onClose} />;
}

function SearchPanel({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Results>(EMPTY);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const hasKeyboard = useKeyboardMod() !== null;

  const trimmed = query.trim();
  // Two characters is the floor the route enforces too; below it there is
  // nothing to show and nothing to fetch, so both are derived rather than
  // pushed back into state from an effect.
  const active = trimmed.length >= 2;
  const shown = active ? results : EMPTY;
  const loading = active && pending;

  useEffect(() => {
    // iOS won't focus without a frame of delay after the mount
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const t = setTimeout(async () => {
      setPending(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        setResults((await res.json()) as Results);
      } catch {
        // aborted by the next keystroke, or the route failed — either way the
        // previous results stay on screen rather than flashing empty
      } finally {
        setPending(false);
      }
    }, 180);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [trimmed, active]);

  const empty =
    active && !loading && shown.projects.length === 0 && shown.messages.length === 0;

  /* Enter opens the top hit, which is what makes ⌘K a project switcher:
   * two letters of a project name and Return. Arrow keys walk the rows. */
  const firstHref = shown.projects[0]
    ? `/p/${shown.projects[0].id}`
    : shown.messages[0]
      ? `/p/${shown.messages[0].projectId}/s/${shown.messages[0].sessionId}`
      : shown.deliveries[0]
        ? `/p/${shown.deliveries[0].projectId}/s/${shown.deliveries[0].sessionId}`
        : null;

  const rows = () => Array.from(listRef.current?.querySelectorAll<HTMLElement>("a") ?? []);
  const onListKey = (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const all = rows();
    const at = all.indexOf(document.activeElement as HTMLElement);
    event.preventDefault();
    if (event.key === "ArrowUp" && at <= 0) {
      inputRef.current?.focus();
      return;
    }
    all[Math.min(all.length - 1, at + (event.key === "ArrowDown" ? 1 : -1))]?.focus();
  };

  return (
    <div className="h-app fixed inset-x-0 top-0 z-60 flex flex-col sm:items-center sm:px-4 sm:pt-[12vh]">
      {/* Phone: the panel is the whole screen and covers this. Above sm it is a
          palette floating over the page, and a tap outside it dismisses. */}
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-scrim"
        style={{ animation: "fade-in var(--duration-quick) ease-out both" }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-page
          [animation:fade-in_var(--duration-quick)_ease-out_both] sm:max-h-[min(34rem,calc(var(--app-height,100dvh)-12vh-2rem))]
          sm:max-w-xl sm:flex-none sm:rounded-popover sm:bg-surface sm:shadow-overlay
          sm:[animation:pop-in_var(--duration-quick)_var(--ease-out-strong)_both]"
      >
      <div className="pt-safe shrink-0 border-b border-line">
        <div className="px-safe flex h-12 items-center gap-2.5">
          <span className="shrink-0 text-ink-3">
            <IconSearch size={18} />
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing && firstHref) {
                event.preventDefault();
                router.push(firstHref);
                onClose();
              } else if (event.key === "ArrowDown") {
                event.preventDefault();
                rows()[0]?.focus();
              }
            }}
            type="search"
            placeholder="Search projects and prompts…"
            aria-label="Search"
            className="h-12 min-w-0 flex-1 bg-transparent text-input text-ink outline-none
              placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="tap-target -mr-1.5 flex size-9 shrink-0 items-center justify-center rounded-control
              text-ink-2 transition-[transform,background-color,color] duration-150 hover:bg-hover
              hover:text-ink active:scale-[0.97]"
          >
            <IconCross size={16} />
          </button>
        </div>
      </div>

      <div
        ref={listRef}
        onKeyDown={onListKey}
        className="scroll-area min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        <div className="px-safe pb-safe w-full pt-1.5">
          {!active && (
            <p className="py-10 text-center text-label text-ink-3">
              Type at least two characters.
            </p>
          )}

          {empty && (
            <p className="py-10 text-center text-label text-ink-3">
              Nothing matched “{trimmed}”.
            </p>
          )}

          {shown.projects.length > 0 && (
            <Section label="Projects">
              {shown.projects.map((hit, i) => (
                <Row
                  key={hit.id}
                  enterHint={hasKeyboard && i === 0}
                  href={`/p/${hit.id}`}
                  onNavigate={onClose}
                  glyph={hit.emoji ?? hit.name.trim().charAt(0).toUpperCase() ?? "•"}
                  title={hit.name}
                  detail={hit.snippet}
                />
              ))}
            </Section>
          )}

          {shown.messages.length > 0 && (
            <Section label="Prompts">
              {shown.messages.map((hit, i) => (
                <Row
                  key={hit.runId}
                  enterHint={hasKeyboard && i === 0 && shown.projects.length === 0}
                  href={`/p/${hit.projectId}/s/${hit.sessionId}`}
                  onNavigate={onClose}
                  icon={<IconMessage size={16} />}
                  title={hit.preview}
                  detail={`${hit.projectEmoji ? `${hit.projectEmoji} ` : ""}${
                    hit.projectName
                  } · ${new Date(hit.startedAt).toLocaleDateString()}`}
                />
              ))}
            </Section>
          )}

          {shown.deliveries.length > 0 && (
            <Section label="Scheduled">
              {shown.deliveries.map((hit, i) => (
                <Row
                  key={hit.id}
                  enterHint={
                    hasKeyboard &&
                    i === 0 &&
                    shown.projects.length === 0 &&
                    shown.messages.length === 0
                  }
                  href={`/p/${hit.projectId}/s/${hit.sessionId}`}
                  onNavigate={onClose}
                  icon={<IconMessage size={16} />}
                  title={hit.snippet}
                  detail={`${hit.jobName} · ${
                    hit.projectEmoji ? `${hit.projectEmoji} ` : ""
                  }${hit.projectName} · ${new Date(hit.ts).toLocaleDateString()}`}
                />
              ))}
            </Section>
          )}

          {/* Says what was searched, so an absent result isn't read as an
              absent message. Transcript bodies are not indexed — a scheduled
              job's report is, because that copy is ours. */}
          {(shown.projects.length > 0 ||
            shown.messages.length > 0 ||
            shown.deliveries.length > 0) && (
            <p className="pt-2 pb-4 text-label text-ink-3">
              Project names, instructions, the opening prompt of each run, and
              what scheduled jobs reported. Message bodies live in Hermes and
              aren’t searchable.
            </p>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="pb-1" style={{ animation: "fade-up var(--duration-fast) var(--ease-out-strong) both" }}>
      <h2 className="pt-2.5 pb-1 text-label text-ink-3">{label}</h2>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function Row({
  href,
  onNavigate,
  glyph,
  icon,
  title,
  detail,
  enterHint = false,
}: {
  /** this row is what Return in the search field opens */
  enterHint?: boolean;
  href: string;
  onNavigate: () => void;
  glyph?: string;
  icon?: React.ReactNode;
  title: string;
  detail?: string | null;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="-mx-2.5 flex min-h-12 items-center gap-3 rounded-control px-2.5 py-1.5
        transition-[transform,background-color] duration-150 hover:bg-hover focus-visible:bg-hover
        focus-visible:outline-none active:scale-[0.99]"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-chip bg-field text-ink-2">
        {icon ?? <span className="text-ui leading-none">{glyph}</span>}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-ui text-ink">{title}</span>
        {detail && <span className="truncate text-label text-ink-3">{detail}</span>}
      </span>
      {enterHint && (
        <kbd className="shrink-0 rounded-chip bg-field px-1.5 py-0.5 font-sans text-meta text-ink-3">
          ↵
        </kbd>
      )}
    </Link>
  );
}
