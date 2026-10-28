import { generalSessionFor, markScheduledRead } from "@/lib/project-sessions";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, ctx: Context) {
  const { id } = await ctx.params;
  const session = generalSessionFor(id);
  if (!session) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ ok: true, markedRead: markScheduledRead(id) });
}
