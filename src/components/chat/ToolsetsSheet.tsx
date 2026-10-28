"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { IconCross, IconWrench } from "@/components/primitives/icons";
import { ICON_BUTTON } from "@/components/ui/SettingsControls";
import type { HermesToolset } from "@/lib/hermes";
import { botQuery, useProjectBot } from "@/components/ProjectBotContext";

/* GET /v1/toolsets, rendered.
 *
 * This is the deterministic answer to "what can this agent actually do" —
 * the alternative is spending a turn asking the model and believing what it
 * says. Read-only: enabling a toolset is a gateway config change, and
 * api_server has no endpoint for it. */

export function ToolsetsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [toolsets, setToolsets] = useState<HermesToolset[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const bot = useProjectBot();

  useEffect(() => {
    if (!open || toolsets) return;
    let cancelled = false;
    fetch(`/api/toolsets${botQuery(bot)}`)
      .then((r) => r.json())
      .then((body: { toolsets?: HermesToolset[]; unavailable?: boolean }) => {
        if (cancelled) return;
        setToolsets(body.toolsets ?? []);
        setUnavailable(body.unavailable === true);
      })
      .catch(() => {
        if (!cancelled) {
          setToolsets([]);
          setUnavailable(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, toolsets, bot]);

  // Enabled first: what's live matters more than what could be.
  const sorted = [...(toolsets ?? [])].sort(
    (a, b) =>
      Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name),
  );

  return (
    <Sheet open={open} onClose={onClose} label="Toolsets">
      <div className="flex items-center justify-between gap-2 px-5 pt-5 pb-3">
        <span className="flex items-center gap-2 text-title font-semibold text-ink">
          <IconWrench size={16} className="text-ink-2" />
          Toolsets
        </span>
        <button type="button" aria-label="Close" onClick={onClose} className={`${ICON_BUTTON} -mr-2`}>
          <IconCross size={16} />
        </button>
      </div>

      <div className="flex flex-col gap-2 px-5 pb-5">
        {!toolsets && <p className="py-3 text-label text-ink-3">Loading…</p>}
        {unavailable && (
          <p className="py-3 text-label text-ink-3">
            Hermes didn&rsquo;t answer with its toolset list.
          </p>
        )}
        {sorted.map((toolset) => (
          <div
            key={toolset.name}
            className="rounded-card bg-surface px-3.5 py-3 shadow-card"
            style={{ opacity: toolset.enabled ? 1 : 0.55 }}
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-ui font-medium text-ink">
                {toolset.label || toolset.name}
              </span>
              <span
                className={`rounded-chip px-1.5 text-meta ${
                  toolset.enabled
                    ? "bg-green-tint text-green"
                    : "bg-field text-ink-3"
                }`}
              >
                {toolset.enabled ? "on" : "off"}
              </span>
              {toolset.enabled && toolset.configured === false && (
                <span className="rounded-chip bg-orange-tint px-1.5 text-meta text-orange">
                  needs a key
                </span>
              )}
            </div>
            {toolset.description && (
              <p className="mt-1 text-label text-ink-3">
                {toolset.description}
              </p>
            )}
            {toolset.tools && toolset.tools.length > 0 && (
              <p className="mt-2 font-mono text-meta leading-[1.6] text-ink-2 [overflow-wrap:anywhere]">
                {toolset.tools.join(", ")}
              </p>
            )}
          </div>
        ))}
      </div>
    </Sheet>
  );
}
