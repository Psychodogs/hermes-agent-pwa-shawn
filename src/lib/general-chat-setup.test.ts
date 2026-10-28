import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { CleanupSession } from "./general-chat-setup";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-general-chat-"));
process.env.DB_PATH = path.join(directory, "state.db");

const { client } = vi.hoisted(() => ({
  client: {
    deleteSession: vi.fn<(id: string) => Promise<object>>(async () => ({})),
    createSession: vi.fn(async () => ({})),
    getSession: vi.fn(async () => ({})),
  },
}));

vi.mock("./api-changes", () => ({ publishChange: vi.fn() }));
vi.mock("./bots", () => ({
  botName: vi.fn(() => null),
  hermesForProject: vi.fn(() => client),
  hermesFor: vi.fn(() => client),
  listBots: vi.fn(async () => []),
  ensureBotChat: vi.fn(),
  BOT_CHAT_TITLE: "Bot Chat",
}));

type Setup = typeof import("./general-chat-setup");
let setup: Setup;
let db: typeof import("./db").db;

beforeAll(async () => {
  db = (await import("./db")).db;
  setup = await import("./general-chat-setup");
});

afterAll(() => {
  db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

function row(
  session_id: string,
  project_id: string,
  extra: Partial<CleanupSession> = {},
): CleanupSession {
  return {
    session_id,
    project_id,
    parent_session_id: null,
    kind: "chat",
    bot_chat: 0,
    archived: 0,
    ...extra,
  };
}

describe("planGeneralCleanup", () => {
  const general = { projectId: "general", sessionId: "g-main" };

  it("deletes inboxes, discussions with their branches, and General's other threads", () => {
    const sessions = [
      row("g-main", "general"),
      row("g-old", "general"),
      row("g-branch", "general", { parent_session_id: "g-main" }),
      row("a-chat", "a"),
      row("a-inbox", "a", { kind: "scheduled" }),
      row("a-reply", "a"),
      row("a-reply-branch", "a", { parent_session_id: "a-reply" }),
    ];
    const plan = setup.planGeneralCleanup(sessions, new Set(["a-reply"]), general);

    expect(plan.deletions.get("general")?.sort()).toEqual(["g-branch", "g-old"]);
    const a = plan.deletions.get("a")!;
    expect([...a].sort()).toEqual(["a-inbox", "a-reply", "a-reply-branch"]);
    // children before parents, so upstream deletes never orphan a branch
    expect(a.indexOf("a-reply-branch")).toBeLessThan(a.indexOf("a-reply"));
    expect(plan.needsRoot).toEqual([]);
  });

  it("never deletes the survivor or a Bot Chat", () => {
    const sessions = [
      row("g-main", "general"),
      row("bot", "general", { bot_chat: 1 }),
    ];
    const plan = setup.planGeneralCleanup(sessions, new Set(), general);
    expect(plan.deletions.size).toBe(0);
  });

  it("asks for a fresh chat where cleanup would leave a project with none", () => {
    const sessions = [
      row("g-main", "general"),
      row("b-inbox", "b", { kind: "scheduled" }),
      row("b-reply", "b"),
      row("b-archived", "b", { archived: 1 }),
    ];
    const plan = setup.planGeneralCleanup(sessions, new Set(["b-reply"]), general);
    expect(plan.needsRoot).toEqual(["b"]);
  });
});

describe("migrateScheduledToGeneral", () => {
  it("re-homes every report into General's one chat and deletes the old threads", async () => {
    db.exec(`
      INSERT INTO projects (id, name, session_id, created_at, last_active_at)
        VALUES ('general', 'General', 'g-main', 1, 1),
               ('work', 'Work', 'w-reply', 1, 1);
      INSERT INTO project_sessions
        (session_id, project_id, title, parent_session_id, created_at, last_active_at, archived, kind)
        VALUES ('g-main', 'general', 'General', NULL, 1, 5, 0, 'chat'),
               ('g-extra', 'general', 'Old', NULL, 1, 2, 0, 'chat'),
               ('g-inbox', 'general', 'Scheduled', NULL, 1, 9, 0, 'scheduled'),
               ('w-chat', 'work', 'Chat', NULL, 1, 3, 0, 'chat'),
               ('w-inbox', 'work', 'Scheduled', NULL, 1, 4, 0, 'scheduled'),
               ('w-reply', 'work', 'Reply', NULL, 1, 8, 0, 'chat'),
               ('w-reply-branch', 'work', 'Reply branch', 'w-reply', 1, 8, 0, 'chat');
      INSERT INTO cron_deliveries
        (id, job_id, project_id, session_id, job_name, status, body, source_path, ts)
        VALUES ('d1', 'job-a', 'work', 'w-inbox', 'A', 'ok', 'first', '/a/1.md', 10),
               ('d2', 'job-b', 'general', 'g-inbox', 'B', 'ok', 'second', '/b/1.md', 20);
      INSERT INTO cron_discussions (session_id, delivery_id, created_at)
        VALUES ('w-reply', 'd1', 30);
      INSERT INTO cron_bindings (job_id, project_id, last_seen_at, created_at)
        VALUES ('job-a', 'work', '/a/1.md', 1);
    `);

    await setup.migrateScheduledToGeneral();

    const { generalChat } = await import("./general-chat");
    expect(generalChat()).toEqual({ projectId: "general", sessionId: "g-main" });

    expect(
      db.prepare(`SELECT id, project_id, session_id FROM cron_deliveries ORDER BY ts`).all(),
    ).toEqual([
      { id: "d1", project_id: "general", session_id: "g-main" },
      { id: "d2", project_id: "general", session_id: "g-main" },
    ]);
    expect(db.prepare(`SELECT project_id FROM cron_bindings`).all()).toEqual([
      { project_id: "general" },
    ]);
    expect(
      db.prepare(`SELECT session_id FROM project_sessions ORDER BY session_id`).all(),
    ).toEqual([{ session_id: "g-main" }, { session_id: "w-chat" }]);
    expect(db.prepare(`SELECT COUNT(*) AS count FROM cron_discussions`).get()).toEqual({
      count: 0,
    });
    // the legacy pointer named a deleted thread, so it moves to what is left
    expect(db.prepare(`SELECT session_id FROM projects WHERE id = 'work'`).get()).toEqual({
      session_id: "w-chat",
    });

    const deleted = client.deleteSession.mock.calls.map((call) => call[0]).sort();
    expect(deleted).toEqual(["g-extra", "g-inbox", "w-inbox", "w-reply", "w-reply-branch"]);

    // Once only: a second pass touches nothing upstream.
    client.deleteSession.mockClear();
    await setup.migrateScheduledToGeneral();
    expect(client.deleteSession).not.toHaveBeenCalled();
  });

  it("keeps going past a project whose gateway refuses, and retries it later", async () => {
    db.exec(`
      DELETE FROM app_settings WHERE key = 'scheduled_general_migrated';
      INSERT INTO projects (id, name, session_id, created_at, last_active_at)
        VALUES ('bot', 'Bot', 'bot-chat', 1, 1), ('other', 'Other', 'o-chat', 1, 1);
      INSERT INTO project_sessions
        (session_id, project_id, title, parent_session_id, created_at, last_active_at, archived, kind)
        VALUES ('bot-chat', 'bot', 'Chat', NULL, 1, 1, 0, 'chat'),
               ('bot-inbox', 'bot', 'Scheduled', NULL, 1, 1, 0, 'scheduled'),
               ('o-chat', 'other', 'Chat', NULL, 1, 1, 0, 'chat'),
               ('o-inbox', 'other', 'Scheduled', NULL, 1, 1, 0, 'scheduled');
    `);
    client.deleteSession.mockImplementation(async (id: string) => {
      if (id.startsWith("bot-")) throw new Error("401 from the Bot's gateway");
      return {};
    });
    const sessionIds = () =>
      (db.prepare(`SELECT session_id FROM project_sessions WHERE kind = 'scheduled'`).all() as {
        session_id: string;
      }[]).map((row) => row.session_id);
    const migrated = () =>
      db.prepare(`SELECT value FROM app_settings WHERE key = 'scheduled_general_migrated'`).get();

    await setup.migrateScheduledToGeneral();
    expect(sessionIds()).toEqual(["bot-inbox"]);
    expect(migrated()).toBeUndefined();

    client.deleteSession.mockImplementation(async () => ({}));
    await setup.migrateScheduledToGeneral();
    expect(sessionIds()).toEqual([]);
    expect(migrated()).toEqual({ value: "1" });
  });
});
