# Telegram history contract

Server-only implementation: `src/lib/telegram-history.ts`. Browser-safe types: `src/lib/telegram-types.ts`.

Exports (default profile only; optional client dependency is for server integration/tests):

```ts
listTelegramSessions(options?: { cursor?: string | null }): Promise<TelegramSessionPage>
getTelegramSession(sessionId: string): Promise<TelegramSession>
getTelegramMessages(sessionId: string, options?: { cursor?: string | null }): Promise<TelegramMessagePage>
createTelegramHistoryReader(client: TelegramHistoryClient): { listTelegramSessions, getTelegramSession, getTelegramMessages }
```

DTOs:
- TelegramSession: `{ id: string; title: string; source: "telegram"; startedAt: string | null; lastActiveAt: string | null; endedAt: string | null; readOnly: true }`
- TelegramSessionPage: `{ sessions: TelegramSession[]; nextCursor: string | null }`
- TelegramMessage: `{ id: string; role: "user" | "assistant"; content: string; content_format: "plain" | "markdown"; timestamp: string | null; provenance: "stored" }`
- TelegramMessagePage: `{ messages: TelegramMessage[]; nextCursor: string | null }`

Messages are chronological within each latest-first page. Prepend older pages, deduplicating by message ID. Empty visible pages MAY have a nextCursor (tool-only rows). Refresh discards old pages/cursors. `TelegramHistoryError.code` is `not_found`, `invalid_cursor`, `history_changed`, or `unavailable`; messages are sanitized. `history_changed` requires a fresh read without cursor. Cursors are opaque, authenticated, process-local and expire after 30 minutes; restart invalidates them. They contain no browser-readable physical-tip/routing IDs.

Exact requests use explicit limit=100, offset, order=latest, include_compacted=true. The ordinary Hermes `getMessages` method remains untouched. Upstream API returns pagination.returned raw API rows, not visible message count; tool-only pages must advance. Latest-page anchor detects new messages/compaction between pages and requires refresh rather than silently skipping. Upstream resolves compression ancestors; every row's session and resolved tip are source/visibility validated. Hidden, archived and internal-child sessions are unavailable; ended historical sessions remain read-only. No title lookup (upstream can resurrect archived Bot Chat on title GET).

Optional metadata: `readTelegramMetadata(databasePath, authorizedSessionIds)` returns `Map<string, TelegramMetadata>`; `{ displayName: string | null; chatType: "private" | "group" | "supergroup" | "channel" | null }`. Only IDs already authorized over the history API may be passed. Metadata never authorizes access/send and never includes chat/user/topic IDs or raw origin JSON. Adapter opens existing DB readonly/fileMustExist, query_only, bounded timeout; failure returns an empty Map. Not required for browsing.

No compose or native transport is enabled by these exports. Session IDs identify stored sessions only, never Telegram routing destinations. Responses must be no-store; do not cache transcripts in browser storage or service workers.
