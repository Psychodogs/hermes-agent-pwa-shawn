import { describe, expect, it } from "vitest";
import { assessTelegramCapabilities } from "./telegram-capabilities";

export const nativeIdentity = {
  protocol: 1, kind: "hermes-gateway", hermes_home: "/owner", profile: "default",
  served_profiles: [{ profile_id: "/owner", home: "/owner" }],
  instance_id: "instance", runtime_protocol: 1, authority_epoch: 4,
  state: "ready", api_origin: "http://127.0.0.1:40673",
  capabilities: ["session-authority-v1", "durable-admission-v1", "event-replay-v1"],
};

describe("native Telegram capability gate", () => {
  it.each([
    [null, "native_runtime_unavailable"],
    [{ ...nativeIdentity, kind: "other" }, "unsupported_native_protocol"],
    [{ ...nativeIdentity, runtime_protocol: 2 }, "unsupported_native_protocol"],
    [{ ...nativeIdentity, state: "draining" }, "native_runtime_not_ready"],
    [{ ...nativeIdentity, served_profiles: [] }, "profile_not_served"],
    [{ ...nativeIdentity, hermes_home: "/elsewhere" }, "profile_not_served"],
    [{ ...nativeIdentity, capabilities: [] }, "native_authority_missing"],
    [{ ...nativeIdentity, api_origin: "http://example.org:40673" }, "unsafe_native_origin"],
    [{ ...nativeIdentity, api_origin: "http://secret@127.0.0.1:40673/path" }, "unsafe_native_origin"],
  ])("fails closed for invalid discovery %j", (identity, reason) => {
    const result = assessTelegramCapabilities(identity, "/owner");
    expect(result.canSubmit).toBe(false);
    expect(result.blockers).toContain(reason);
    expect(result.mode).toBe(identity === null ? "unavailable" : "read-only");
  });
  it("recognizes the real v1 runtime but refuses unsafe compose and passive attach", () => {
    expect(assessTelegramCapabilities(nativeIdentity, "/owner")).toEqual({
      mode: "read-only", canSubmit: false, canObserve: false, protocol: 1,
      reason: "Native Telegram compose requires scoped passive access, atomic generation checks and durable prompt mirroring; this gateway protocol does not provide them.",
      blockers: ["scoped_passive_grant_missing", "atomic_generation_fence_missing", "durable_prompt_echo_missing"],
    });
  });
});
