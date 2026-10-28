import { botModeManaged, listBots } from "@/lib/bots";

// Zero-argument GET: without this Next prerenders it at build time and serves
// the build-time snapshot forever (this shipped as a bug once, on /api/skills).
export const dynamic = "force-dynamic";

/**
 * The Bot roster — every Hermes profile on this host, each probed through the
 * gateway's `/p/<profile>/` mirror. `managed` says whether Bot Mode is set up
 * on this install, which is what gives a Bot Chat its `message_agent` tool.
 */
export async function GET() {
  const bots = await listBots();
  return Response.json({ bots, managed: botModeManaged() });
}
