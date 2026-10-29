import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readTelegramMetadata, toTelegramDestination } from "./telegram-metadata";
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "telegram-metadata-")); dirs.push(dir);
  const file = path.join(dir, "state.db");
  const db = new Database(file);
  db.exec("CREATE TABLE sessions (id TEXT PRIMARY KEY, source TEXT, display_name TEXT, chat_type TEXT, origin_json TEXT)");
  db.prepare("INSERT INTO sessions VALUES (?, ?, ?, ?, ?)").run("allowed", "telegram", "Friends", "supergroup", '{"chat_id":"private"}');
  db.prepare("INSERT INTO sessions VALUES (?, ?, ?, ?, ?)").run("other", "telegram", "Secret", "private", "{}");
  db.prepare("INSERT INTO sessions VALUES (?, ?, ?, ?, ?)").run("cli", "cli", "Not Telegram", "private", "{}");
  db.close(); return file;
}
describe("optional read-only Telegram metadata", () => {
  it("projects only metadata for API-authorized Telegram IDs, without changing the DB", () => {
    const file = fixture();
    expect([...readTelegramMetadata(file, ["allowed", "cli", "' OR 1=1 --"])]).toEqual([["allowed", { displayName: "Friends", chatType: "supergroup" }]]);
    const db = new Database(file, { readonly: true });
    expect(db.prepare("SELECT count(*) AS count FROM sessions").get()).toEqual({ count: 3 }); db.close();
  });
  it("falls back on missing paths and unsupported schemas without creating a DB", () => {
    const file = fixture(), missing = `${file}.missing`;
    expect(readTelegramMetadata(missing, ["allowed"]).size).toBe(0);
    expect(existsSync(missing)).toBe(false);
    const db = new Database(file); db.exec("DROP TABLE sessions"); db.close();
    expect(readTelegramMetadata(file, ["allowed"]).size).toBe(0);
  });
});
describe("destination projection", () => {
  it("maps Hermes chat types to coarse kinds and omits unusable labels", () => {
    expect(toTelegramDestination({ displayName: "  Alice  ", chatType: "dm" })).toEqual({ label: "Alice", kind: "private" });
    expect(toTelegramDestination({ displayName: "Crew", chatType: "forum" })).toEqual({ label: "Crew", kind: "group" });
    expect(toTelegramDestination({ displayName: "News", chatType: "channel" })).toEqual({ label: "News", kind: "unknown" });
    expect(toTelegramDestination({ displayName: " ", chatType: "group" })).toBeUndefined();
    expect(toTelegramDestination(undefined)).toBeUndefined();
  });
});
describe("temp DB end to end", () => {
  it("reads dm and group rows from a Hermes-shaped state.db", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "telegram-dest-")); dirs.push(dir);
    const file = path.join(dir, "state.db");
    const db = new Database(file);
    db.exec("CREATE TABLE sessions (id TEXT PRIMARY KEY, source TEXT, display_name TEXT, chat_type TEXT, origin_json TEXT)");
    db.prepare("INSERT INTO sessions VALUES (?, 'telegram', ?, ?, ?)").run("a", "Alice", "dm", '{"chat_id":"123","thread_id":"9"}');
    db.close();
    const meta = readTelegramMetadata(file, ["a"]);
    const dest = toTelegramDestination(meta.get("a"));
    expect(dest).toEqual({ label: "Alice", kind: "private" });
    expect(JSON.stringify(dest)).not.toMatch(/123|chat_id/);
  });
});
