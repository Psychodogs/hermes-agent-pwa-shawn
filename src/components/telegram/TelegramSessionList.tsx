"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { telegramGet, type TelegramPublicSession } from "@/hooks/useTelegramConversation";

export function TelegramSessionList() {
  const [sessions, setSessions] = useState<TelegramPublicSession[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const load = useCallback(async (next?: string) => {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(null);
    try {
      const data = await telegramGet<{sessions:TelegramPublicSession[];nextCursor:string|null}>(next ? `?cursor=${encodeURIComponent(next)}` : "", controller.signal);
      if (controller.signal.aborted) return;
      setSessions(old => Array.from(new Map([...(next ? old : []), ...data.sessions].map(s=>[s.id,s])).values())); setCursor(data.nextCursor);
    } catch { if (!controller.signal.aborted) setError("Telegram conversations are unavailable. Try refreshing."); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }, []);
  useEffect(() => {
    const start = setTimeout(() => void load(), 0);
    return () => { clearTimeout(start); request.current?.abort(); };
  }, [load]);
  const visible = sessions.filter(s => s.title.toLowerCase().includes(query.toLowerCase()));
  return <div className="scroll-area min-h-0 flex-1 overflow-y-auto p-4"><div className="mx-auto max-w-3xl space-y-4">
    <p className="text-ui text-ink-2">Stored Hermes conversations from Telegram, not your entire Telegram account. Each conversation keeps its own history boundary.</p>
    <div className="flex gap-2"><input type="search" aria-label="Filter conversation titles" placeholder="Filter loaded titles (not message search)" value={query} onChange={e=>setQuery(e.target.value)} className="min-w-0 flex-1 rounded-control bg-field p-3 text-input" /><button type="button" disabled={busy} onClick={()=>void load()} className="rounded-control border border-line px-3">Refresh</button></div>
    {error && <p role="alert">{error}</p>}
    {busy && <p role="status">Loading conversations…</p>}
    {!busy && !error && !visible.length && <p>No matching conversations.</p>}
    <ul className="space-y-2">{visible.map(s=><li key={s.id}><Link href={`/telegram/s/${encodeURIComponent(s.id)}`} className="block rounded-control border border-line p-4 hover:bg-hover"><span className="block break-words font-medium">{s.title || "Untitled Telegram conversation"}</span><span className="text-meta text-ink-3">{s.destination?.label ?? "Destination metadata unavailable"} · {s.endedAt ? "Historical conversation" : "Stored conversation"}</span></Link></li>)}</ul>
    {cursor && <button type="button" disabled={busy} onClick={()=>void load(cursor)} className="rounded-control border border-line px-3 py-2">Load more conversations</button>}
  </div></div>;
}
