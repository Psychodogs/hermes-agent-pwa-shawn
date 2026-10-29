export interface TelegramCapabilities {
  mode: "unavailable" | "read-only" | "shared-capable";
  canSubmit: boolean;
  canObserve: boolean;
  reason: string;
  blockers: string[];
  protocol: number | null;
}

/** Public DTO only: never return the discovery object (paths/instance IDs). */
export function assessTelegramCapabilities(_identity: unknown, _profileHome: string): TelegramCapabilities {
  return {
    mode: "read-only", canSubmit: false, canObserve: false, protocol: 1,
    reason: "Native Telegram compose requires scoped passive access, atomic generation checks and durable prompt mirroring; this gateway protocol does not provide them.",
    blockers: ["scoped_passive_grant_missing", "atomic_generation_fence_missing", "durable_prompt_echo_missing"],
  };
}
