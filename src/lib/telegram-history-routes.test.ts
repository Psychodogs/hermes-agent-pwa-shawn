import { beforeEach, describe, expect, it, vi } from "vitest";
import { hermes } from "./hermes";
import { GET as list } from "../app/api/telegram/sessions/route";
import { GET as detail } from "../app/api/telegram/sessions/[sessionId]/route";
import { GET as messages } from "../app/api/telegram/sessions/[sessionId]/messages/route";
vi.mock("./hermes", async importOriginal => ({ ...await importOriginal<typeof import("./hermes")>(), hermes: { getSession: vi.fn(), listSessions: vi.fn(), getMessagesPage: vi.fn() } }));
const context = { params: Promise.resolve({ sessionId: "root" }) };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(hermes.getSession).mockResolvedValue({ id: "root", source: "telegram", title: "Chat" });
  vi.mocked(hermes.listSessions).mockResolvedValue({ object: "list", data: [{ id: "root", source: "telegram" }], has_more: false, limit: 100, offset: 0 });
  vi.mocked(hermes.getMessagesPage).mockResolvedValue({ session_id: "root", data: [{ id: 1, role: "user", content: "hello", reasoning: "secret" }], pagination: { limit: 100, offset: 0, order: "latest", returned: 1 } });
});
describe("Telegram history GET boundary", () => {
  it("returns safe no-store list, session and messages without native attach", async () => {
    const responses = [await list(new Request("http://localhost/api/telegram/sessions")), await detail(new Request("http://localhost/api/telegram/sessions/root"), context), await messages(new Request("http://localhost/api/telegram/sessions/root/messages"), context)];
    for (const res of responses) { expect(res.status).toBe(200); expect(res.headers.get("cache-control")).toContain("no-store"); expect(await res.clone().text()).not.toContain("secret"); }
    expect((await responses[0].json()).sessions[0].id).toBe("root");
    expect((await responses[1].json()).id).toBe("root");
    expect((await responses[2].json()).messages[0].content).toBe("hello");
  });
  it("denies hidden sessions on exact-id and message reads", async () => {
    vi.mocked(hermes.getSession).mockResolvedValue({ id: "root", source: "telegram", hidden: true });
    for (const handler of [detail, messages]) expect((await handler(new Request("http://localhost/"), context)).status).toBe(404);
    expect(hermes.getMessagesPage).not.toHaveBeenCalled();
  });
  it("rejects profile overrides, malformed and duplicate cursors", async () => {
    for (const query of ["profile=other", "cursor=invalid", "cursor=x&cursor=y", "cursor="]) {
      const res = await messages(new Request(`http://localhost/api/telegram/sessions/root/messages?${query}`), context);
      expect(res.status).toBe(400); expect(res.headers.get("cache-control")).toContain("no-store");
    }
  });
  it("never leaks upstream error details", async () => {
    vi.mocked(hermes.listSessions).mockRejectedValue(new Error("secret upstream token"));
    const res = await list(new Request("http://localhost/api/telegram/sessions"));
    expect(res.status).toBe(503); expect(await res.text()).toBe('{"error":{"code":"unavailable","message":"Telegram history is temporarily unavailable."}}');
  });
});
