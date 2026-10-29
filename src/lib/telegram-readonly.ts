import type { TelegramCapability } from "./telegram-types";

/** Web-app sending is not available yet. A later branch can replace this constant
 * with a real per-session capability assessment; consumers only read the DTO. */
export const TELEGRAM_READ_ONLY_CAPABILITY: Readonly<TelegramCapability> = Object.freeze({
  mode: "read-only",
  canSubmit: false,
  reason: "Sending messages from the web app is not available yet. Use Telegram to reply.",
});
