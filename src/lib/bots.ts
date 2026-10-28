import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { db } from "./db";
import {
  HERMES_HOME,
  HermesApiError,
  hermesFor,
  normalizeProfile,
  probeProfileHealth,
  profileApiKey,
  profileDir,
  type HermesClient,
} from "./hermes";

/* Hermes Bot Mode, as far as it reaches a phone.
 *
 * A Bot is a Hermes profile — its own config, memory, skills and session DB —
 * and the gateway serves every profile on the host at `/p/<profile>/`. That
 * is the whole of what Bot Mode adds over :8642; the roster, rooms, sections
 * and pets are Desktop UI. So a project here can be *bound* to a Bot: its
 * runs go to that profile, and its first chat can be the Bot's canonical
 * "Bot Chat" — the one session Hermes gives the roster and `message_agent`.
 *
 * There is no endpoint that lists profiles, so the roster is read off disk
 * (this app runs on the gateway's host) and every entry is probed over HTTP
 * before it is offered. A real request is the only honest check: nothing in
 * /v1/capabilities says whether the prefix is served or the key works. */

/** The one title Hermes gives the Bot Mode protocol and `message_agent` (tools/bot_mode_probe.py). */
export const BOT_CHAT_TITLE = "Bot Chat";

/** Bot Mode's handle for the default profile, unless a real profile holds that name. */
const DEFAULT_HANDLE = "hermes";

export type BotStatus =
  /** reachable at /p/<id>/ with a working key */
  | "ready"
  /** the profile has no API_SERVER_KEY of its own, so the gateway would 401 it */
  | "no_key"
  /** it may have one, but this app's user can't read the profile's .env (0600) */
  | "key_unreadable"
  /** the key we found is not the one the gateway expects */
  | "bad_key"
  /** the gateway answers 404 for the prefix: parked, standalone or not multiplexed */
  | "not_served"
  /** the gateway did not answer at all */
  | "unreachable";

export interface Bot {
  /** canonical profile id; "default" for the gateway's own profile */
  id: string;
  /** the @handle Bot Mode uses for it */
  handle: string;
  /** Bot Mode title, else display_name, else the id */
  name: string;
  description: string | null;
  /** profile.yaml carries ui_meta['hermes-bots'] — set up by the Desktop's Bot Mode */
  managed: boolean;
  status: BotStatus;
  /** the project here that already holds this Bot's Bot Chat, if any */
  botChatProjectId: string | null;
}

interface ProfileMeta {
  title: string;
  displayName: string;
  description: string;
  managed: boolean;
}

const metaCache = new Map<string, { mtimeMs: number; meta: ProfileMeta }>();

/** profile.yaml, read the way `read_profile_meta` reads it. Never throws. */
export function readProfileMeta(dir: string): ProfileMeta {
  const file = path.join(dir, "profile.yaml");
  const empty = { title: "", displayName: "", description: "", managed: false };
  let mtimeMs: number;
  try {
    mtimeMs = fs.statSync(file).mtimeMs;
  } catch {
    return empty;
  }
  const cached = metaCache.get(file);
  if (cached && cached.mtimeMs === mtimeMs) return cached.meta;
  let meta = empty;
  try {
    const data = YAML.parse(fs.readFileSync(file, "utf8")) as unknown;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const record = data as Record<string, unknown>;
      const uiMeta = record.ui_meta as Record<string, unknown> | undefined;
      const bots =
        uiMeta && typeof uiMeta === "object" ? uiMeta["hermes-bots"] : undefined;
      const botMeta =
        bots && typeof bots === "object" && !Array.isArray(bots)
          ? (bots as Record<string, unknown>)
          : null;
      meta = {
        title: String(botMeta?.title ?? "").trim(),
        displayName: String(record.display_name ?? "").trim(),
        description: String(record.description ?? "").trim(),
        managed: botMeta !== null,
      };
    }
  } catch {
    meta = empty; // a corrupt profile.yaml must not break the roster
  }
  metaCache.set(file, { mtimeMs, meta });
  return meta;
}

/** Named profiles on disk: valid ids, a profile.yaml or config.yaml, not parked. */
function namedProfileIds(): string[] {
  const root = path.join(HERMES_HOME, "profiles");
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .map((entry) => entry.name)
    .filter((name) => {
      try {
        if (normalizeProfile(name) !== name) return false;
      } catch {
        return false;
      }
      const dir = path.join(root, name);
      // `hermes -p X gateway stop` parks a profile: the host stops serving it.
      if (fs.existsSync(path.join(dir, "gateway.parked"))) return false;
      return (
        fs.existsSync(path.join(dir, "profile.yaml")) ||
        fs.existsSync(path.join(dir, "config.yaml"))
      );
    })
    .sort();
}

/** The display name a project bound to `profile` shows for its agent. */
export function botName(profile: string | null): string | null {
  if (!profile) return null;
  const id = normalizeProfile(profile);
  const meta = readProfileMeta(profileDir(id));
  return meta.title || meta.displayName || (id ?? "Hermes");
}

function botChatHolders(): Map<string, string> {
  const rows = db
    .prepare(
      `SELECT COALESCE(p.profile, 'default') AS profile, p.id AS project_id
         FROM project_sessions ps JOIN projects p ON p.id = ps.project_id
        WHERE ps.bot_chat = 1 AND p.archived = 0`,
    )
    .all() as { profile: string; project_id: string }[];
  return new Map(rows.map((row) => [row.profile, row.project_id]));
}

async function probe(id: string): Promise<BotStatus> {
  if (id === "default") {
    try {
      await hermesFor(null).capabilities();
      return "ready";
    } catch (error) {
      return error instanceof HermesApiError && error.status === 401 ? "bad_key" : "unreachable";
    }
  }
  const health = await probeProfileHealth(id);
  if (health === 0) return "unreachable";
  if (health === 404) return "not_served";
  if (!profileApiKey(id)) {
    try {
      fs.accessSync(path.join(profileDir(id), ".env"), fs.constants.R_OK);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EACCES") return "key_unreadable";
    }
    return "no_key";
  }
  try {
    await hermesFor(id).capabilities();
    return "ready";
  } catch (error) {
    if (error instanceof HermesApiError) {
      if (error.status === 401) return "bad_key";
      if (error.status === 404) return "not_served";
    }
    return "unreachable";
  }
}

/**
 * The roster: the default profile plus every named profile on the host, each
 * probed. The default only counts as a Bot when Bot Mode is set up on this
 * install (some profile is managed) — without that it is just "the agent",
 * which every unbound project already talks to.
 */
export async function listBots(): Promise<Bot[]> {
  const ids = namedProfileIds();
  const metas = new Map(ids.map((id) => [id, readProfileMeta(profileDir(id))]));
  const defaultMeta = readProfileMeta(HERMES_HOME);
  const installManaged =
    defaultMeta.managed || [...metas.values()].some((meta) => meta.managed);
  const holders = botChatHolders();

  const candidates: { id: string; meta: ProfileMeta }[] = [
    ...(installManaged ? [{ id: "default", meta: defaultMeta }] : []),
    ...ids.map((id) => ({ id, meta: metas.get(id)! })),
  ];
  const statuses = await Promise.all(candidates.map(({ id }) => probe(id)));
  return candidates.map(({ id, meta }, index) => ({
    id,
    handle: id === "default" && !ids.includes(DEFAULT_HANDLE) ? DEFAULT_HANDLE : id,
    name: meta.title || meta.displayName || (id === "default" ? "Hermes" : id),
    description: meta.description || null,
    managed: meta.managed,
    status: statuses[index],
    botChatProjectId: holders.get(id) ?? null,
  }));
}

/** Whether Hermes gives a canonical Bot Chat its protocol section (any profile managed). */
export function botModeManaged(): boolean {
  if (readProfileMeta(HERMES_HOME).managed) return true;
  return namedProfileIds().some((id) => readProfileMeta(profileDir(id)).managed);
}

/**
 * The Bot's canonical Bot Chat session id, created when it has none — the
 * same resolution `hermes peer dm` does. The title is never disambiguated:
 * "Bot Chat (2)" would be an ordinary session without the protocol, so a
 * collision is reported rather than worked around.
 */
export async function ensureBotChat(client: HermesClient): Promise<string> {
  const listing = await client.findSessionsByTitle(BOT_CHAT_TITLE);
  const existing = listing.data.find(
    (session) => (session.title ?? "").trim() === BOT_CHAT_TITLE,
  );
  if (existing) return existing.id;
  try {
    const created = await client.createTitledSession(BOT_CHAT_TITLE);
    if (created?.id) return created.id;
  } catch (error) {
    // An older gateway can't see a hidden Bot Chat, so the create collides
    // with UNIQUE(title). Say so; making a second one is never the answer.
    if (error instanceof HermesApiError && error.status === 400) {
      throw new HermesApiError(409, {
        error: {
          message:
            "This Bot already has a Bot Chat that its gateway is hiding. " +
            "Update Hermes, or unhide that session, and try again.",
          code: "bot_chat_hidden",
        },
      });
    }
    throw error;
  }
  throw new Error("Hermes did not return an id for the new Bot Chat");
}

/** The client a project's sessions live behind. */
export function hermesForProject(projectId: string): HermesClient {
  const row = db.prepare(`SELECT profile FROM projects WHERE id = ?`).get(projectId) as
    | { profile: string | null }
    | undefined;
  return hermesFor(row?.profile ?? null);
}
