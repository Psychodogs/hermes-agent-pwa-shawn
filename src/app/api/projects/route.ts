import { db } from "@/lib/db";
import { hermesErrorResponse } from "@/lib/project-session";
import { createProject, ProjectCreateError } from "@/lib/projects";
import { withProjectNavigation } from "@/lib/project-sessions";

// Live proxy: never cached. Without this Next prerenders a zero-argument
// GET handler at build time and serves the snapshot forever.
export const dynamic = "force-dynamic";

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

  let id: string;
  try {
    ({ id } = await createProject({
      name,
      cwd: typeof body.cwd === "string" ? body.cwd : null,
      color: typeof body.color === "string" ? body.color : null,
      emoji: typeof body.emoji === "string" ? body.emoji : undefined,
      instructions: typeof body.instructions === "string" ? body.instructions : undefined,
      pinned: Boolean(body.pinned),
      skills: Array.isArray(body.skills)
        ? body.skills.filter((v: unknown): v is string => typeof v === "string" && !!v.trim())
        : [],
      template: typeof body.template === "string" ? body.template : undefined,
      bot: typeof body.bot === "string" ? body.bot : null,
      botChat: body.botChat !== false,
    }));
  } catch (err) {
    if (err instanceof ProjectCreateError) {
      return Response.json(err.body, { status: err.status });
    }
    return hermesErrorResponse(err);
  }

  const project = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
  return Response.json({ project: withProjectNavigation(project as { id: string }) }, { status: 201 });
}
