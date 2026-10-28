import {
  GET as messages,
  POST as send,
} from "@/app/api/projects/[id]/sessions/[sessionId]/messages/route";
import { error, fromLegacy, withDevice } from "@/lib/api/v1/http";
import { idempotentJson } from "@/lib/api/v1/idempotency";
import { generalSessionFor, markScheduledRead } from "@/lib/project-sessions";

type Context = { params: Promise<{ id: string; sessionId: string }> };

export async function GET(request: Request, ctx: Context) {
  return withDevice(request, async () => {
    const response = await fromLegacy(await messages(request, ctx));
    /* Serving the newest page of General's chat is reading its reports.
     * Android only ever marked reports read inside a `kind: "scheduled"`
     * session, which no longer exists, so without this its badge would never
     * clear. The web marks read explicitly, on a visible tab. */
    if (response.ok && !new URL(request.url).searchParams.has("cursor")) {
      const { id, sessionId } = await ctx.params;
      if (generalSessionFor(id)?.session_id === sessionId) markScheduledRead(id);
    }
    return response;
  });
}

export async function POST(request: Request, ctx: Context) {
  return withDevice(request, async (device) => {
    const body = await request.clone().json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return error(400, "invalid_request", "A JSON request body is required.");
    }
    const { id, sessionId } = await ctx.params;
    return idempotentJson(
      request,
      device.id,
      `POST:/api/v1/projects/${id}/sessions/${sessionId}/messages`,
      async () => fromLegacy(await send(request, ctx)),
    );
  });
}
