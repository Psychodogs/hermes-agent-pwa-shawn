"use client";

import React, { useEffect, useState } from "react";
import { ContextUsageRing } from "@/components/chat/ContextUsageRing";
import { telegramGet, type TelegramPublicSession } from "@/hooks/useTelegramConversation";

export interface TelegramReceipt { submissionId: string; status: string; promptDelivery?: string; replyDelivery?: string }
export function canCompose(session: TelegramPublicSession | null): boolean {
  return !!(session && session.capability?.mode === "shared-capable" && session.capability.canSubmit === true && session.destination?.label && session.generation && !session.endedAt && !session.historical);
}
export function TelegramComposer({ session, onSubmitted }: { session: TelegramPublicSession | null; onSubmitted: () => void }) {
  const [text, setText] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recoveryChecked, setRecoveryChecked] = useState(false);
  const [receipt, setReceipt] = useState<TelegramReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const writable = canCompose(session);
  const pendingKey = session ? `telegram.pending.${session.id}` : null;
  useEffect(() => {
    if (!pendingKey || !session) return;
    let active = true;
    const recover = async () => {
      try {
        const id = sessionStorage.getItem(pendingKey);
        if (id) {
          const result = await telegramGet<TelegramReceipt>(`/${encodeURIComponent(session.id)}/submissions/${encodeURIComponent(id)}`).catch(() => ({submissionId:id,status:"unknown"}));
          if (active) setReceipt(result);
        }
        if (active) setRecoveryChecked(true);
      } catch { if (active) setError("Recovery storage is unavailable. Sending is disabled."); }
    };
    const start = setTimeout(() => void recover(), 0);
    return () => { active = false; clearTimeout(start); };
  }, [pendingKey, session]);
  async function submit() {
    if (!writable || !session || !recoveryChecked || !confirmed || busy || !text.trim() || receipt) return;
    if (/^\s*\//.test(text)) { setError("Commands are not supported here. Use Telegram for commands and approvals."); return; }
    const submissionId = crypto.randomUUID();
    try { sessionStorage.setItem(pendingKey!, submissionId); }
    catch { setError("Recovery storage is unavailable. Nothing was sent."); return; }
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/telegram/sessions/${encodeURIComponent(session.id)}/submissions`, {
        method:"POST", headers:{"Content-Type":"application/json"}, cache:"no-store",
        body:JSON.stringify({submissionId,text,confirmedDestination:true,generation:session.generation}),
      });
      if (!response.ok) throw new Error("unconfirmed");
      setReceipt(await response.json() as TelegramReceipt); setText(""); onSubmitted();
    } catch { setReceipt({submissionId,status:"unknown"}); setError("Admission is unconfirmed. Check status before sending again; do not repeat the prompt."); }
    finally { setBusy(false); }
  }
  async function checkReceipt() {
    if (!session || !receipt) return;
    try {
      const result = await telegramGet<TelegramReceipt>(`/${encodeURIComponent(session.id)}/submissions/${encodeURIComponent(receipt.submissionId)}`);
      setReceipt(result); onSubmitted();
    } catch { setError("Status is unavailable. No prompt was re-submitted."); }
  }
  const destination = session?.destination;
  return <section className="pb-safe shrink-0 border-t border-line px-4 pt-3">
    <div className="mx-auto max-w-3xl space-y-2 pb-3">
      <p className="text-label text-ink-2">{destination ? `Shared with Telegram · ${destination.label}${destination.topic ? ` · ${destination.topic}` : ""}${destination.bot ? ` · ${destination.bot}` : ""}` : "Telegram · destination not verified"}</p>
      {!writable && <p className="text-meta text-ink-3">Read-only · {session?.capability?.reason ?? "Shared sending is not available for this conversation."} Use Telegram for commands, approvals and other actions.</p>}
      {writable && <label className="flex items-start gap-2 text-label"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I understand my prompt will be posted by the bot to {destination?.kind === "group" ? "the group " : ""}{destination?.label}, not to a private PWA chat.</label>}
      {writable && !recoveryChecked && <p role="status" className="text-meta">Checking pending submissions…</p>}
      <div className="flex min-w-0 items-end gap-2">
        <textarea aria-label="Message shared with Telegram" value={text} onChange={e => setText(e.target.value)} disabled={!writable || busy || !!receipt} maxLength={16000} rows={2} placeholder={writable ? "Message Telegram…" : "Read-only conversation"} className="min-w-0 flex-1 resize-y rounded-control bg-field p-3 text-input text-ink disabled:opacity-50" />
        <ContextUsageRing measurement={session?.contextUsage} generation={session?.generation} />
        <button type="button" onClick={() => void submit()} disabled={!writable || !recoveryChecked || !confirmed || busy || !text.trim() || !!receipt} className="rounded-control bg-field px-3 py-3 text-label disabled:opacity-40">Send</button>
      </div>
      {receipt && <div className="text-meta" role="status"><p>Execution: {receipt.status} · Prompt echo: {receipt.promptDelivery ?? "unknown"} · Reply delivery: {receipt.replyDelivery ?? "unknown"}</p><button type="button" className="underline" onClick={() => void checkReceipt()}>Check submission status</button>{["completed","failed"].includes(receipt.status) && <button type="button" className="ml-3 underline" onClick={() => { if (pendingKey) sessionStorage.removeItem(pendingKey); setReceipt(null); }}>Compose another prompt</button>}</div>}
      {error && <p role="alert" className="text-meta text-red">{error}</p>}
    </div>
  </section>;
}
