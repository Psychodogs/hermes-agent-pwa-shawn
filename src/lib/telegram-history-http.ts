import { TelegramHistoryError } from "./telegram-history";
import type { TelegramHistoryOptions } from "./telegram-types";

const headers = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };
export type TelegramHistoryRouteContext = { params: Promise<{ sessionId: string }> };
/** Browser GETs use the existing owner/tailnet boundary, never a profile override. */
export async function telegramHistoryResponse(request: Request, allowCursor: boolean, read: (options: TelegramHistoryOptions) => Promise<unknown>): Promise<Response> {
  try {
    const query = new URL(request.url).searchParams;
    for (const name of query.keys()) if (name !== "cursor" || !allowCursor) throw new TelegramHistoryError("invalid_cursor");
    if (query.getAll("cursor").length > 1) throw new TelegramHistoryError("invalid_cursor");
    return Response.json(await read({ cursor: query.get("cursor") }), { headers });
  } catch (error) {
    const code = error instanceof TelegramHistoryError ? error.code : "unavailable";
    const status = { not_found: 404, invalid_cursor: 400, history_changed: 409, unavailable: 503 }[code];
    const message = { not_found: "Telegram conversation not found.", invalid_cursor: "Invalid history request. Refresh and try again.", history_changed: "Conversation changed. Refresh history.", unavailable: "Telegram history is temporarily unavailable." }[code];
    return Response.json({ error: { code, message } }, { status, headers });
  }
}
