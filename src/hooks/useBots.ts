"use client";

import { useEffect, useState } from "react";
import type { Bot } from "@/lib/bots";

export interface BotsPayload {
  bots: Bot[];
  /** Bot Mode is set up on this install, so a Bot Chat carries message_agent */
  managed: boolean;
}

/**
 * The Hermes Bot roster, probed through the gateway. null until it lands;
 * an empty roster on failure, so a Hermes without profiles simply shows no
 * Bot controls rather than a broken one.
 */
export function useBots(enabled = true): BotsPayload | null {
  const [payload, setPayload] = useState<BotsPayload | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch("/api/bots")
      .then((r) => r.json())
      .then((body: BotsPayload) => {
        if (!cancelled) setPayload({ bots: body.bots ?? [], managed: body.managed === true });
      })
      .catch(() => {
        if (!cancelled) setPayload({ bots: [], managed: false });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return payload;
}

/** Why a Bot can't be picked, in words — or null when it can. */
export function botStatusText(bot: Bot): string | null {
  switch (bot.status) {
    case "ready":
      return null;
    case "no_key":
      return "needs its own API_SERVER_KEY";
    case "key_unreadable":
      return "its .env is not readable by this app";
    case "bad_key":
      return "its API_SERVER_KEY was rejected";
    case "not_served":
      return "not served by this gateway";
    case "unreachable":
      return "gateway unreachable";
  }
}
