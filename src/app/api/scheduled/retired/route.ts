import { deleteRetiredSessions, retiredSessions } from "@/lib/general-chat-setup";

// Reads SQLite and takes no arguments: without this Next prerenders the GET
// at build time and serves that snapshot forever.
export const dynamic = "force-dynamic";

/** How many threads the Scheduled-inbox retirement hid but kept in Hermes. */
export async function GET() {
  let count = 0;
  for (const ids of retiredSessions().values()) count += ids.length;
  return Response.json({ count });
}

/** Deletes them for good, here and in Hermes. Explicit only; nothing calls it on its own. */
export async function DELETE() {
  const result = await deleteRetiredSessions();
  return Response.json(result, { status: result.failed > 0 ? 502 : 200 });
}
