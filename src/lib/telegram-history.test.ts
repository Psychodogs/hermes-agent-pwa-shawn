import { describe, it, expect, vi } from "vitest";
import { createTelegramHistoryReader } from "./telegram-history";
import { hermes } from "./hermes";

const session = (id = "root", extra = {}) => ({ id, source: "telegram", title: "Chat", started_at: 1, ...extra });
function client(rows: Record<string, unknown>[] = []) {
  return {
    getSession: vi.fn(async (id: string) => session(id)),
    listSessions: vi.fn(async () => ({ data: [session()], has_more: false, limit: 100, offset: 0, object: "list" as const })),
    getMessagesPage: vi.fn(async (_id: string, opts: { offset: number; limit: number }) => {
      const data = rows.slice().reverse().slice(opts.offset, opts.offset + opts.limit).reverse();
      return { session_id: "root", data, pagination: { limit: opts.limit, offset: opts.offset, order: "latest", returned: data.length } };
    }),
  };
}

describe("Telegram safe history", () => {
  it("lists only authorized sessions and deduplicates backfilled pins across pages", async () => {
    const api = client();
    api.listSessions.mockResolvedValueOnce({ data: [session("pin", { pinned: true }), session(), session("hidden", { hidden: true }), session("other", { source: "cli" })], has_more: true, limit: 100, offset: 0, object: "list" });
    api.listSessions.mockResolvedValueOnce({ data: [session("pin", { pinned: true }), session("older")], has_more: false, limit: 100, offset: 100, object: "list" });
    const reader = createTelegramHistoryReader(api);
    const first = await reader.listTelegramSessions();
    expect(first.sessions.map(s => s.id)).toEqual(["pin", "root"]);
    const second = await reader.listTelegramSessions({ cursor: first.nextCursor });
    expect(second.sessions.map(s => s.id)).toEqual(["older"]);
    expect(second.nextCursor).toBeNull();
    expect(api.listSessions).toHaveBeenLastCalledWith({ limit: 100, offset: 100, source: "telegram", includeChildren: false });
    await expect(reader.getTelegramMessages("root", { cursor: first.nextCursor })).rejects.toMatchObject({ code: "invalid_cursor" });
  });
  it("uses an explicit paged upstream GET without changing ordinary history requests", async () => {
    const fetchMock = vi.fn(async () => Response.json({ data: [] }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      await hermes.getMessagesPage("root", { offset: 500, limit: 100, order: "latest", includeCompacted: true });
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(new URL(url).searchParams.toString()).toBe("limit=100&offset=500&order=latest&include_compacted=true");
      expect(init.cache).toBe("no-store");
      await hermes.getMessages("root");
      expect((fetchMock.mock.calls[1] as unknown as [string])[0]).toMatch(/\/root\/messages$/);
    } finally { vi.unstubAllGlobals(); }
  });
  it("rejects stale cursors on append, compaction and expiry; binds cursors to session", async () => {
    const rows = Array.from({ length: 101 }, (_, id) => ({ id, role: "user", content: "hi" }));
    const api = client(rows), reader = createTelegramHistoryReader(api);
    const first = await reader.getTelegramMessages("root");
    await expect(reader.getTelegramMessages("other", { cursor: first.nextCursor })).rejects.toMatchObject({ code: "invalid_cursor" });
    await expect(reader.getTelegramMessages("root", { cursor: "../bad" })).rejects.toMatchObject({ code: "invalid_cursor" });
    rows.push({ id: 101, role: "user", content: "new" });
    await expect(reader.getTelegramMessages("root", { cursor: first.nextCursor })).rejects.toMatchObject({ code: "history_changed" });
    rows.pop();
    const original = api.getMessagesPage.getMockImplementation()!;
    api.getMessagesPage.mockImplementation(async (id, opts) => ({ ...await original(id, opts), session_id: "successor" }));
    await expect(reader.getTelegramMessages("root", { cursor: first.nextCursor })).rejects.toMatchObject({ code: "history_changed" });
    vi.useFakeTimers(); vi.setSystemTime(Date.now() + 31 * 60 * 1000);
    try { await expect(reader.getTelegramMessages("root", { cursor: first.nextCursor })).rejects.toMatchObject({ code: "invalid_cursor" }); }
    finally { vi.useRealTimers(); }
  });
  it("fails closed on malformed pagination and missing stable message IDs", async () => {
    const api = client([{ role: "user", content: "no id" }]);
    expect((await createTelegramHistoryReader(api).getTelegramMessages("root")).messages).toEqual([]);
    api.getMessagesPage.mockResolvedValue({ session_id: "root", data: [], pagination: { limit: 100, offset: 0, order: "latest", returned: 100 } });
    await expect(createTelegramHistoryReader(api).getTelegramMessages("root")).rejects.toMatchObject({ code: "unavailable" });
  });
  it("reads more than 500 raw rows, including tool-only pages", async () => {
    const rows = Array.from({ length: 601 }, (_, id) => ({ id, role: id >= 501 ? "tool" : "user", content: `row ${id}` }));
    const api = client(rows), reader = createTelegramHistoryReader(api);
    let cursor: string | null = null;
    const ids: string[] = [];
    do {
      const page = await reader.getTelegramMessages("root", { cursor });
      if (!cursor) { expect(page.messages).toEqual([]); expect(page.nextCursor).toBeTruthy(); }
      ids.push(...page.messages.map(m => m.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(new Set(ids).size).toBe(501);
    expect(api.getMessagesPage.mock.calls.some(([, opts]) => opts.offset === 600)).toBe(true);
  });
  it.each([{ source: "api_server" }, { hidden: true }, { archived: 1 }, { is_internal_child: true }])("denies unsafe session %j before history fetch", async extra => {
    const api = client(); api.getSession.mockResolvedValue(session("root", extra));
    await expect(createTelegramHistoryReader(api).getTelegramMessages("root")).rejects.toMatchObject({ code: "not_found" });
    expect(api.getMessagesPage).not.toHaveBeenCalled();
  });
  it("validates the resolved tip and every ancestor row source", async () => {
    const api = client([{ id: 1, role: "user", content: "secret", session_id: "foreign" }]);
    api.getSession.mockImplementation(async id => session(id, id === "foreign" ? { source: "api_server" } : {}));
    await expect(createTelegramHistoryReader(api).getTelegramMessages("root")).rejects.toMatchObject({ code: "not_found" });
    api.getMessagesPage.mockResolvedValue({ session_id: "foreign", data: [], pagination: { limit: 100, offset: 0, order: "latest", returned: 0 } });
    await expect(createTelegramHistoryReader(api).getTelegramMessages("root")).rejects.toMatchObject({ code: "not_found" });
  });
  it("returns ended historical sessions without private fields", async () => {
    const api = client(); api.getSession.mockResolvedValue(session("root", { ended_at: 2, user_id: "secret", chat_id: "private" }));
    expect(await createTelegramHistoryReader(api).getTelegramSession("root")).toEqual({ id: "root", title: "Chat", source: "telegram", startedAt: "1970-01-01T00:00:01.000Z", lastActiveAt: null, endedAt: "1970-01-01T00:00:02.000Z", readOnly: true });
  });
  it("excludes tool/system/reasoning/model-only and synthetic compaction rows", async () => {
    const unsafe = [
      { role: "system", content: "secret" }, { role: "tool", content: "secret" },
      { role: "assistant", content: "secret", display_kind: "hidden" },
      { role: "user", content: "secret", display_metadata: { model_only: true } },
      { role: "user", content: "secret", _compressed_summary: true },
      { role: "assistant", content: "secret", tool_calls: [{ name: "private" }] },
      { role: "assistant", content: [{ type: "reasoning", text: "secret" }] },
      { role: "assistant", content: "" },
    ].map((r, i) => ({ id: i, ...r }));
    expect((await createTelegramHistoryReader(client(unsafe)).getTelegramMessages("root")).messages).toEqual([]);
  });
  it("projects only public message fields", async () => {
    const api = client([{ id: 1, session_id: "root", role: "user", content: "hello", timestamp: 1, reasoning: "secret", user_id: "private" }]);
    const page = await createTelegramHistoryReader(api).getTelegramMessages("root");
    expect(page).toEqual({ messages: [{ id: "1", role: "user", content: "hello", content_format: "plain", timestamp: "1970-01-01T00:00:01.000Z", provenance: "stored" }], nextCursor: null });
  });
});
