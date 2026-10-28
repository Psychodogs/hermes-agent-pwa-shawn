"use client";

import { useCallback, useState } from "react";

/* beautifului.dev's CodeBlock with the scripted line-by-line reveal removed —
 * agent output arrives as whole fences, and re-animating text the model already
 * finished writing reads as noise. Copy is the real clipboard. */

export function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const lines = code.replace(/\n$/, "").split("\n");

  const copy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [code]);

  return (
    <div className="w-full overflow-hidden rounded-card bg-inset shadow-card">
      <div className="flex h-10 items-center justify-between pr-2 pl-4">
        <span className="font-mono text-meta text-ink-3">{language || "text"}</span>
        <button
          type="button"
          aria-label="Copy code"
          onClick={copy}
          className={`tap-target flex h-7 items-center gap-1.5 rounded-control px-2 text-meta font-medium
            transition-[color,background-color,transform] duration-150 hover:bg-hover active:scale-[0.97]
            ${copied ? "text-green" : "text-ink-2 hover:text-ink"}`}
        >
          {copied ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="12" height="12" rx="2.5" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {/* No line-number gutter: on a phone it cost a tenth of the width, and
        * the category's own code blocks don't carry one. */}
      <pre className="scroll-area scroll-fade-x overflow-x-auto px-4 pt-0.5 pb-4 font-mono text-label leading-[1.65] text-ink [--fade-bg:var(--inset)]">
        {lines.map((line, i) => (
          <div key={i} className="whitespace-pre">
            {line || " "}
          </div>
        ))}
      </pre>
    </div>
  );
}
