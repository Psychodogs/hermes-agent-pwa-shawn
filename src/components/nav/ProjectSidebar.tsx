"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconChevronRight,
  IconEdit,
  IconPin,
  IconPlus,
  IconSearch,
  IconSettings,
  IconTrash,
} from "@/components/primitives/icons";
import { Menu, MenuItem } from "@/components/ui/Menu";
import { RunDot } from "@/components/chat/RunDot";
import { useAppActions } from "@/components/AppActionsContext";
import { useShortcuts } from "@/hooks/useShortcuts";
import { APP_NAME } from "@/lib/branding";
import { ProjectSettingsSheet } from "./ProjectSettings";
import type { Project, ProjectSession } from "@/lib/chat-types";
import { sessionsRecentFirst } from "@/lib/session-order";

function SessionBranch({
  session,
  childrenByParent,
  activeSessionId,
  onSelect,
  onRename,
  onDelete,
  unreadScheduledCount,
  depth = 0,
}: {
  session: ProjectSession;
  childrenByParent: Map<string | null, ProjectSession[]>;
  activeSessionId?: string;
  onSelect: (session: ProjectSession) => void;
  /** resolves to an error message, or null on success */
  onRename: (session: ProjectSession, title: string) => Promise<string | null>;
  onDelete: (session: ProjectSession) => Promise<string | null>;
  unreadScheduledCount: number;
  depth?: number;
}) {
  const children = childrenByParent.get(session.session_id) ?? [];
  const active = session.session_id === activeSessionId;
  // The row itself turns into the rename field or the delete confirmation,
  // rather than a browser prompt() — which an installed app draws as a bare
  // system dialog, and which some browsers suppress altogether.
  const [mode, setMode] = useState<"idle" | "rename" | "delete">("idle");
  const [draft, setDraft] = useState(session.title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setMode("idle");
    setBusy(false);
    setError(null);
  }

  async function submitRename() {
    const title = draft.trim();
    if (!title || title === session.title) return reset();
    setBusy(true);
    setError(await onRename(session, title));
    setBusy(false);
    setMode((current) => (current === "rename" ? "idle" : current));
  }

  async function submitDelete() {
    setBusy(true);
    const failure = await onDelete(session);
    if (failure) {
      setError(failure);
      setBusy(false);
    }
  }

  return (
    <li>
      <div
        className={`flex min-h-9 w-full items-center rounded-control text-label transition-colors ${
          active ? "bg-hover text-ink" : "text-ink-2 hover:bg-hover-2 hover:text-ink"
        }`}
        style={{ paddingLeft: `${20 + depth * 16}px` }}
      >
        {mode === "rename" ? (
          <form
            className="flex min-w-0 flex-1 items-center gap-2 py-1 pr-1"
            onSubmit={(event) => {
              event.preventDefault();
              void submitRename();
            }}
          >
            <span aria-hidden className="text-ink-3">{depth > 0 ? "└" : "•"}</span>
            <input
              autoFocus
              onFocus={(event) => event.currentTarget.select()}
              value={draft}
              disabled={busy}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => void submitRename()}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setDraft(session.title);
                  reset();
                }
              }}
              aria-label="Chat title"
              className="h-7 min-w-0 flex-1 rounded-control border border-line-strong bg-field px-2
                text-label text-ink outline-none focus:border-ink-3"
            />
          </form>
        ) : (
          <button
            type="button"
            onClick={() => onSelect(session)}
            aria-current={active ? "page" : undefined}
            className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left"
          >
            <span aria-hidden className="text-ink-3">
              {session.kind === "scheduled" ? "◷" : depth > 0 ? "└" : "•"}
            </span>
            <span className="min-w-0 flex-1 truncate">{session.title}</span>
            {active && <RunDot />}
            {session.kind === "scheduled" && unreadScheduledCount > 0 && (
              <span className="rounded-chip bg-accent-tint px-1.5 text-meta text-ink">
                {unreadScheduledCount}
              </span>
            )}
          </button>
        )}
        {active && session.kind !== "scheduled" && mode === "idle" && (
          <Menu label={`Manage ${session.title}`} align="end" trigger={<span aria-hidden>···</span>}>
            {(close) => (
              <>
                <MenuItem
                  icon={<IconEdit size={14} />}
                  label="Rename"
                  onSelect={() => {
                    close();
                    setDraft(session.title);
                    setMode("rename");
                  }}
                />
                <MenuItem
                  icon={<IconTrash size={14} />}
                  label="Delete"
                  tone="danger"
                  onSelect={() => {
                    close();
                    setMode("delete");
                  }}
                />
              </>
            )}
          </Menu>
        )}
      </div>
      {mode === "delete" && (
        <div
          role="alertdialog"
          aria-label="Delete chat"
          className="mx-2 mt-1 mb-1.5 rounded-control border border-line bg-surface p-2.5"
          style={{ animation: "fade-in var(--duration-quick) ease-out both" }}
        >
          <p className="text-meta leading-snug text-ink-2">
            Delete this chat{children.length > 0 ? " and every branch below it" : ""}?
          </p>
          <div className="mt-2 flex justify-end gap-1.5">
            <button
              type="button"
              onClick={reset}
              className="h-7 rounded-control px-2.5 text-label font-medium text-ink-2 hover:bg-hover hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              autoFocus
              disabled={busy}
              onClick={() => void submitDelete()}
              className="h-7 rounded-control bg-red px-2.5 text-label font-medium text-white
                disabled:opacity-60"
            >
              {busy ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="mx-2 mb-1 px-1 text-meta text-red" role="alert">
          {error}
        </p>
      )}
      {children.length > 0 && (
        <ul>
          {children.map((child) => (
            <SessionBranch
              key={child.session_id}
              session={child}
              childrenByParent={childrenByParent}
              activeSessionId={activeSessionId}
              onSelect={onSelect}
              onRename={onRename}
              onDelete={onDelete}
              unreadScheduledCount={unreadScheduledCount}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function ProjectSidebar({
  projects,
  sessions,
  activeProjectId,
  activeSessionId,
  open,
  onClose,
  onNewProject,
}: {
  projects: Project[];
  sessions: ProjectSession[];
  activeProjectId?: string;
  activeSessionId?: string;
  open: boolean;
  onClose: () => void;
  onNewProject: () => void;
}) {
  const router = useRouter();
  const { openSearch } = useAppActions();
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(activeProjectId ? [activeProjectId] : []),
  );
  // Navigating into a project from anywhere else — search, a notification, a
  // shortcut — should open its branch here too, without collapsing the ones
  // the reader opened by hand. Adjusted during render, not in an effect, so
  // there is no frame where the active project is drawn shut.
  const [seenActive, setSeenActive] = useState(activeProjectId);
  if (activeProjectId !== seenActive) {
    setSeenActive(activeProjectId);
    if (activeProjectId && !expanded.has(activeProjectId)) {
      setExpanded(new Set(expanded).add(activeProjectId));
    }
  }
  const [editing, setEditing] = useState<Project | null>(null);
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  // A short list is faster to scan than to search.
  const showFilter = projects.length > 6;

  const sessionsByProject = useMemo(() => {
    const map = new Map<string, ProjectSession[]>();
    for (const session of sessions) {
      const rows = map.get(session.project_id) ?? [];
      rows.push(session);
      map.set(session.project_id, rows);
    }
    for (const [projectId, rows] of map) {
      map.set(projectId, sessionsRecentFirst(rows));
    }
    return map;
  }, [sessions]);

  // `/` jumps to the filter. Both copies of the sidebar can be mounted (the
  // permanent column and the drawer), so focus whichever one is on screen.
  useShortcuts([
    {
      key: "/",
      when: showFilter,
      run: () => {
        const fields = document.querySelectorAll<HTMLInputElement>("[data-sidebar-filter]");
        Array.from(fields).find((field) => field.offsetParent !== null)?.focus();
      },
    },
  ]);

  function select(session: ProjectSession) {
    // The URL contains the durable ID, so duplicate display titles can never
    // influence which conversation wins a navigation race. The mounted page
    // records the project's fallback after this local navigation succeeds.
    router.push(`/p/${session.project_id}/s/${session.session_id}`);
    onClose();
  }

  async function openProject(project: Project) {
    const response = await fetch(`/api/projects/${project.id}/open`, { method: "POST" });
    if (!response.ok) return;
    const body = (await response.json()) as { sessionId: string };
    router.push(`/p/${project.id}/s/${body.sessionId}`);
    onClose();
  }

  async function togglePin(project: Project) {
    const response = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: project.pinned !== 1 }),
    });
    if (response.ok) router.refresh();
  }

  async function rename(session: ProjectSession, title: string) {
    const response = await fetch(
      `/api/projects/${session.project_id}/sessions/${session.session_id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      },
    );
    if (!response.ok) return "The chat could not be renamed.";
    router.refresh();
    return null;
  }

  async function remove(session: ProjectSession) {
    const response = await fetch(
      `/api/projects/${session.project_id}/sessions/${session.session_id}`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      return body.error ?? "The chat could not be deleted.";
    }
    const body = (await response.json()) as { activeSessionId: string };
    router.replace(`/p/${session.project_id}/s/${body.activeSessionId}`);
    router.refresh();
    return null;
  }

  /* While filtering, the branch structure is dropped: a matching fork whose
   * parent doesn't match would otherwise be unreachable. A project whose own
   * name matches keeps all of its chats. */
  const visible = projects.flatMap((project) => {
    const projectSessions = sessionsByProject.get(project.id) ?? [];
    if (!needle) return [{ project, sessions: projectSessions, flat: false }];
    if (project.name.toLowerCase().includes(needle)) {
      return [{ project, sessions: projectSessions, flat: false }];
    }
    const hits = projectSessions.filter((s) => s.title.toLowerCase().includes(needle));
    return hits.length > 0 ? [{ project, sessions: hits, flat: true }] : [];
  });
  const anyPinned = visible.some(({ project }) => project.pinned === 1);

  const renderProject = ({
    project,
    sessions: projectSessions,
    flat,
  }: (typeof visible)[number]) => {
    const roots = flat
      ? projectSessions
      : projectSessions.filter((session) => !session.parent_session_id);
    const children = new Map<string | null, ProjectSession[]>();
    if (!flat) {
      for (const session of projectSessions) {
        const rows = children.get(session.parent_session_id) ?? [];
        rows.push(session);
        children.set(session.parent_session_id, rows);
      }
    }
    const isOpen = needle.length > 0 || expanded.has(project.id);
    const active = project.id === activeProjectId;
    return (
      <li key={project.id}>
        <div
          className={`group flex min-h-10 w-full items-center rounded-control text-label font-medium transition-colors ${
            // Open, the active chat row below carries the highlight; drawing
            // both would make two rows look selected.
            active
              ? `text-ink ${isOpen ? "hover:bg-hover-2" : "bg-hover"}`
              : "text-ink-2 hover:bg-hover-2 hover:text-ink"
          }`}
        >
          <button
            type="button"
            onClick={() => void openProject(project)}
            className="flex min-w-0 flex-1 items-center gap-2 py-2 pl-2 text-left"
          >
            <span className="grid size-6 shrink-0 place-items-center rounded-chip bg-field text-meta shadow-hairline">
              {project.emoji ?? (project.name.trim().charAt(0).toUpperCase() || "•")}
            </span>
            <span className="min-w-0 flex-1 truncate">{project.name}</span>
            {active && !isOpen && <RunDot />}
            {project.unread_scheduled_count > 0 && (
              <span
                className="size-2 shrink-0 rounded-full bg-accent"
                aria-label="Unread scheduled reports"
              />
            )}
          </button>
          {/* Hidden until hover on a desktop, always there on touch — a phone
            * has no hover to reveal it with. */}
          <div className="opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:has-[[aria-expanded=true]]:opacity-100 [@media(hover:hover)]:focus-within:opacity-100">
            <Menu
              label={`Manage ${project.name}`}
              align="end"
              trigger={<span aria-hidden className="text-ink-3">···</span>}
            >
              {(close) => (
                <>
                  <MenuItem
                    icon={<IconPin size={14} />}
                    label={project.pinned === 1 ? "Unpin" : "Pin to top"}
                    onSelect={() => {
                      close();
                      void togglePin(project);
                    }}
                  />
                  <MenuItem
                    icon={<IconEdit size={14} />}
                    label="Edit project"
                    onSelect={() => {
                      close();
                      setEditing(project);
                    }}
                  />
                </>
              )}
            </Menu>
          </div>
          <button
            type="button"
            onClick={() =>
              setExpanded((current) => {
                const next = new Set(current);
                if (next.has(project.id)) next.delete(project.id);
                else next.add(project.id);
                return next;
              })
            }
            aria-label={`${isOpen ? "Collapse" : "Expand"} ${project.name}`}
            aria-expanded={isOpen}
            disabled={needle.length > 0}
            className="grid size-9 shrink-0 place-items-center text-ink-3 hover:text-ink"
          >
            <span
              aria-hidden
              className="transition-transform duration-150"
              style={{ transform: isOpen ? "rotate(90deg)" : undefined }}
            >
              <IconChevronRight size={13} />
            </span>
          </button>
        </div>
        {isOpen && (
          <ul className="mt-0.5 mb-1">
            {roots.length === 0 && (
              <li className="py-1.5 pl-10 text-meta text-ink-3">No chats yet</li>
            )}
            {roots.map((session) => (
              <SessionBranch
                key={session.session_id}
                session={session}
                childrenByParent={children}
                activeSessionId={activeSessionId}
                onSelect={select}
                onRename={rename}
                onDelete={remove}
                unreadScheduledCount={project.unread_scheduled_count}
              />
            ))}
          </ul>
        )}
      </li>
    );
  };

  const sectionLabel = (text: string) => (
    <li className="px-2 pt-3 pb-1 text-micro font-semibold tracking-[0.06em] text-ink-3 uppercase first:pt-1">
      {text}
    </li>
  );

  const content = (
    <aside className="pt-safe pb-safe flex h-full w-[280px] shrink-0 flex-col border-r border-line bg-page">
      <div className="flex h-14 items-center justify-between pr-2 pl-4">
        <span className="text-ui font-semibold text-ink">{APP_NAME}</span>
        <button
          type="button"
          onClick={onNewProject}
          aria-label="New project"
          title="New project"
          className="tap-target grid size-9 place-items-center rounded-control text-ink-2 hover:bg-hover-2 hover:text-ink"
        >
          <IconPlus size={17} />
        </button>
      </div>
      {showFilter && (
        <div className="px-2 pb-2">
          <input
            data-sidebar-filter
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setQuery("");
                event.currentTarget.blur();
              }
            }}
            placeholder="Filter projects and chats"
            aria-label="Filter projects and chats"
            // 16px on touch, or iOS zooms the viewport on focus
            className="h-8 w-full rounded-control border border-line bg-field px-2.5 text-input text-ink
              outline-none placeholder:text-ink-3 focus:border-line-strong [@media(pointer:fine)]:text-label"
          />
        </div>
      )}
      <nav aria-label="Projects and sessions" className="scroll-area min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <ul className="space-y-0.5">
          {anyPinned && !needle && sectionLabel("Pinned")}
          {visible.filter(({ project }) => anyPinned && !needle && project.pinned === 1).map(renderProject)}
          {anyPinned &&
            !needle &&
            visible.some(({ project }) => project.pinned !== 1) &&
            sectionLabel("Projects")}
          {visible.filter(({ project }) => !(anyPinned && !needle && project.pinned === 1)).map(renderProject)}
        </ul>
        {needle && visible.length === 0 && (
          <p className="px-2 py-6 text-center text-meta text-ink-3">
            Nothing matches &ldquo;{query.trim()}&rdquo;.
          </p>
        )}
      </nav>
      <div className="flex items-center gap-1 border-t border-line px-2 py-2">
        <button
          type="button"
          onClick={() => {
            onClose();
            openSearch();
          }}
          className="flex h-9 flex-1 items-center gap-2 rounded-control px-2 text-label font-medium text-ink-2
            transition-colors hover:bg-hover-2 hover:text-ink"
        >
          <IconSearch size={14} className="text-ink-3" />
          Search
        </button>
        <button
          type="button"
          onClick={() => {
            onClose();
            router.push("/settings");
          }}
          className="flex h-9 flex-1 items-center gap-2 rounded-control px-2 text-label font-medium text-ink-2
            transition-colors hover:bg-hover-2 hover:text-ink"
        >
          <IconSettings size={14} className="text-ink-3" />
          Settings
        </button>
      </div>
    </aside>
  );

  return (
    <>
      <div className="hidden h-full lg:block">{content}</div>
      {open && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <button
            type="button"
            aria-label="Close sidebar"
            onClick={onClose}
            className="absolute inset-0 bg-scrim"
            style={{ animation: "fade-in var(--duration-quick) ease-out both" }}
          />
          <div
            className="relative h-full shadow-overlay"
            style={{ animation: "panel-in-right var(--duration-fast) var(--ease-smooth-out) both" }}
          >
            {content}
          </div>
        </div>
      )}
      {editing && (
        <ProjectSettingsSheet
          project={editing}
          sessionId={editing.id === activeProjectId ? activeSessionId : undefined}
          open
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
