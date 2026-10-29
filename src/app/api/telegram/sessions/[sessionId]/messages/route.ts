import { getTelegramMessages } from "@/lib/telegram-history";
import { telegramHistoryResponse, type TelegramHistoryRouteContext } from "@/lib/telegram-history-http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request, context: TelegramHistoryRouteContext) {
  return telegramHistoryResponse(request, true, async options => getTelegramMessages((await context.params).sessionId, options));
}
