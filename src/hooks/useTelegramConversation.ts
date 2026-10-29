"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ContextUsageMeasurement } from "@/lib/context-usage";

export interface TelegramPublicSession {
  id: string;
  title: string;
  endedAt?: string | null;
  historical?: boolean;
  destination?: { label: string; kind?: string; topic?: string; bot?: string };
  generation?: string;
  capability?: { mode: string; canSubmit?: boolean; reason?: string };
  contextUsage?: ContextUsageMeasurement | null;
}
export interface TelegramPublicMessage {
  id: string; role: "user" | "assistant"; content: string;
  content_format: "plain" | "markdown"; timestamp?: string | null; provenance?: string;
}
interface MessagePage { messages: TelegramPublicMessage[]; nextCursor: string | null }
export function mergeMessages(older: TelegramPublicMessage[], newer: TelegramPublicMessage[]) {
  return Array.from(new Map([...older, ...newer].map(m => [m.id, m])).values());
}
export async function telegramGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/telegram/sessions${path}`, { cache: "no-store", signal });
  if (!response.ok) throw new Error(response.status === 409 ? "History changed. Refresh to continue." : "Telegram is unavailable. Try refreshing.");
  return response.json() as Promise<T>;
}
export function useTelegramConversation(sessionId: string) {
  const [session, setSession] = useState<TelegramPublicSession | null>(null);
  const [messages, setMessages] = useState<TelegramPublicMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const path = `/${encodeURIComponent(sessionId)}`;
  const load = useCallback(async (cursor?: string) => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(null);
    try {
      const page = await telegramGet<MessagePage>(`${path}/messages${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, controller.signal);
      if (controller.signal.aborted) return;
      setMessages(old => cursor ? mergeMessages(page.messages, old) : page.messages);
      setNextCursor(page.nextCursor);
      // Capability failure must not hide readable history or leave compose enabled.
      const detail = await telegramGet<TelegramPublicSession>(path, controller.signal).catch(() => null);
      if (!controller.signal.aborted) setSession(detail);
    } catch (e) {
      if (!controller.signal.aborted) { setSession(null); setError(e instanceof Error ? e.message : "Telegram is unavailable."); }
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }, [path]);
  useEffect(() => {
    const start = setTimeout(() => void load(), 0);
    // Passive history refresh; no native attach, automatic send or run subscription.
    const focus = () => { if (!request.current || !document.hidden) void load(); };
    window.addEventListener("focus", focus);
    return () => { clearTimeout(start); request.current?.abort(); window.removeEventListener("focus", focus); };
  }, [load]);
  return { session, messages, nextCursor, busy, error, refresh: () => load(), older: () => nextCursor ? load(nextCursor) : Promise.resolve() };
}
