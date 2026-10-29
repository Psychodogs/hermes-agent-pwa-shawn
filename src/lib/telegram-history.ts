import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import type { TelegramHistoryOptions, TelegramMessage, TelegramMessagePage, TelegramSession, TelegramSessionDetail } from "./telegram-types";
import { hermes, HermesApiError, HERMES_HOME, type HermesSession } from "./hermes";
import { readTelegramMetadata, toTelegramDestination, type TelegramMetadata } from "./telegram-metadata";
import { TELEGRAM_READ_ONLY_CAPABILITY } from "./telegram-readonly";

export interface TelegramHistoryClient {
  getSession(id: string): Promise<HermesSession>;
  listSessions(options: { limit: number; offset: number; source: string; includeChildren: boolean }): Promise<{ data: HermesSession[]; has_more: boolean }>;
  getMessagesPage(id: string, options: { limit: number; offset: number; order: "latest"; includeCompacted: boolean }): Promise<{ session_id: string; data: Record<string, unknown>[]; pagination: { limit: number; offset: number; order: string; returned: number } }>;
}
const PAGE_SIZE = 100;
const CURSOR_TTL = 30 * 60 * 1000;
interface CursorState { id: string; offset: number; anchor: string; expires: number; seen?: string[] }
function timestamp(value: unknown): string | null {
  const date = typeof value === "number" ? new Date(value * 1000) : typeof value === "string" ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
export class TelegramHistoryError extends Error {
  constructor(public code: "not_found" | "invalid_cursor" | "history_changed" | "unavailable") { super(code); }
}
function visible(session: HermesSession) {
  return session.source === "telegram" && !session.hidden && !session.archived && !session.is_internal_child;
}
function projectSession(session: HermesSession): TelegramSession {
  return { id: session.id, title: typeof session.title === "string" ? session.title : "Telegram conversation", source: "telegram", startedAt: timestamp(session.started_at), lastActiveAt: timestamp(session.last_active), endedAt: timestamp(session.ended_at), readOnly: true };
}
function projectMessages(rows: Record<string, unknown>[]): TelegramMessage[] {
  const seen = new Set<string>();
  const messages: TelegramMessage[] = [];
  for (const row of rows) {
    const metadata = row.display_metadata as Record<string, unknown> | undefined;
    if ((typeof row.id !== "string" || !row.id) && (typeof row.id !== "number" || !Number.isSafeInteger(row.id))) continue;
    if ((row.role !== "user" && row.role !== "assistant") || typeof row.content !== "string" || !row.content.trim() || row.display_kind || metadata?.model_only || row._compressed_summary || row.tool_calls || row.tool_call_id) continue;
    const id = String(row.id);
    if (seen.has(id)) continue;
    seen.add(id);
    messages.push({ id, role: row.role, content: row.content, content_format: row.role === "assistant" ? "markdown" : "plain", timestamp: timestamp(row.timestamp), provenance: "stored" });
  }
  return messages;
}
/** Optional enrichment. Called only with IDs the history API already authorized. */
export type TelegramMetadataLookup = (authorizedIds: string[]) => Map<string, TelegramMetadata>;
export function createTelegramHistoryReader(client: TelegramHistoryClient, lookup?: TelegramMetadataLookup) {
  function withDestinations(sessions: TelegramSession[]): TelegramSession[] {
    if (!lookup || !sessions.length) return sessions;
    let found: Map<string, TelegramMetadata>;
    try { found = lookup(sessions.map(s => s.id)); } catch { return sessions; }
    return sessions.map(session => {
      const destination = toTelegramDestination(found.get(session.id));
      return destination ? { ...session, destination } : session;
    });
  }
  // Opaque random capabilities, bounded and process-local. No transcript bodies retained.
  const cursors = new Map<string, CursorState>();
  function decode(cursor: string | null | undefined, id: string) {
    if (cursor == null) return undefined;
    const state = /^[A-Za-z0-9_-]{32}$/.test(cursor) ? cursors.get(cursor) : undefined;
    if (!state || state.id !== id || state.expires <= Date.now()) throw new TelegramHistoryError("invalid_cursor");
    return state;
  }
  function encode(state: Omit<CursorState, "expires">): string {
    for (const [key, value] of cursors) if (value.expires <= Date.now()) cursors.delete(key);
    while (cursors.size >= 2048) cursors.delete(cursors.keys().next().value!);
    const cursor = randomBytes(24).toString("base64url");
    cursors.set(cursor, { ...state, expires: Date.now() + CURSOR_TTL });
    return cursor;
  }
  async function authorize(id: string) {
    if (!/^[A-Za-z0-9_-]{1,256}$/.test(id)) throw new TelegramHistoryError("not_found");
    let session: HermesSession;
    try { session = await client.getSession(id); }
    catch (error) { throw new TelegramHistoryError(error instanceof HermesApiError && error.status === 404 ? "not_found" : "unavailable"); }
    if (!session || session.id !== id || !visible(session)) throw new TelegramHistoryError("not_found");
    return session;
  }
  async function readPage(id: string, offset: number) {
    const page = await client.getMessagesPage(id, { limit: PAGE_SIZE, offset, order: "latest", includeCompacted: true });
    if (!page || !Array.isArray(page.data) || page.data.some(row => !row || typeof row !== "object") || page.data.length > PAGE_SIZE || page.pagination?.returned !== page.data.length || page.pagination?.offset !== offset || page.pagination?.limit !== PAGE_SIZE || page.pagination?.order !== "latest" || typeof page.session_id !== "string") throw new TelegramHistoryError("unavailable");
    for (const sourceId of new Set([page.session_id, ...page.data.map(row => typeof row.session_id === "string" ? row.session_id : page.session_id)])) await authorize(sourceId);
    return page;
  }
  function fingerprint(page: Awaited<ReturnType<typeof readPage>>) {
    return createHash("sha256").update(JSON.stringify([page.session_id, page.data])).digest("hex");
  }
  return {
    async listTelegramSessions(options: TelegramHistoryOptions = {}) {
      const state = decode(options.cursor, "@list");
      const offset = state?.offset ?? 0;
      if (offset > 1_000_000) throw new TelegramHistoryError("invalid_cursor");
      const page = await client.listSessions({ limit: PAGE_SIZE, offset, source: "telegram", includeChildren: false });
      if (!page || !Array.isArray(page.data) || page.data.length > 1000 || typeof page.has_more !== "boolean") throw new TelegramHistoryError("unavailable");
      const seen = new Set(state?.seen ?? []);
      const sessions: TelegramSession[] = [];
      for (const row of page.data) {
        if (!row || typeof row.id !== "string" || !visible(row) || seen.has(row.id)) continue;
        try { sessions.push(projectSession(await authorize(row.id))); }
        catch (error) { if (error instanceof TelegramHistoryError && error.code === "not_found") continue; throw error; }
        seen.add(row.id);
      }
      if (seen.size > 10_000) throw new TelegramHistoryError("history_changed");
      return { sessions: withDestinations(sessions), nextCursor: page.has_more ? encode({ id: "@list", offset: offset + PAGE_SIZE, anchor: "", seen: [...seen] }) : null };
    },
    async getTelegramSession(id: string): Promise<TelegramSessionDetail> {
      const [session] = withDestinations([projectSession(await authorize(id))]);
      return { ...session, capability: { ...TELEGRAM_READ_ONLY_CAPABILITY } };
    },
    async getTelegramMessages(id: string, options: TelegramHistoryOptions = {}): Promise<TelegramMessagePage> {
      const state = decode(options.cursor, id);
      await authorize(id);
      const newest = await readPage(id, 0);
      const anchor = fingerprint(newest);
      if (state && state.anchor !== anchor) throw new TelegramHistoryError("history_changed");
      const offset = state?.offset ?? 0;
      const page = offset ? await readPage(id, offset) : newest;
      // Latest-first offsets shift when a writer appends. Fail closed, including races
      // during this read; the browser refreshes rather than silently losing a row.
      if (offset && (page.session_id !== newest.session_id || fingerprint(await readPage(id, 0)) !== anchor)) throw new TelegramHistoryError("history_changed");
      await authorize(id);
      return {
        messages: projectMessages(page.data),
        nextCursor: page.pagination.returned === PAGE_SIZE ? encode({ id, offset: offset + page.pagination.returned, anchor }) : null,
      };
    },
  };
}

// Default profile is the only exposed history scope. No browser-selected profile.
// Hermes keeps its session DB at <HERMES_HOME>/state.db (hermes_cli/approvals_suggest.py default_db_path).
const defaultReader = createTelegramHistoryReader(hermes, ids => readTelegramMetadata(path.join(HERMES_HOME, "state.db"), ids));
export const listTelegramSessions = defaultReader.listTelegramSessions;
export const getTelegramSession = defaultReader.getTelegramSession;
export const getTelegramMessages = defaultReader.getTelegramMessages;
