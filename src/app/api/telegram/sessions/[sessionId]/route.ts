import { getTelegramSession } from "@/lib/telegram-history";
import { telegramHistoryResponse, type TelegramHistoryRouteContext } from "@/lib/telegram-history-http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request, context: TelegramHistoryRouteContext) {
  return telegramHistoryResponse(request, false, async () => getTelegramSession((await context.params).sessionId));
}
