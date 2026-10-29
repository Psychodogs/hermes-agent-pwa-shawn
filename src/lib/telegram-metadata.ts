import Database from "better-sqlite3";

export interface TelegramMetadata {
  displayName: string | null;
  chatType: "private" | "group" | "supergroup" | "channel" | null;
}
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
      const chatType = row.chat_type === "private" || row.chat_type === "group" || row.chat_type === "supergroup" || row.chat_type === "channel" ? row.chat_type : null;
      result.set(id, { displayName: typeof row.display_name === "string" ? row.display_name.slice(0, 256) : null, chatType });
    }
    return result;
  } catch {
    // Missing file/schema, locks, and permission errors are optional enrichment failure.
    return new Map();
  } finally { db?.close(); }
}
