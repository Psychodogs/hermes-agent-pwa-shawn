# Telegram backend integration contract (in progress)

Runtime non-mutating control `identify` verified October 29, 2026: Hermes 0.22.4, code SHA 3f348625d771221bb08087afe1acefd020ca2ac9, control/runtime protocol 1, ready, native session authority/durable admission/event replay present. Native listener is distinct from REST 8642 (discovered loopback ephemeral port).

**Compose remains disabled deliberately.** Current `interactive` tickets grant read/create/submit/control/approve/respond, only profile/host scope; no passive session-scoped grant. `session.resume` with control refreshes policy. `prompt.submit` rejects expected generation fields; no atomic reset-generation compare. No durable prompt-echo admission obligation is exposed. A flag claiming support cannot enable this unimplemented protocol.

Backend exports planned:
- `getTelegramCapabilities(): Promise<TelegramCapabilities>` from `telegram-service.ts` (safe public DTO; default profile only).
- `submitTelegramMessage(sessionId: string, body: unknown): Promise<never>` from same: validates body and source then fails closed with typed `TelegramServiceError` (`code`, `status`, safe message). Does not call project run manager or Telegram send.
- `getTelegramSubmission(sessionId: string, submissionId: string)` from same: validates source, returns a saved safe receipt or typed not-found. No fabricated receipts.
- `discoverTelegramRuntime` / native control identify transport in `telegram-session-bridge.ts`; server-only, no general RPC interface or ticket issuance.

Public capability shape: `{mode: "unavailable" | "read-only" | "shared-capable", canSubmit: boolean, canObserve: boolean, reason: string, blockers: string[], protocol: number | null}`. For this runtime always read-only, canSubmit/canObserve false. History GETs use the separate REST history implementation. Native snapshots/events are not forwarded. UI should retain read-only history and explicit reason. `shared-capable` is reserved, not currently produced.

No gateway edits/restarts/live messages. Parent owns route, UI and deployment integration. Final test/results and signatures will be updated here.

## Capability assessment (implemented)

`assessTelegramCapabilities(identity, profileHome)` in `src/lib/telegram-capabilities.ts` is implemented and fails closed. Null or non-object identity gives `unavailable` / `native_runtime_unavailable`. Otherwise the result is always `read-only` (`canSubmit`/`canObserve` false, `shared-capable` never produced) and it checks: `kind` is `hermes-gateway` and `runtime_protocol` is 1 (`unsupported_native_protocol`); `state` is `ready` (`native_runtime_not_ready`); `hermes_home` equals the profile home and `served_profiles` has an entry with that `home` (`profile_not_served`); capabilities include session-authority-v1, durable-admission-v1 and event-replay-v1 (`native_authority_missing`); `api_origin` is http(s) loopback (127.0.0.1, ::1, localhost) with no userinfo, path or query (`unsafe_native_origin`). A fully valid identity still reports the three protocol blockers (scoped passive grant, atomic generation fence, durable prompt echo). Identity fields (paths, instance ids) are never returned.
