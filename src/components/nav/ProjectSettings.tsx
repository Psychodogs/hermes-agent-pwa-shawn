"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/ui/Sheet";
import type { Project } from "@/lib/chat-types";
import { parseSkills } from "@/lib/instructions";
import {
  FIELD_CLASS,
  HELP_CLASS,
  LABEL_CLASS,
  TEXTAREA_CLASS,
  buttonClass,
} from "@/components/ui/SettingsControls";
import { SkillPicker, useSkillCatalogue } from "./SkillPicker";
import { useStatus } from "@/hooks/useStatus";

/* A project's standing instructions live here rather than in a pinned message.
 * They're passed to Hermes as `instructions` on every run, so editing them
 * changes how the very next turn is framed — including turns hundreds of
 * messages deep, after compaction has discarded the early transcript.
 *
 * The gear that used to open this directly is now a menu (HeaderMenu) — this
 * is "Edit project", one entry among several, and the app-wide settings that
 * were awkwardly stapled to the foot of this form live at /settings. */

/** A lifecycle action: a full-width row, inset so its text lines up with the fields. */
const ROW_ACTION =
  "-mx-3 flex min-h-10 items-center rounded-control px-3 text-left text-ui transition-[transform,background-color] duration-150 enabled:hover:bg-hover enabled:active:scale-[0.99] disabled:opacity-40";

export function ProjectSettingsSheet({
  project,
  sessionId,
  open,
  onClose,
}: {
  project: Project;
  sessionId?: string;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} label="Edit project">
      {/* remounted per open, so an abandoned edit never reappears half-typed */}
      {open && (
        <ProjectSettingsForm
          project={project}
          sessionId={sessionId}
          onClose={onClose}
        />
      )}
    </Sheet>
  );
}

function ProjectSettingsForm({
  project,
  sessionId,
  onClose,
}: {
  project: Project;
  sessionId?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(project.name);
  const [emoji, setEmoji] = useState(project.emoji ?? "");
  const [instructions, setInstructions] = useState(project.instructions ?? "");
  const [cwd, setCwd] = useState(project.cwd ?? "");
  const [pinned, setPinned] = useState(project.pinned === 1);
  const [skills, setSkills] = useState<string[]>(() => parseSkills(project.skills));
  const catalogue = useSkillCatalogue();
  const { features } = useStatus();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [dropSession, setDropSession] = useState(false);
  const [messageCount, setMessageCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);



  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${project.id}`)
      .then((r) => r.json())
      .then((body: { messageCount?: number | null }) => {
        if (!cancelled) setMessageCount(body.messageCount ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  /** Archive, not delete: keeps every row and the Hermes transcript, and just
   *  drops the project out of the sidebar. Reversible from /settings. */
  async function archive() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`${res.status}`);
      onClose();
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive");
      setBusy(false);
    }
  }

  /** Adds a new root session while preserving the current one in the tree. */
  async function reset() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New chat" }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        // 409 while a run is active — the route refuses rather than orphan it
        throw new Error(body.error || `${res.status}`);
      }
      const body = (await res.json()) as { session: { id: string } };
      onClose();
      router.push(`/p/${project.id}/s/${body.session.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start a new thread");
      setBusy(false);
    }
  }

  /** Branch the session visible on this device below the same project. */
  async function branch() {
    if (busy || !sessionId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/projects/${project.id}/sessions/${sessionId}/fork`,
        { method: "POST" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `${res.status}`);
      }
      const body = (await res.json()) as { session: { id: string } };
      onClose();
      router.push(`/p/${project.id}/s/${body.session.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to branch");
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const qs = `purge=1${dropSession ? "&session=1" : ""}`;
      const res = await fetch(`/api/projects/${project.id}?${qs}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `${res.status}`);
      }
      onClose();
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
      setBusy(false);
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || project.name,
          emoji: emoji.trim() || null,
          instructions: instructions.trim() || null,
          cwd: cwd.trim() || null,
          pinned,
          skills,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `${res.status}`);
      }
      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-5 p-5">
      <div className="flex items-end gap-3">
        <div className="shrink-0">
          <label htmlFor="project-emoji" className={LABEL_CLASS}>
            Icon
          </label>
          {/* One grapheme, not a picker. iOS gives every text field an emoji
              keyboard already, so a 900-glyph grid would be a worse version of
              a control the OS ships. */}
          <input
            id="project-emoji"
            value={emoji}
            onChange={(event) =>
              setEmoji([...event.target.value.trim()].slice(0, 2).join(""))
            }
            placeholder="💬"
            aria-label="Project emoji"
            className={`mt-1.5 w-14! text-center ${FIELD_CLASS}`}
          />
        </div>
        <div className="min-w-0 flex-1">
          <label htmlFor="project-name" className={LABEL_CLASS}>
            Name
          </label>
          <input
            id="project-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={project.name}
            className={`mt-1.5 ${FIELD_CLASS}`}
          />
        </div>
      </div>

      <div>
        <label htmlFor="project-instructions" className={LABEL_CLASS}>
          Standing instructions
        </label>
        <p className={`mt-0.5 ${HELP_CLASS}`}>
          Sent with every message in this project. Unlike a pinned message it is
          never lost to context compaction.
        </p>
        <textarea
          id="project-instructions"
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          rows={8}
          placeholder="e.g. Use the fitness journal as the authoritative source for meals, weight and training."
          className={`mt-2.5 ${TEXTAREA_CLASS}`}
        />
      </div>

      <div>
        <span className={LABEL_CLASS}>Linked skills</span>
        <SkillPicker value={skills} onChange={setSkills} catalogue={catalogue} />
      </div>

      <div>
        <label htmlFor="project-cwd" className={LABEL_CLASS}>
          Working directory
        </label>
        <p className={`mt-0.5 ${HELP_CLASS}`}>
          Stated to the agent as text — the API has no per-request working directory,
          so tools need absolute paths.
        </p>
        <input
          id="project-cwd"
          value={cwd}
          onChange={(event) => setCwd(event.target.value)}
          placeholder="/srv/code/example"
          className={`mt-2.5 font-mono ${FIELD_CLASS}`}
        />
      </div>

      <label className="flex items-center gap-2.5 text-ui text-ink">
        <input
          type="checkbox"
          checked={pinned}
          onChange={(event) => setPinned(event.target.checked)}
          className="size-4 accent-[var(--ink)]"
        />
        Pin to the top of the sidebar
      </label>

      {error && (
        <p className="text-label text-red" style={{ animation: "fade-in 150ms ease-out both" }}>
          {error}
        </p>
      )}

      {/* Thread lifecycle — reversible things first, then the one that isn't. */}
      <div className="flex flex-col gap-0.5 border-t border-line pt-4">
        {/* Hidden on a Hermes without POST /api/sessions/{id}/fork, which would
          * only 404. */}
        {features.session_fork && (
          <button
            type="button"
            onClick={branch}
            disabled={busy}
            className={`${ROW_ACTION} text-ink`}
          >
            Branch this session
          </button>
        )}
        {!confirmReset ? (
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            className={`${ROW_ACTION} text-ink`}
          >
            Start a fresh thread
          </button>
        ) : (
          <div
            className="my-1 rounded-card bg-surface p-4 shadow-card"
            style={{ animation: "fade-in var(--duration-quick) ease-out both" }}
          >
            <p className="text-ui font-semibold text-ink">Start a fresh thread?</p>
            <p className="mt-1 text-label text-ink-2">
              The project keeps its name, instructions and skills. The current
              conversation stays in the sidebar and the new chat opens beside it.
            </p>
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className={buttonClass("secondary", "sm")}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={reset}
                disabled={busy}
                className={buttonClass("primary", "sm")}
              >
                {busy ? "Starting…" : "Start fresh"}
              </button>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={archive}
          disabled={busy}
          className={`${ROW_ACTION} text-ink`}
        >
          Archive project
        </button>

        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className={`${ROW_ACTION} text-red`}
          >
            Delete project
          </button>
        ) : (
          <div
            className="my-1 rounded-card bg-surface p-4 shadow-card"
            style={{ animation: "fade-in var(--duration-quick) ease-out both" }}
          >
            <p className="text-ui font-semibold text-ink">
              Delete “{project.name}”?
            </p>
            <label className="mt-2 flex items-start gap-2.5 text-label text-ink-2">
              <input
                type="checkbox"
                checked={dropSession}
                onChange={(event) => setDropSession(event.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-[var(--ink)]"
              />
              <span>
                Also delete the Hermes conversation
                {messageCount != null && messageCount > 0
                  ? ` (${messageCount} message${messageCount === 1 ? "" : "s"})`
                  : ""}
                . Leave unchecked to keep the transcript reachable from the CLI
                and other Hermes clients.
              </span>
            </label>
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmDelete(false);
                  setDropSession(false);
                }}
                className={buttonClass("secondary", "sm")}
              >
                Keep
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                className={buttonClass("danger", "sm")}
              >
                {busy ? "Deleting…" : dropSession ? "Delete both" : "Delete project"}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onClose} className={buttonClass("secondary")}>
          Cancel
        </button>
        <button type="submit" disabled={busy} className={buttonClass("primary")}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
