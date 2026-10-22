import { isMessageContentFormat, type ThreadMessage } from "./chat-types";
import { messageTime } from "./message-normalization";

/** A history row as our messages routes return it — Hermes' shape, normalised. */
export interface RawThreadMessage {
  id?: string;
  role?: string;
  content?: unknown;
  content_format?: unknown;
  timestamp?: string | number;
  cron?: ThreadMessage["cron"];
}

const ROLES = new Set(["user", "assistant", "system", "cron"]);

/**
 * History as the thread renders it. Shared by the server loader and the
 * client's post-run refresh, so a reload and a refresh can never disagree
 * about which rows are shown. Tool rows and empty turns are dropped.
 */
export function toThreadMessages(raw: RawThreadMessage[]): ThreadMessage[] {
  return raw
    .filter(
      (m) =>
        typeof m.content === "string" &&
        m.content.length > 0 &&
        isMessageContentFormat(m.content_format) &&
        ROLES.has(m.role ?? ""),
    )
    .map((m, i) => {
      // Hermes stamps most rows; a scheduled report carries its own time.
      const createdAt = m.cron?.ts ?? messageTime({ role: m.role ?? "", timestamp: m.timestamp });
      return {
        id: m.id ?? `msg_${i}`,
        role: m.role as ThreadMessage["role"],
        content: m.content as string,
        contentFormat: m.content_format as ThreadMessage["contentFormat"],
        // Only cron messages carry it; the route omits the key otherwise.
        ...(m.cron ? { cron: m.cron } : {}),
        ...(createdAt ? { createdAt } : {}),
      };
    });
}
