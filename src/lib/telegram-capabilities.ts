export interface TelegramCapabilities {
  mode: "unavailable" | "read-only" | "shared-capable";
  canSubmit: boolean;
  canObserve: boolean;
  reason: string;
  blockers: string[];
  protocol: number | null;
}

// Identify field shapes verified against Hermes 0.22.4 (rev 3f348625):
//  - kind "hermes-gateway": gateway/status.py:40 (_GATEWAY_KIND); protocol/kind/hermes_home: gateway/control_socket.py:176-178
//  - instance_id, runtime_protocol, authority_epoch, state, api_origin, served_profiles, capabilities:
//    gateway/run_bootstrap.py:293-297 (runtime_protocol 1: gateway/control_socket.py:373)
//  - state "ready" and the three capabilities: gateway/run_runtime.py:578-579; draining overrides state: run_bootstrap.py:298-303
//  - api_origin is http://{host}:{port}: gateway/run_api.py:202
//  - served_profiles entries are {"profile_id", "home"}: gateway/host_attach.py:147-155
const SUPPORTED_KIND = "hermes-gateway";
const SUPPORTED_RUNTIME_PROTOCOL = 1;
const REQUIRED_CAPABILITIES = ["session-authority-v1", "durable-admission-v1", "event-replay-v1"];
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);

const READ_ONLY_REASON =
  "Native Telegram compose requires scoped passive access, atomic generation checks and durable prompt mirroring; this gateway protocol does not provide them.";
// Compose is deliberately not enabled (docs/telegram-backend-contract.md), so these always apply.
const PROTOCOL_BLOCKERS = ["scoped_passive_grant_missing", "atomic_generation_fence_missing", "durable_prompt_echo_missing"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeLoopbackOrigin(value: unknown): boolean {
  if (typeof value !== "string") return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  if (url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) return false;
  return LOOPBACK_HOSTS.has(url.hostname);
}

function servesProfile(identity: Record<string, unknown>, profileHome: string): boolean {
  if (!profileHome || identity.hermes_home !== profileHome) return false;
  const served = identity.served_profiles;
  if (!Array.isArray(served)) return false;
  return served.some((entry) => isRecord(entry) && entry.home === profileHome);
}

/** Public DTO only: never return the discovery object (paths/instance IDs). */
export function assessTelegramCapabilities(identity: unknown, profileHome: string): TelegramCapabilities {
  if (!isRecord(identity)) {
    return {
      mode: "unavailable", canSubmit: false, canObserve: false, protocol: null,
      reason: "The native Telegram runtime could not be identified.",
      blockers: ["native_runtime_unavailable"],
    };
  }
  const blockers: string[] = [];
  if (identity.kind !== SUPPORTED_KIND || identity.runtime_protocol !== SUPPORTED_RUNTIME_PROTOCOL) {
    blockers.push("unsupported_native_protocol");
  }
  if (identity.state !== "ready") blockers.push("native_runtime_not_ready");
  if (!servesProfile(identity, profileHome)) blockers.push("profile_not_served");
  const caps = identity.capabilities;
  if (!Array.isArray(caps) || !REQUIRED_CAPABILITIES.every((cap) => caps.includes(cap))) {
    blockers.push("native_authority_missing");
  }
  if (!isSafeLoopbackOrigin(identity.api_origin)) blockers.push("unsafe_native_origin");

  const recognised = blockers.length === 0;
  return {
    mode: "read-only", canSubmit: false, canObserve: false,
    protocol: identity.runtime_protocol === SUPPORTED_RUNTIME_PROTOCOL ? 1 : null,
    reason: recognised ? READ_ONLY_REASON : "The native Telegram runtime failed capability checks; Telegram is read-only.",
    blockers: recognised ? PROTOCOL_BLOCKERS : blockers,
  };
}
