"use client";

import { useEffect, useState } from "react";
import { IconCheck, IconCross, IconPlus } from "@/components/primitives/icons";
import { FIELD_CLASS, HELP_CLASS } from "@/components/ui/SettingsControls";
import type { HermesSkill } from "@/lib/hermes";

/* Skills are linked by name, never inlined. Hermes can preload a skill's full
 * text (agent/skill_commands.py:564), but installed skills reach ~100KB —
 * pasting one into every turn would cost roughly 25k tokens a message. Naming
 * them lets the agent pull them in with skill_view only when relevant. */

/** Fetches the catalogue once per mount. Empty on failure so the picker
 *  degrades to showing whatever is already linked rather than breaking. */
export function useSkillCatalogue() {
  const [catalogue, setCatalogue] = useState<HermesSkill[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/skills")
      .then((r) => r.json())
      .then((body: { skills?: HermesSkill[] }) => {
        if (!cancelled) setCatalogue(body.skills ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return catalogue;
}

export function SkillPicker({
  value,
  onChange,
  catalogue,
  hint = true,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  catalogue: HermesSkill[];
  hint?: boolean;
}) {
  const [query, setQuery] = useState("");

  const matches = query.trim()
    ? catalogue.filter((s) =>
        `${s.name} ${s.description ?? ""}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      )
    : [];

  const toggle = (name: string) => {
    onChange(
      value.includes(name) ? value.filter((x) => x !== name) : [...value, name],
    );
    setQuery("");
  };

  return (
    <div>
      {hint && (
        <p className={`mt-0.5 ${HELP_CLASS}`}>
          Named in every message so the agent loads them with <code>skill_view</code>{" "}
          when relevant.
        </p>
      )}

      {value.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {value.map((s) => (
            <span
              key={s}
              className="inline-flex h-8 items-center gap-1 rounded-full bg-field pr-1.5 pl-3
                text-label text-ink"
            >
              {s}
              <button
                type="button"
                aria-label={`Unlink ${s}`}
                onClick={() => onChange(value.filter((x) => x !== s))}
                className="flex size-5 items-center justify-center rounded-full text-ink-3
                  transition-[transform,background-color,color] duration-150 hover:bg-hover-2
                  hover:text-ink active:scale-[0.97]"
              >
                <IconCross size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={catalogue.length ? "Search skills…" : "Skill list unavailable"}
        aria-label="Search skills"
        className={`mt-2.5 ${FIELD_CLASS}`}
      />

      {matches.length > 0 && (
        <div className="scroll-area mt-2 max-h-52 overflow-y-auto rounded-card p-1.5 shadow-card">
          {matches.slice(0, 40).map((s) => {
            const linked = value.includes(s.name);
            return (
              <button
                key={s.name}
                type="button"
                onClick={() => toggle(s.name)}
                className="flex min-h-9 w-full items-start gap-2.5 rounded-control px-2.5 py-1.5
                  text-left transition-[background-color] duration-150 hover:bg-hover"
              >
                <span className="mt-0.5 shrink-0 text-ink-2">
                  {linked ? <IconCheck size={16} /> : <IconPlus size={16} />}
                </span>
                <span className="min-w-0">
                  <span className="block text-ui text-ink">{s.name}</span>
                  {s.description && (
                    <span className="block truncate text-label text-ink-3">
                      {s.description}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
