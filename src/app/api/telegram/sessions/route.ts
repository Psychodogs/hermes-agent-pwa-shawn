import { listTelegramSessions } from "@/lib/telegram-history";
import { telegramHistoryResponse } from "@/lib/telegram-history-http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return telegramHistoryResponse(request, true, listTelegramSessions);
}
