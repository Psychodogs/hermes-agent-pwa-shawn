# Telegram browser DTO contract (UI proposal)

UI only calls same-origin `/api/telegram/sessions`. No project mutation or ordinary run endpoints.

- List GET: `{ sessions: [{ id, title, destination?: {label, kind?: 'group'|'private'|'unknown', topic?:string, bot?:string}, historical?:boolean }], nextCursor?: string|null }`.
- Detail GET `/{id}`: `{ id, title, destination?: as above, generation?:string, capability: {mode:'unavailable'|'read-only'|'shared', reason?:string}, historical?:boolean, contextUsage?: ContextUsageMeasurement|null }`.
- Messages GET `/{id}/messages?cursor=`: `{messages:[{id,role:'user'|'assistant',content,content_format:'plain'|'markdown',timestamp?:string|null,provenance?:string,submissionId?:string}],nextCursor:string|null,reset?:boolean}`. Initial page is newest slice, ordered oldest-first; cursors load older. Empty filtered pages with cursor are not end-of-history.
- POST `/{id}/submissions`: `{submissionId,text,confirmedDestination:true,generation}`. Same exact object on retry. Receipt GET `/{id}/submissions/{submissionId}`.
- Receipt: `{submissionId,status:'accepted'|'queued'|'running'|'completed'|'failed'|'unknown'|'blocked',promptDelivery?:string,replyDelivery?:string}`. Missing/failed receipt is unknown, never automatic re-submit. Receipt status is independent of external delivery.

Compose requires mode=shared, nonempty authoritative destination label, generation, nonhistorical detail. Default/malformed/missing capability fails closed. First-send confirmation is scoped to ID+generation+destination and held in memory. Pending submission metadata (ID/session/generation only, never text) is saved to sessionStorage before POST. In-flight text is memory-only; refresh recovers via receipt, never reconstructs/resends body.

Polling detail/history is safe fallback, no guessed event vocabulary or SSE. No optimistic transcript bubbles: pending receipts are separate from canonical stored messages. No file probes or recommendation actions in Telegram history. Errors shown are generic, not raw upstream errors.

Context measurement is explicitly current context occupancy, not accumulated billing: `{usedTokens:number|null,limitTokens:number|null,model:string|null,measuredAt:string|null,quality:'measured'|'estimated'|'unknown',basis:'current'|'previous-turn',generation?:string}`. Absent verified measurements display unknown. UI invalidates percentage for model/generation mismatch or stale timestamps.

Other agents may finalize history DTOs differently; UI adapters will align before completion. No writable release claim is made by these components.
