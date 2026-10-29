"use client";

import React from "react";
import Link from "next/link";
import { useTelegramConversation } from "@/hooks/useTelegramConversation";
import { TelegramHistory } from "./TelegramHistory";
import { TelegramComposer } from "./TelegramComposer";

export function TelegramConversation({ sessionId }: { sessionId: string }) {
  const state = useTelegramConversation(sessionId);
  const session = state.session;
  return <>
    <div className="shrink-0 border-b border-line px-4 py-2 text-ui">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3"><Link href="/telegram" className="underline">Telegram conversations</Link><span className="min-w-0 flex-1 break-words">{session?.title ?? "Conversation"}</span><button type="button" disabled={state.busy} onClick={()=>void state.refresh()} className="rounded-control px-3 py-2 hover:bg-hover">Refresh</button></div>
      <p className="mx-auto max-w-3xl text-meta text-ink-3">{session?.endedAt ? "Historical conversation · " : ""}Stored history · refresh to see new messages. Unsupported actions must be handled in Telegram.</p>
      {state.busy && <p role="status" className="mx-auto max-w-3xl text-meta">Refreshing…</p>}
      {state.error && <p role="alert" className="mx-auto max-w-3xl text-red">{state.error}</p>}
    </div>
    <TelegramHistory messages={state.messages} nextCursor={state.nextCursor} busy={state.busy} onOlder={()=>void state.older()} />
    <TelegramComposer key={`${sessionId}:${session?.generation ?? "readonly"}:${session?.destination?.label ?? ""}:${session?.destination?.topic ?? ""}`} session={session} onSubmitted={()=>void state.refresh()} />
  </>;
}
