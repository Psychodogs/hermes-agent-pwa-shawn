import { hermesFor } from "@/lib/hermes";

// Zero-argument GET — see the note in /api/models.
export const dynamic = "force-dynamic";

/**
 * GET /v1/toolsets, verbatim. This is the deterministic answer to "what can
 * this agent actually do", which otherwise costs a turn of asking the model
 * and trusting what it says.
 */
export async function GET(request: Request) {
  try {
    // ?bot=<profile>: each Bot's config decides its own toolsets.
    const bot = new URL(request.url).searchParams.get("bot");
    const res = await hermesFor(bot).toolsets();
    return Response.json({ toolsets: res.data ?? [] });
  } catch {
    return Response.json({ toolsets: [], unavailable: true });
  }
}
