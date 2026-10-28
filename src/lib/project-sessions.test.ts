import { beforeEach, describe, expect, it, vi } from "vitest";

const { generalChat, prepare, publishChange, transaction } = vi.hoisted(() => ({
  generalChat: vi.fn(),
  prepare: vi.fn(),
  publishChange: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("./api-changes", () => ({ publishChange }));
vi.mock("./db", () => ({ db: { prepare, transaction } }));
vi.mock("./hermes", () => ({
  hermes: {},
  HermesApiError: class HermesApiError extends Error {},
}));
vi.mock("./project-session", () => ({
  createProjectSession: vi.fn(),
  renameProjectSession: vi.fn(),
}));
vi.mock("./session-title", () => ({ titleFromPrompt: vi.fn() }));
vi.mock("./bots", () => ({ botName: vi.fn(() => null), hermesForProject: vi.fn() }));
vi.mock("./general-chat", () => ({ generalChat }));

import {
  markScheduledRead,
  projectEntrySession,
  selectProjectSession,
  withProjectNavigation,
  type ProjectSessionRow,
} from "./project-sessions";

function session(kind: "chat" | "scheduled", id = `session-${kind}`): ProjectSessionRow {
  return {
    session_id: id,
    project_id: "project-1",
    title: kind === "scheduled" ? "Scheduled" : "Chat",
    parent_session_id: null,
    created_at: 1,
    last_active_at: 2,
    archived: 0,
    kind,
    bot_chat: 0,
  };
}

describe("selectProjectSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records the last normal chat without broadcasting client navigation", () => {
    const selected = session("chat", "session-1");
    const update = vi.fn();
    prepare.mockImplementation((sql: string) =>
      sql.includes("SELECT * FROM project_sessions")
        ? { get: vi.fn().mockReturnValue(selected) }
        : { run: update },
    );

    expect(selectProjectSession("project-1", "session-1")).toBe(selected);
    expect(update).toHaveBeenCalledWith("session-1", expect.any(Number), "project-1");
    expect(transaction).not.toHaveBeenCalled();
    expect(publishChange).not.toHaveBeenCalled();
  });

  it("opens a project at its most recently active chat", () => {
    const chat = session("chat", "recent-chat");
    prepare.mockImplementation((sql: string) => {
      if (sql.includes("kind = 'chat'")) return { get: vi.fn().mockReturnValue(chat) };
      throw new Error(`unexpected SQL: ${sql}`);
    });

    expect(projectEntrySession("project-1")).toBe(chat);
  });
});

describe("General's unread reports", () => {
  const general = session("chat", "general-chat");

  beforeEach(() => {
    vi.clearAllMocks();
    generalChat.mockReturnValue({ projectId: "project-1", sessionId: general.session_id });
  });

  it("marks every unread report in General's chat and publishes the badge change", () => {
    const mark = vi.fn().mockReturnValue({ changes: 3 });
    prepare.mockImplementation((sql: string) =>
      sql.includes("SELECT * FROM project_sessions")
        ? { get: vi.fn().mockReturnValue(general) }
        : { run: mark },
    );

    expect(markScheduledRead("project-1")).toBe(3);
    expect(mark).toHaveBeenCalledWith(expect.any(Number), "project-1", general.session_id);
    expect(publishChange).toHaveBeenCalledWith("cron.read", {
      projectId: "project-1",
      sessionId: general.session_id,
    });
  });

  it("has nothing to mark in any other project", () => {
    expect(markScheduledRead("project-2")).toBe(0);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("flags General, and only General, with its chat and unread count", () => {
    prepare.mockImplementation((sql: string) =>
      sql.includes("COUNT(*) AS count")
        ? { get: vi.fn().mockReturnValue({ count: 2 }) }
        : { get: vi.fn().mockReturnValue(general) },
    );

    expect(withProjectNavigation({ id: "project-1" })).toMatchObject({
      general: true,
      scheduled_session_id: general.session_id,
      unread_scheduled_count: 2,
    });
    expect(withProjectNavigation({ id: "project-2" })).toMatchObject({
      general: false,
      scheduled_session_id: null,
      unread_scheduled_count: 0,
    });
  });
});
