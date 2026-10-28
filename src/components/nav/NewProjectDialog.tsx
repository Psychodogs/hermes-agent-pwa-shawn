"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconCross } from "@/components/primitives/icons";
import { PROJECT_TEMPLATES } from "@/lib/instructions";
import {
  FIELD_CLASS,
  HELP_CLASS,
  ICON_BUTTON,
  LABEL_CLASS,
  TEXTAREA_CLASS,
  buttonClass,
} from "@/components/ui/SettingsControls";
import { SkillPicker, useSkillCatalogue } from "./SkillPicker";

/* A project is a long-lived thread, not a session — name it once and come
 * back to it for weeks. cwd is optional metadata we keep on our side;
 * api_server.py's session response has no cwd field to mirror it into. */

export function NewProjectDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  // Mounting the form only while open is what resets it — clearing the
  // fields from an effect would be a cascading render.
  return <NewProjectForm onClose={onClose} onCreated={onCreated} />;
}

function NewProjectForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated?: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [cwd, setCwd] = useState("");
  const [templateId, setTemplateId] = useState("blank");
  const [instructions, setInstructions] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const catalogue = useSkillCatalogue();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // iOS won't focus without a frame of delay after the mount
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          cwd: cwd.trim() || undefined,
          instructions: instructions.trim() || null,
          skills,
          emoji: PROJECT_TEMPLATES.find((t) => t.id === templateId)?.emoji,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `${res.status}`);
      }
      const { project } = (await res.json()) as { project: { id: string } };
      onCreated?.();
      onClose();
      router.push(`/p/${project.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
      setBusy(false);
    }
  }

  return (
    // Bottom sheet on a phone, centred card on a desktop.
    <div
      className="px-safe h-app fixed inset-x-0 top-0 z-60 flex items-end justify-center py-3 sm:items-center"
      style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-scrim"
        style={{ animation: "fade-in var(--duration-quick) ease-out both" }}
      />
      <form
        role="dialog"
        aria-modal="true"
        aria-label="New project"
        onSubmit={create}
        className="relative w-full max-w-md overflow-hidden rounded-[20px] bg-surface shadow-overlay"
        style={{
          animation: "pop-in var(--duration-fast) var(--ease-out-strong) both",
          marginBottom: "max(0px, calc(env(safe-area-inset-bottom) - 4px))",
        }}
      >
        {/* The form outgrew a phone viewport once skills were added — scroll the
            body and keep the footer actions pinned. */}
        <div className="scroll-area max-h-[calc(var(--app-height,100dvh)*0.7)] overflow-y-auto px-5 pt-5 pb-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-title font-semibold text-ink">New project</span>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className={`${ICON_BUTTON} -mr-2`}
            >
              <IconCross size={16} />
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <input
              ref={inputRef}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Project name"
              aria-label="Project name"
              className={FIELD_CLASS}
            />
            <input
              value={cwd}
              onChange={(event) => setCwd(event.target.value)}
              placeholder="Working directory (optional)"
              aria-label="Working directory"
              className={`${FIELD_CLASS} font-mono`}
            />

            <div className="flex flex-wrap gap-2" role="group" aria-label="Template">
              {PROJECT_TEMPLATES.map((t) => {
                const active = t.id === templateId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setTemplateId(t.id);
                      // Only overwrite prose the user hasn't touched.
                      const untouched = PROJECT_TEMPLATES.some(
                        (o) => o.instructions === instructions,
                      );
                      if (untouched || !instructions.trim()) {
                        setInstructions(t.instructions);
                      }
                      if (!name.trim() && t.id !== "blank") setName(t.label);
                    }}
                    className={`h-8 rounded-full px-3 text-label transition-[transform,background-color,color]
                      duration-150 active:scale-[0.97] ${
                        active
                          ? "bg-ink font-medium text-page"
                          : "bg-field text-ink-2 hover:text-ink"
                      }`}
                  >
                    {t.emoji} {t.label}
                  </button>
                );
              })}
            </div>

            <textarea
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              rows={4}
              placeholder="Standing instructions — sent with every message in this project"
              aria-label="Project instructions"
              className={TEXTAREA_CLASS}
            />
            <p className={HELP_CLASS}>
              Re-sent on every turn, so it survives context compaction instead of
              scrolling away like a pinned message. Editable later.
            </p>

            <div className="mt-1">
              <span className={LABEL_CLASS}>Linked skills</span>
              <SkillPicker value={skills} onChange={setSkills} catalogue={catalogue} />
            </div>
          </div>

          {error && (
            <p className="mt-3 text-label text-red" style={{ animation: "fade-in 150ms ease-out both" }}>
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-4">
          <button type="button" onClick={onClose} className={buttonClass("secondary")}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim() || busy}
            className={buttonClass("primary")}
          >
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}
