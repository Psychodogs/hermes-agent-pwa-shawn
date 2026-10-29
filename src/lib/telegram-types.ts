// Browser-safe history DTOs. No routing identifiers or upstream object spreads.
export interface TelegramSession {
  id: string;
  title: string;
  source: "telegram";
  startedAt: string | null;
  lastActiveAt: string | null;
  endedAt: string | null;
  readOnly: true;
  /** Optional read-only metadata enrichment. Never contains chat, user or topic IDs. */
  destination?: TelegramDestination;
}
export interface TelegramDestination { label: string; kind: "private" | "group" | "unknown" }
export interface TelegramCapability { mode: "read-only"; canSubmit: false; reason: string }
export interface TelegramSessionDetail extends TelegramSession { capability: TelegramCapability }
export interface TelegramMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  content_format: "plain" | "markdown";
  timestamp: string | null;
  provenance: "stored";
}
export interface TelegramSessionPage { sessions: TelegramSession[]; nextCursor: string | null }
export interface TelegramMessagePage { messages: TelegramMessage[]; nextCursor: string | null }
export interface TelegramHistoryOptions { cursor?: string | null }
