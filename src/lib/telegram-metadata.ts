import Database from "better-sqlite3";
import type { TelegramDestination } from "./telegram-types";

export interface TelegramMetadata {
  displayName: string | null;
  // Hermes stores "dm" | "group" | "channel" | "thread" (gateway/session.py); Telegram forums normalize to "forum".
  chatType: "private" | "dm" | "group" | "supergroup" | "forum" | "channel" | null;
}
const CHAT_TYPES = new Set(["private", "dm", "group", "supergroup", "forum", "channel"]);
/** Optional enrichment ONLY. Callers must authorize IDs over REST first.
 * Never use this adapter for transcript reads, routing, or authorization. */
export function readTelegramMetadata(databasePath: string, authorizedSessionIds: readonly string[]): Map<string, TelegramMetadata> {
  const result = new Map<string, TelegramMetadata>();
  if (!authorizedSessionIds.length || authorizedSessionIds.length > 1000) return result;
  let db: Database.Database | undefined;
  try {
    db = new Database(databasePath, { readonly: true, fileMustExist: true, timeout: 100 });
    db.pragma("query_only = ON");
    const query = db.prepare("SELECT display_name, chat_type FROM sessions WHERE id = ? AND source = 'telegram'");
    for (const id of new Set(authorizedSessionIds)) {
      const row = query.get(id) as { display_name: unknown; chat_type: unknown } | undefined;
      if (!row) continue;
      const chatType = typeof row.chat_type === "string" && CHAT_TYPES.has(row.chat_type) ? row.chat_type as TelegramMetadata["chatType"] : null;
      result.set(id, { displayName: typeof row.display_name === "string" ? row.display_name.slice(0, 256) : null, chatType });
    }
    return result;
  } catch {
    // Missing file/schema, locks, and permission errors are optional enrichment failure.
    return new Map();
  } finally { db?.close(); }
}

/** Browser-safe projection: a display label and coarse kind only. No IDs, no origin JSON. */
export function toTelegramDestination(meta: TelegramMetadata | undefined): TelegramDestination | undefined {
  const label = meta?.displayName?.replace(/\s+/g, " ").trim();
  if (!meta || !label) return undefined;
  const kind = meta.chatType === "private" || meta.chatType === "dm" ? "private"
    : meta.chatType === "group" || meta.chatType === "supergroup" || meta.chatType === "forum" ? "group" : "unknown";
  return { label, kind };
}
