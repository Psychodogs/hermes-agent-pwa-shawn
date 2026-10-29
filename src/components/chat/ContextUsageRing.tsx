"use client";

import React, { useEffect, useState } from "react";
import { contextUsageView, type ContextUsageMeasurement } from "@/lib/context-usage";

/** Native details works on touch and keyboard; title also exposes hover detail. */
export function ContextUsageRing({ measurement, model, generation }: {
  measurement?: ContextUsageMeasurement | null;
  model?: string | null;
  generation?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const view = contextUsageView(measurement, { now, model, generation });
  return (
    <details className="group relative shrink-0 text-ink-2">
      <summary title={view.label} aria-label={view.label} className="grid size-10 cursor-pointer list-none place-items-center rounded-control hover:bg-hover focus-visible:outline-2 [&::-webkit-details-marker]:hidden">
        <svg viewBox="0 0 36 36" className="size-7" aria-hidden="true">
          <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.25" />
          {view.percent !== null && <circle cx="18" cy="18" r="15" pathLength="100" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray={`${view.percent} 100`} transform="rotate(-90 18 18)" />}
          <text x="18" y="22" textAnchor="middle" fill="currentColor" fontSize="10">{view.percent === null ? "?" : `${Math.round(view.percent)}`}</text>
        </svg>
      </summary>
      <p className="absolute right-0 bottom-12 z-40 w-60 max-w-[80vw] rounded-control border border-line bg-surface p-3 text-meta shadow-overlay">{view.label}</p>
    </details>
  );
}
