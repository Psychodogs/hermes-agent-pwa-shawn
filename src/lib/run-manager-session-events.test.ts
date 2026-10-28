import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ db: { prepare: vi.fn(), transaction: vi.fn() } }));
vi.mock("./hermes", () => ({
  hermes: {},
  HermesApiError: class HermesApiError extends Error {},
}));
vi.mock("./instructions", () => ({ composeInstructions: vi.fn(), parseSkills: vi.fn() }));
vi.mock("./uploads", () => ({ outboxDirFor: vi.fn() }));
vi.mock("./push", () => ({ sendToAll: vi.fn() }));
vi.mock("./project-sessions", () => ({
  autoNameSession: vi.fn(),
  getProjectSession: vi.fn(),
}));

import {
  conversationHistoryFrom,
  runManager,
  scheduledReportHistoryEntry,
} from "./run-manager";

describe("session-scoped project events", () => {
  it("never sends a Scheduled delivery to another session subscriber", () => {
    const normal = vi.fn();
    const scheduled = vi.fn();
    const projectWide = vi.fn();
    const unsubscribeNormal = runManager.subscribeProject("project", normal, "chat");
    const unsubscribeScheduled = runManager.subscribeProject(
      "project",
      scheduled,
      "scheduled",
    );
    const unsubscribeProject = runManager.subscribeProject("project", projectWide);

    const event = { event: "cron.delivered", delivery: { id: "delivery" } };
    runManager.emitProject("project", "scheduled", event);

    expect(normal).not.toHaveBeenCalled();
    expect(scheduled).toHaveBeenCalledWith(event);
    expect(projectWide).toHaveBeenCalledWith(event);
    unsubscribeNormal();
    unsubscribeScheduled();
    unsubscribeProject();
  });

  it("formats the linked report as persistent assistant context", () => {
    expect(
      scheduledReportHistoryEntry({
        job_name: "Daily check",
        status: "failed",
        body: "Service unavailable",
        ts: Date.parse("2026-08-28T09:30:00.000Z"),
      }),
    ).toEqual({
      role: "assistant",
      content:
        '[failed scheduled report from "Daily check" at 2026-08-28T09:30:00.000Z]\nService unavailable',
    });
  });

  it("weaves General's reports into the history where they arrived", () => {
    const at = (iso: string) => Date.parse(iso);
    const report = (id: string, body: string, ts: number) => ({
      id,
      job_id: "job",
      project_id: "general",
      session_id: "general-chat",
      job_name: "Daily check",
      status: "ok" as const,
      body,
      source_path: `/${id}.md`,
      ts,
      read_at: null,
    });
    const history = conversationHistoryFrom(
      [
        { role: "user", content: "morning", timestamp: "2026-08-28T08:00:00Z" },
        { role: "assistant", content: "hi", timestamp: "2026-08-28T08:00:05Z" },
        { role: "tool", content: "ignored", timestamp: "2026-08-28T08:00:06Z" },
        { role: "user", content: "what did it say?", timestamp: "2026-08-28T10:00:00Z" },
      ],
      [
        report("r1", "all green", at("2026-08-28T09:00:00Z")),
        report("r2", "late", at("2026-08-28T11:00:00Z")),
      ],
    );
    // The report right after a reply is joined to it: two assistant entries
    // side by side break alternation for some providers.
    expect(history.map((entry) => entry.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(history[1].content).toBe(
      'hi\n\n[scheduled report from "Daily check" at 2026-08-28T09:00:00.000Z]\nall green',
    );
    expect(history[3].content.split("\n").pop()).toBe("late");
  });
});
