import { randomUUID } from "node:crypto";
import { BOT_CHAT_TITLE, ensureBotChat, listBots } from "@/lib/bots";
import { db } from "@/lib/db";
import { hermesFor } from "@/lib/hermes";
import { PROJECT_TEMPLATES } from "@/lib/instructions";
import { createProjectSession, hermesErrorResponse } from "@/lib/project-session";
import { publishChange } from "@/lib/api-changes";
import { registerInitialSession } from "@/lib/project-sessions";
import { withProjectNavigation } from "@/lib/project-sessions";

// Live proxy: never cached. Without this Next prerenders a zero-argument
// GET handler at build time and serves the snapshot forever.
export const dynamic = "force-dynamic";


function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || randomUUID().slice(0, 8);
}

export async function GET(request: Request) {
  // ?archived=1 is what /settings uses to offer un-archiving; everything else
  // wants the live list, so that stays the default.
  const archived =
    new URL(request.url).searchParams.get("archived") === "1" ? 1 : 0;
  const projects = db
    .prepare(
      `SELECT * FROM projects WHERE archived = ?
       ORDER BY pinned DESC, last_active_at DESC`,
    )
    .all(archived) as { id: string }[];
  return Response.json({ projects: projects.map(withProjectNavigation) });
}

export async function POST(request: Request) {
  const body = await request.json();
  const name: string = body.name;
  if (!name || typeof name !== "string") {
    return Response.json({ error: "name is required" }, { status: 400 });
  }
  const cwd: string | null = typeof body.cwd === "string" ? body.cwd : null;
  const color: string | null = typeof body.color === "string" ? body.color : null;

  // A template only seeds the initial values; explicit fields win over it.
  const template = PROJECT_TEMPLATES.find((t) => t.id === body.template);
  const emoji: string | null =
    typeof body.emoji === "string" ? body.emoji : (template?.emoji ?? null);
  const instructions: string | null =
    typeof body.instructions === "string"
      ? body.instructions
      : (template?.instructions || null);
  const pinned = body.pinned ? 1 : 0;
  const skills: string[] = Array.isArray(body.skills)
    ? body.skills.filter((v: unknown): v is string => typeof v === "string" && !!v.trim())
    : [];

  const id = `proj_${slugify(name)}_${randomUUID().slice(0, 6)}`;

  // `bot` binds the project to a Hermes profile for life (see bots.ts).
  // "default" is meaningful only with botChat — the default profile's own Bot
  // Chat; without it, it is the same as no binding at all.
  const requestedBot =
    typeof body.bot === "string" && body.bot.trim() ? body.bot.trim().toLowerCase() : null;
  const botChat = requestedBot !== null && body.botChat !== false;
  let profile: string | null = null;
  if (requestedBot) {
    const bot = (await listBots()).find((candidate) => candidate.id === requestedBot);
    if (!bot) return Response.json({ error: "unknown bot" }, { status: 400 });
    if (bot.status !== "ready") {
      return Response.json({ error: `${bot.name} is not reachable (${bot.status})` }, { status: 409 });
    }
    // One project per Bot Chat: two would be two threads over one session.
    if (botChat && bot.botChatProjectId) {
      return Response.json(
        { error: `${bot.name}'s Bot Chat is already a project here`, projectId: bot.botChatProjectId },
        { status: 409 },
      );
    }
    profile = bot.id === "default" && !botChat ? null : bot.id;
  }
  const client = hermesFor(profile);

  let sessionId = id;
  let sessionTitle = name;
  try {
    if (botChat) {
      sessionId = await ensureBotChat(client);
      sessionTitle = BOT_CHAT_TITLE;
    } else {
      // Hermes titles are unique per profile and a deleted project keeps its
      // session, so the title may still be taken; the local name is unaffected.
      await createProjectSession(sessionId, name, client);
    }
  } catch (err) {
    return hermesErrorResponse(err);
  }
  // A Bot Chat the app forgot (an archived or purged project) may still have
  // a row here, and session_id is the table's key.
  if (botChat) {
    const stale = db
      .prepare(`SELECT project_id FROM project_sessions WHERE session_id = ?`)
      .get(sessionId) as { project_id: string } | undefined;
    if (stale) {
      return Response.json(
        { error: "That Bot Chat belongs to an archived project here — restore it from Settings", projectId: stale.project_id },
        { status: 409 },
      );
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
    color,
    cwd,
    instructions,
    pinned,
    skills.length ? JSON.stringify(skills) : null,
    sessionId,
    sessionId,
    now,
    now,
    profile,
  );
  registerInitialSession(id, sessionId, sessionTitle, now, botChat);
  publishChange("project.changed", { projectId: id });

  const project = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
  return Response.json({ project: withProjectNavigation(project as { id: string }) }, { status: 201 });
}
