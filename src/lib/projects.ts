import { randomUUID } from "node:crypto";
import { BOT_CHAT_TITLE, ensureBotChat, listBots } from "./bots";
import { db } from "./db";
import { hermesFor } from "./hermes";
import { PROJECT_TEMPLATES } from "./instructions";
import { createProjectSession } from "./project-session";
import { publishChange } from "./api-changes";
import { registerInitialSession } from "./project-sessions";

/** A refusal the route answers as-is; Hermes failures are rethrown raw. */
export class ProjectCreateError extends Error {
  constructor(
    readonly status: number,
    readonly body: Record<string, unknown>,
  ) {
    super(typeof body.error === "string" ? body.error : "project not created");
  }
}

export interface NewProject {
  name: string;
  cwd?: string | null;
  color?: string | null;
  emoji?: string | null;
  instructions?: string | null;
  pinned?: boolean;
  skills?: string[];
  template?: string;
  bot?: string | null;
  botChat?: boolean;
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || randomUUID().slice(0, 8);
}

/**
 * Creates the Hermes session and the local rows for a new project. Shared by
 * `POST /api/projects` and the General chat, which creates its own project
 * the first time a scheduled job needs somewhere to report.
 */
export async function createProject(input: NewProject): Promise<{ id: string }> {
  const { name } = input;
  // A template only seeds the initial values; explicit fields win over it.
  const template = PROJECT_TEMPLATES.find((t) => t.id === input.template);
  const emoji = input.emoji !== undefined ? input.emoji : (template?.emoji ?? null);
  const instructions =
    input.instructions !== undefined ? input.instructions : (template?.instructions || null);
  const skills = input.skills ?? [];

  const id = `proj_${slugify(name)}_${randomUUID().slice(0, 6)}`;

  // `bot` binds the project to a Hermes profile for life (see bots.ts).
  // "default" is meaningful only with botChat — the default profile's own Bot
  // Chat; without it, it is the same as no binding at all.
  const requestedBot = input.bot?.trim() ? input.bot.trim().toLowerCase() : null;
  const botChat = requestedBot !== null && input.botChat !== false;
  let profile: string | null = null;
  if (requestedBot) {
    const bot = (await listBots()).find((candidate) => candidate.id === requestedBot);
    if (!bot) throw new ProjectCreateError(400, { error: "unknown bot" });
    if (bot.status !== "ready") {
      throw new ProjectCreateError(409, { error: `${bot.name} is not reachable (${bot.status})` });
    }
    // One project per Bot Chat: two would be two threads over one session.
    if (botChat && bot.botChatProjectId) {
      throw new ProjectCreateError(409, {
        error: `${bot.name}'s Bot Chat is already a project here`,
        projectId: bot.botChatProjectId,
      });
    }
    profile = bot.id === "default" && !botChat ? null : bot.id;
  }
  const client = hermesFor(profile);

  let sessionId = id;
  let sessionTitle = name;
  if (botChat) {
    sessionId = await ensureBotChat(client);
    sessionTitle = BOT_CHAT_TITLE;
  } else {
    // Hermes titles are unique per profile and a deleted project keeps its
    // session, so the title may still be taken; the local name is unaffected.
    await createProjectSession(sessionId, name, client);
  }
  // A Bot Chat the app forgot (an archived or purged project) may still have
  // a row here, and session_id is the table's key.
  if (botChat) {
    const stale = db
      .prepare(`SELECT project_id FROM project_sessions WHERE session_id = ?`)
      .get(sessionId) as { project_id: string } | undefined;
    if (stale) {
      throw new ProjectCreateError(409, {
        error: "That Bot Chat belongs to an archived project here — restore it from Settings",
        projectId: stale.project_id,
      });
    }
  }

  const now = Date.now();
  db.prepare(
    `INSERT INTO projects
      (id, name, emoji, color, cwd, instructions, pinned, skills, session_id,
       last_chat_session_id, created_at, last_active_at, archived, profile)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
  ).run(
    id,
    name,
    emoji,
    input.color ?? null,
    input.cwd ?? null,
    instructions,
    input.pinned ? 1 : 0,
    skills.length ? JSON.stringify(skills) : null,
    sessionId,
    sessionId,
    now,
    now,
    profile,
  );
  registerInitialSession(id, sessionId, sessionTitle, now, botChat);
  publishChange("project.changed", { projectId: id });
  return { id };
}
