import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/* Bot Mode support: how a profile is addressed, which key it carries, and
 * how its canonical Bot Chat is found. The gateway is a stubbed fetch; the
 * profile tree is a real directory, because reading it is the point. */

const home = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-bots-"));
process.env.HERMES_HOME = home;
process.env.HERMES_API_URL = "http://gateway.test";
process.env.HERMES_API_KEY = "default-key";
process.env.DB_PATH = path.join(home, "pwa", "state.db");

let hermesModule: typeof import("./hermes");
let botsModule: typeof import("./bots");

function writeProfile(id: string, files: Record<string, string>) {
  const dir = path.join(home, "profiles", id);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
}

beforeAll(async () => {
  writeProfile("scribe", {
    "profile.yaml": "display_name: Scribe\nui_meta:\n  hermes-bots:\n    title: Dr. Scribe\n",
    ".env": "OTHER=1\nAPI_SERVER_KEY=\"scribe-key-0123456789\" # comment\n",
  });
  writeProfile("coder", { "config.yaml": "model: {}\n" });
  writeProfile("parked", { "config.yaml": "{}\n", "gateway.parked": "" });
  writeProfile("Not_Valid", { "config.yaml": "{}\n" });
  vi.resetModules();
  hermesModule = await import("./hermes");
  botsModule = await import("./bots");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  (await import("./db")).db.close();
  fs.rmSync(home, { recursive: true, force: true });
});

function stubFetch(handler: (url: string, init?: RequestInit) => Response) {
  const calls: { url: string; auth: string | null }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      calls.push({ url, auth: headers.get("Authorization") });
      return handler(url, init);
    }),
  );
  return calls;
}

describe("profile scope", () => {
  it("treats null, empty and default as the unprefixed default listener", () => {
    expect(hermesModule.normalizeProfile(null)).toBeNull();
    expect(hermesModule.normalizeProfile("")).toBeNull();
    expect(hermesModule.normalizeProfile("Default")).toBeNull();
    expect(hermesModule.hermesFor("default")).toBe(hermesModule.hermes);
  });

  it("normalises case and refuses anything that is not a profile id", () => {
    expect(hermesModule.normalizeProfile("Scribe")).toBe("scribe");
    expect(() => hermesModule.normalizeProfile("../etc")).toThrow();
    expect(() => hermesModule.normalizeProfile("a/b")).toThrow();
  });

  it("reads dotenv values with quotes, comments and export", () => {
    const read = hermesModule.readDotenvValue;
    expect(read("API_SERVER_KEY=abc # note", "API_SERVER_KEY")).toBe("abc");
    expect(read("export API_SERVER_KEY='a b'", "API_SERVER_KEY")).toBe("a b");
    expect(read("API_SERVER_KEY=one\nAPI_SERVER_KEY=two", "API_SERVER_KEY")).toBe("two");
    expect(read("# API_SERVER_KEY=x", "API_SERVER_KEY")).toBeNull();
  });

  it("sends a profile's requests to /p/<id>/ with that profile's own key", async () => {
    const calls = stubFetch(() => Response.json({ status: "ok" }));
    await hermesModule.hermesFor("scribe").getRun("run_1");
    await hermesModule.hermes.getRun("run_2");
    expect(calls).toEqual([
      { url: "http://gateway.test/p/scribe/v1/runs/run_1", auth: "Bearer scribe-key-0123456789" },
      { url: "http://gateway.test/v1/runs/run_2", auth: "Bearer default-key" },
    ]);
  });

  it("prefers HERMES_PROFILE_<NAME>_KEY over the profile's .env", async () => {
    process.env.HERMES_PROFILE_SCRIBE_KEY = "from-env";
    try {
      const calls = stubFetch(() => Response.json({}));
      await hermesModule.hermesFor("scribe").capabilities();
      expect(calls[0].auth).toBe("Bearer from-env");
    } finally {
      delete process.env.HERMES_PROFILE_SCRIBE_KEY;
    }
  });

  it("never falls back to the default key for a profile without one", async () => {
    const calls = stubFetch(() => Response.json({}));
    await expect(hermesModule.hermesFor("coder").capabilities()).rejects.toMatchObject({
      status: 401,
      body: { error: { code: "profile_key_missing" } },
    });
    expect(calls).toEqual([]);
  });
});

describe("roster", () => {
  it("reads the Bot Mode title before display_name", () => {
    expect(botsModule.readProfileMeta(path.join(home, "profiles", "scribe"))).toEqual({
      title: "Dr. Scribe",
      displayName: "Scribe",
      description: "",
      managed: true,
    });
    expect(botsModule.botName("scribe")).toBe("Dr. Scribe");
    expect(botsModule.botName("coder")).toBe("coder");
    expect(botsModule.botName(null)).toBeNull();
  });

  it("lists live profiles, probes each, and offers the default only under Bot Mode", async () => {
    stubFetch((url) => {
      if (url.endsWith("/p/coder/health")) return Response.json({ status: "ok" });
      if (url.endsWith("/p/scribe/health")) return Response.json({ status: "ok" });
      return Response.json({ features: {} });
    });
    const bots = await botsModule.listBots();
    expect(bots.map((bot) => [bot.id, bot.handle, bot.status])).toEqual([
      ["default", "hermes", "ready"],
      ["coder", "coder", "no_key"],
      ["scribe", "scribe", "ready"],
    ]);
  });

  it("reports a prefix the gateway does not serve", async () => {
    stubFetch((url) =>
      url.includes("/p/")
        ? Response.json({ error: "Unknown or unconfigured profile" }, { status: 404 })
        : Response.json({}),
    );
    const scribe = (await botsModule.listBots()).find((bot) => bot.id === "scribe");
    expect(scribe?.status).toBe("not_served");
  });
});

describe("Bot Chat", () => {
  it("reuses the existing canonical session by exact title", async () => {
    const calls = stubFetch(() =>
      Response.json({
        object: "list",
        data: [
          { id: "s-near", title: "Bot Chat (2)" },
          { id: "s-canonical", title: "Bot Chat" },
        ],
      }),
    );
    const id = await botsModule.ensureBotChat(hermesModule.hermesFor("scribe"));
    expect(id).toBe("s-canonical");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/p/scribe/api/sessions?");
    expect(calls[0].url).toContain("include_hidden=1");
  });

  it("creates it, titled exactly, when the Bot has none", async () => {
    const bodies: unknown[] = [];
    stubFetch((_url, init) => {
      if (init?.method === "POST") {
        bodies.push(JSON.parse(String(init.body)));
        return Response.json({ object: "hermes.session", session: { id: "s-new" } });
      }
      return Response.json({ object: "list", data: [] });
    });
    expect(await botsModule.ensureBotChat(hermesModule.hermesFor("scribe"))).toBe("s-new");
    expect(bodies).toEqual([{ title: "Bot Chat" }]);
  });

  it("reports a hidden Bot Chat instead of making a second one", async () => {
    stubFetch((_url, init) =>
      init?.method === "POST"
        ? Response.json({ error: { message: "title taken" } }, { status: 400 })
        : Response.json({ object: "list", data: [] }),
    );
    await expect(
      botsModule.ensureBotChat(hermesModule.hermesFor("scribe")),
    ).rejects.toMatchObject({ status: 409, body: { error: { code: "bot_chat_hidden" } } });
  });
});
