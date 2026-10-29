"use client";

import React, { useLayoutEffect, useRef } from "react";
import type { TelegramPublicMessage } from "@/hooks/useTelegramConversation";

/** Deliberately literal: no file probes, recommendation/approval actions or remote media. */
export function TelegramHistory({ messages, nextCursor, busy, onOlder }: {
  messages: TelegramPublicMessage[]; nextCursor: string | null; busy: boolean; onOlder: () => void;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ height: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (anchor.current && scroll.current && !busy) {
      scroll.current.scrollTop = anchor.current.top + scroll.current.scrollHeight - anchor.current.height;
      anchor.current = null;
    }
  }, [messages, busy]);
  return <div ref={scroll} className="scroll-area min-h-0 flex-1 overflow-y-auto px-4 py-4" aria-label="Telegram conversation history">
    <div className="mx-auto max-w-3xl space-y-5">
      {nextCursor && <button type="button" disabled={busy} className="rounded-control border border-line px-3 py-2 text-ui disabled:opacity-50" onClick={() => {
        if (scroll.current) anchor.current = { height: scroll.current.scrollHeight, top: scroll.current.scrollTop };
        onOlder();
      }}>Load older messages</button>}
      {!busy && !messages.length && <p className="text-ink-2">No public messages on this page.{nextCursor ? " Older history is available." : ""}</p>}
      {messages.map(message => <article key={message.id} className={message.role === "user" ? "ml-auto max-w-[90%] rounded-control bg-field p-3" : "py-2"}>
        <p className="mb-1 text-meta text-ink-3">{message.role === "user" ? "User" : "Assistant"} · Stored history{message.timestamp ? ` · ${message.timestamp}` : ""}</p>
        <div className="whitespace-pre-wrap break-words text-body text-ink [overflow-wrap:anywhere]">{message.content}</div>
      </article>)}
    </div>
  </div>;
}
