# Shared Telegram Conversations Implementation Plan

> **For Hermes:** Use the available implementation and test-driven-development skills to implement task-by-task. Do not assume an unavailable subagent skill exists.

**Goal:** Browse Hermes Telegram conversations in this PWA and continue an active conversation from either interface, using one gateway-owned conversation and execution queue, with explicit Telegram delivery.

**Architecture:** Retain a safe paginated history reader, then add a server-side bridge to Hermes' native shared-session authority. Submit through that authority rather than the PWA's API-run manager. Observe the existing session event fanout, reuse Telegram assistant delivery, and add a durable, clearly attributed prompt-mirroring obligation where required.

**Tech stack:** Existing Next.js/React/TypeScript PWA, better-sqlite3, Vitest, installed Python Hermes gateway, native ticketed session WebSocket, existing Telegram bot adapter.

**Status:** Revised October 29, 2026. Inspection and planning only. No code implementation, messages sent, configuration changes, service restarts, or deployment.

**Supersedes:** The earlier read-only-only scope in this same file. The filename is retained so the previously shared download path continues to work. Read-only browsing is the first milestone, not the finished product. The requested context-window circle remains in scope.

---

## 1. Verified context and limits of inspection

PWA repository: `/home/shawn/services/hermes-agent-pwa`.
Hermes repository: `/home/shawn/.hermes/hermes-agent`.
Inspected Hermes source revision: `3f348625d771221bb08087afe1acefd020ca2ac9`.

Read-only service inspection found user services `hermes-gateway.service` and `hermes-pwa.service` active; localhost ports 8642 and 3000 were listening. Gateway process start timestamp was October 22, 2026; PWA start timestamp was October 28, 2026. This does NOT prove that the long-running gateway has loaded the current checkout, that its native session listener is available, or that Telegram is currently receiving messages. Capability/version discovery is a release prerequisite; do not restart services just to resolve that question during planning.

Existing untracked PWA `.next.prev/` and Hermes `pm/lock.json` changes were observed during inspection and must be preserved.

The earlier inspection recorded 44 Telegram sessions, 43 distinct chat/topic pairs, and missing chat/topic metadata in REST session responses. Those are historical observations, not live counts revalidated in this revision. Never hardcode them.

Official documentation checked for context:
- https://hermes-agent.nousresearch.com/docs/user-guide/sessions
- https://hermes-agent.nousresearch.com/docs/user-guide/features/web-dashboard

The docs establish gateway-owned execution and authenticated client attachment. The installed source, not an assumed product/plugin API, defines this integration. This PWA is a separate application, not the official dashboard. No compatible plugin loader was established.

## 2. Routing findings that change the design

All Hermes paths below are relative to the Hermes repository.

### Existing PWA path is NOT the Telegram send path

`src/lib/run-manager.ts:444-509` in the PWA requires project/session membership, builds conversation history and project instructions, calls `client.startRun`, records an API run, and attaches API-run streaming.

Hermes `gateway/session_api.py:173-183,225-227` refuses API binding when an existing session is not API-server-owned. The ordinary authority-backed `/v1/runs` route therefore cannot be treated as a generic way to continue a Telegram session. The compatibility path is also API execution, not proof of Telegram delivery.

Do not register Telegram session IDs in `project_sessions` to bypass this boundary; do not change their source to `api_server`, supply a copied conversation history, or separately call Telegram send after an independent API run.

### Installed native shared runtime is the preferred integration seam

- `gateway/run_api.py:1-12,63-70`: gateway-hosted native ticketed `/api/ws`, with authority already owned by the gateway. It does not bootstrap a second agent.
- `gateway/session_controls.py:580-645`: `session.resume` returns a snapshot, subscription, revision, execution generation, pending admissions, and replay metadata; messaging compression segments resolve to their logical owner.
- Same file `679-694,747-767`: event replay and `prompt.submit`; submissions require an attached session and stable `submission_id`/`input_id`.
- `gateway/session_authority.py:632-697`: authorized durable submission/admission with request identity and payload checks.
- `gateway/session_authority.py:461-562`: native inbound admission uses the same authority and turn fences.
- `gateway/session_ingress.py:226-335,373-418`: executes through the native runner and hands non-API replies to the existing delivery adapter after settlement.
- `gateway/run_turn_runner.py:210-290`: execution deltas are teed to session observers while retaining the native adapter delivery consumer.
- `plugins/platforms/telegram/adapter.py:3637-3703`: bot transport, serialized sending, retry/flood/chunk handling.

This supports the proposed design at source level. It is not an end-to-end proof that the running installation accepts a PWA attach or that every outcome is externally delivered.

### Identity and permissions require a deliberate bridge

`gateway/session_controls.py:113-145` derives authenticated principals/capabilities. Operator status is transport-verified, not a flag the browser may assert. `gateway/run_api.py:63-67` describes owner-control-socket tickets rather than publishing a reusable session credential. `gateway/session_operator.py` preserves actor attribution; operator access is not Telegram account linking.

A browser must never receive gateway owner tickets, bot tokens, API keys, raw control-socket access, or a generic RPC proxy. A server-side transport must enforce the approved profile/session/operation boundary. Verify whether existing ticket issuance can actually provide the desired narrow grant; if not, a small gateway-side scoped bridge is required before enabling compose.

### Concurrency, replay and resets already have useful primitives

Native inbound input and native client submission share durable admission and FIFO execution. Preserve that mechanism rather than inventing a PWA-only lock. Browser disconnect detaches observation; it must not cancel accepted work.

Source `gateway/platforms/api_server_runs.py:121-162` now has fanout and bounded replay. The PWA `CLAUDE.md:72-83` still describes an older single-consumer API stream. That blanket statement is stale relative to the inspected checkout. Do not remove the PWA's durable buffering or refactor ordinary project chat on that basis: runtime compatibility and durability are separate concerns. This feature observes native session events, not an API-run stream.

`gateway/session_events.py` provides replay epochs and bounded session-event replay. Ring buffers are not durable transcript storage. Detect replay gaps and recover from a fresh safe snapshot plus admission receipts.

`gateway/slash_commands_session.py:196-259` makes `/new` or `/reset` a conversation boundary and rebinds Telegram topic routing. Compression continuation and reset are not interchangeable. Never silently retry a stale browser prompt into a new conversation after reset.

## 3. Product behavior

### Browse and resume

Add Telegram to desktop sidebar and mobile navigation. Browse stored gateway conversations, grouped by chat/topic when reliable metadata is available, with individual historical conversation boundaries visible. This is not a mirror of the user's entire Telegram account.

Historical/reset conversations remain readable. Enable a composer only after authoritative resolution confirms a permitted current conversation and supported transport. Merely having a stored Telegram transcript does not prove it is writable.

The chat header and composer must clearly identify the destination, including group/topic and bot where available: “Shared with Telegram · [chat] · [topic]”. On first send to a destination, require confirmation that content typed here is posted to that Telegram destination. Group publication must be especially explicit. Offer a private PWA chat through existing normal navigation, not an ambiguous toggle that changes one conversation's delivery semantics.

### Sending from the PWA

1. Persist a stable client submission ID and scoped pending intent before transport. Never put prompt bodies in localStorage.
2. Backend validates allowed profile, canonical conversation, active route, actor and plain-text payload. Browser cannot supply a raw chat ID, Telegram user ID, owner claim, or routing key.
3. Submit through native authority; acknowledge durable admission, not merely a scheduled async task.
4. Show accepted/queued/running/completed separately from Telegram mirror/delivery status.
5. PWA prompt appears once in the stored conversation with web-origin attribution.
6. To show the prompt inside Telegram, send a bot-authored echo such as “From webapp — Shawn: …”. It is NOT a native Telegram user message. Use the authenticated configured display name, not an arbitrary client-authored identity.
7. Existing native assistant delivery sends the answer to Telegram; the webapp observes that same turn. Do not forward the final reply a second time from the PWA.

If echo fails, display that failure without rerunning inference. If the assistant finishes but Telegram delivery fails, show “Reply ready; Telegram delivery failed/uncertain”, not “agent failed”. A posted Telegram message must never be presented as sent by the user's personal account.

### Receiving from Telegram

Telegram-origin input follows existing Telegram adapter authorization/trigger gating and native execution. The PWA refreshes/observes the same session and displays the input, queue/run state and reply. It does not reinject Telegram messages or ingest its own bot echoes. Multiple open PWA tabs are observers, not multiple execution owners.

For mixed-interface input, preserve the native queue order. No automatic interruption/steering based on a webapp-only busy flag. Expose queued work accurately.

### First writable release scope

Plain-text prompts and observed user/assistant responses only. Preserve Telegram routing and model/skills policy. Do not silently inject this Engineering Projects workspace's instructions into a Telegram conversation.

Defer attachment sending/downloading, full-message search, rename/delete/reset/fork, arbitrary slash commands, stop/steer and approval/clarification actions until dedicated authorization and concurrency tests exist. Show blocked/awaiting-action state and direct the user to Telegram for unsupported controls. In the first release, historical recommendation buttons remain inert; a later typed reply still follows normal admission.

Treat text beginning with gateway command syntax deliberately: reject unsupported command submissions with a clear explanation rather than allowing a hidden reset/control path or assuming every slash command is ordinary text. Test the actual native submission behavior.

## 4. Proposed system boundaries

Browser -> same-origin PWA routes -> `telegram-service` -> narrow native-session bridge -> existing gateway authority -> existing Telegram route/adapter.

History reads can continue using the existing REST history API with safe DTO projection and pagination. Live snapshots/events must be projected through the same public filtering policy before reaching the browser. Do not return raw `session.resume` messages, internal events, tool calls/results, system prompts or reasoning.

Backend owns one native connection/subscription per authorized conversation where practical, fans out sanitized state to browser clients, and survives tab backgrounding. Use lifecycle management and bounded subscriptions; do not maintain an unbounded watcher per historic conversation. Prefer the existing Node service process; add a sidecar only if an authenticated SDK/transport cannot be safely hosted there, and document why.

Suggested PWA HTTP surface, explicitly PROPOSED rather than existing:
- `GET /api/telegram/sessions`
- `GET /api/telegram/sessions/[sessionId]`
- `GET /api/telegram/sessions/[sessionId]/messages?cursor=...`
- `GET /api/telegram/sessions/[sessionId]/events?cursor=...`
- `POST /api/telegram/sessions/[sessionId]/submissions`
- `GET /api/telegram/sessions/[sessionId]/submissions/[submissionId]`

No generic Telegram-send endpoint and no arbitrary native RPC method parameter. Implement same-origin/CSRF and Origin/Host checks for browser mutations, bounded JSON/text sizes, rate limits, no-store responses, and allowlisted source/profile targeting. Tailnet access is the existing trust boundary, not multi-user identity isolation. Never expand public network exposure in this feature.

Keep `/api/v1` native-client contracts unchanged in this milestone; extending Android is separate work with device authorization and OpenAPI updates.

### Stored identities and receipts

Keep separate values for profile, opaque UI conversation key, logical owner, physical transcript tip, route binding, authority/execution generation, submission ID, admission ID, and Telegram delivery receipt. Raw routing fields stay server-side. Preserve actor provenance without inventing Telegram inbound message IDs.

Retry the same authenticated principal + canonical target + submission ID + identical payload. Reuse must survive bridge reconnect and ticket renewal: verify that transport IDs are not accidentally used as the stable retry identity. Changed payload under the same ID conflicts. An expired idempotency retention window must not silently make an old retry a new prompt.

PWA database may persist bridge intent/receipts and replay metadata, not a second full transcript archive. Define retention and minimal payload recovery. Where a pending intent needs text, keep it server-side with owner-level protections and purge after receipt/recovery retention; omit it from logs, analytics and notifications. A PWA crash between admission and response must recover by receipt rather than regenerate work.

### Telegram prompt echo and delivery durability

Existing `gateway/delivery_ledger.py` is best-effort; `gateway/platforms/base.py:4213-4276` can proceed after ledger-write failure. Do not claim strict atomic admission-plus-mirror delivery or exactly-once external posting from that alone.

Before enabling shared compose, define a durable echo obligation tied to admitted input, destination and message kind. Prefer extending the gateway's existing admission/delivery machinery over building a competing sender. If atomic recording is impractical, specify and test a recoverable two-step protocol with admission receipts and reconciliation; block release until orphaned intents/obligations are recoverable.

Track pending, attempting, delivered, failed and ambiguous external delivery, with Telegram message IDs when acknowledged. Respect platform message length/chunking and topic routing. Prompt echoes should be attempted in order ahead of their corresponding reply where possible; if that cannot be guaranteed during failure recovery, label provenance and ordering honestly.

Telegram can acknowledge a send after the network client times out. Exactly-once external posting cannot be promised. Do not blindly retry an ambiguous attempt; retain the uncertainty and provide a reconciliation path. Retrying delivery must never re-submit the prompt or rerun the agent.

## 5. Read-only foundation retained from the original plan

- Use source-validated GET history, not direct SQL transcript reconstruction.
- Explicit safe DTO allowlist: public user/assistant content, stable ID, normalized timestamp/content format, safe provenance; no spreads of upstream objects.
- Exclude model-only/synthetic compaction summaries and system/tool/reasoning content from ordinary message bubbles.
- Follow compression lineage with canonical owner/physical tip bookkeeping; preserve reset boundaries.
- API message requests have a 500-row cap in the earlier inspected route. Use bounded pages, raw-row offset accounting, cursor validation, deduplication, refresh resets and successor-change recovery. Tool-only pages are not end-of-history. Reverify the installed response contract before coding.
- Optional read-only metadata adapter may enrich only API-authorized Telegram IDs. Existing file, readonly/fileMustExist, prepared SELECTs, query_only, bounded busy timeout, no migrations/journal changes, no immutable mode on live WAL. Schema/missing-file failure falls back safely. Metadata failure cannot authorize sending.
- Hidden/archived/internal-child visibility rules apply on every read and write. Selecting an ended historical session does not automatically reactivate it.
- No transcript service-worker cache, localStorage, body logs, analytics or raw error leaks.
- Existing `Message.tsx` auto-probes file paths. Add an explicit file-link disable option for Telegram rendering; preserve textual references until message-bound attachment authorization exists.
- Load older preserves scroll anchors. Focus/manual refresh does not force-scroll readers. Title filtering is labelled as title filtering, not full-message search.

## 6. Implementation tasks and files

PWA paths are relative to `/home/shawn/services/hermes-agent-pwa`. Gateway paths are relative to `/home/shawn/.hermes/hermes-agent`. New paths below are proposed. Use failing tests -> minimal implementation -> passing tests for each code task. Commands here are intended future validation, NOT claimed execution results.

### Task 1: Capability and authentication contract gate

Inspect the running gateway's supported protocol/version using non-mutating discovery. Identify the owner control-socket ticket issuance path, native listener origin, available grants, Telegram route resolution and safe snapshot behavior. Do not assume API port 8642 hosts native `/api/ws` or that the API bearer key authenticates it.

Create PWA `src/lib/telegram-capabilities.ts` and `src/lib/telegram-capabilities.test.ts`; specify gateway protocol fixtures without real message bodies. Return unavailable/read-only/shared-capable distinctly. Missing grant, stale runtime, invalid profile or unsupported protocol disables compose with a reason. A service update/restart, if needed, requires a later authorized maintenance window.

Decide whether server-held existing tickets plus a tightly constrained facade suffice for this owner-only PWA, or whether a narrow gateway grant is necessary. Do not mistake facade checks for an upstream least-privilege token. Record the decision before implementation proceeds.

### Task 2: Safe history foundation

Create `src/lib/telegram-types.ts`, `src/lib/telegram-history.ts`, `src/lib/telegram-history.test.ts`, `src/lib/telegram-metadata.ts`, `src/lib/telegram-metadata.test.ts`. Modify `src/lib/hermes.ts` with a separately named explicit paged history method; preserve `getMessages` behavior for ordinary chats.

Implement the retained read-only requirements above. Test more than 500 raw rows, source/resolved-source checks, compaction, hidden sessions, metadata failure, tool-only pages, duplicate pinned sessions and malformed cursors.

### Task 3: Native bridge transport and public event projection

Create `src/lib/telegram-session-bridge.ts`, `src/lib/telegram-session-bridge.test.ts`, `src/lib/telegram-events.ts`, `src/lib/telegram-events.test.ts`.

Wrap only attach/resume, submit, receipt, replay/snapshot and clean detach. Use authenticated stable server identity and the exact observed protocol fields. Add per-conversation resource ownership, bounded reconnect/backoff and idle cleanup. Detach without an ending reason; never stop accepted work when a browser disconnects.

Sanitize both snapshots and streaming events before forwarding. Test replay epochs, out-of-order/stale events, reset/generation mismatch, reconnect, renewal of tickets and internal field filtering. Do not reuse API-run event assumptions blindly.

### Task 4: Gateway authorization and echo durability, only where missing

Likely existing seams: `gateway/control_socket.py`, `gateway/run_api.py`, `gateway/session_controls.py`, `gateway/session_authority.py`, `gateway/session_ingress.py`, `gateway/delivery_ledger.py`, `gateway/platforms/base.py`, and `plugins/platforms/telegram/adapter.py`.

Do not edit every listed file by default. Prove which existing features suffice, then add the minimum missing scope/receipt/echo behavior. If necessary create `gateway/session_web_bridge.py` with explicit authorization and `tests/gateway/test_session_web_bridge.py`; proposed tests also include `tests/gateway/test_web_prompt_echo_delivery.py`.

Tests must establish that operator credentials cannot be minted from browser identity, one profile cannot target another, non-Telegram sessions are denied, and a raw chat/topic field cannot redirect delivery. Verify accepted web turns reach existing Telegram delivery. Durable prompt echoes must not be parsed as inbound input or stored as a second user turn.

Use isolated fake adapters/temporary databases for delivery failure, bot rejection, network ambiguity, restart and reset tests. No production bot sends in automated tests.

### Task 5: Idempotent submission service and recovery

Create `src/lib/telegram-service.ts`, `src/lib/telegram-submissions.ts`, their adjacent `.test.ts` files. Add minimal PWA tables via `src/lib/db.ts` for stable pending intent, admission/route generation binding and recovery receipts where necessary. Do not migrate Hermes DB from the PWA.

Persist intent before submit, preserve the exact submission ID on retry, resolve uncertain admission via receipt, and separate inference status from echo/final delivery status. A failure to obtain a receipt is unknown, not automatic permission to run again. A gateway crash may produce an unknown execution outcome requiring operator resolution; do not silently replay it.

### Task 6: Narrow browser routes

Create route files under the proposed `/api/telegram` surface and `src/lib/telegram-routes.test.ts`. Validate session/profile authorization for every operation, enforce Origin/CSRF and body bounds, and return only public DTOs. GET must not submit work or change routing/policy through an overly privileged attach. Test whether native resume has policy-refresh side effects under the selected grant and avoid control capabilities for passive browsing.

Keep unsupported operations 405 and existing project-membership checks intact. Deny crafted requests through old project run/reset routes using viewed Telegram IDs.

### Task 7: Telegram UI and synchronized composer

Create `src/app/telegram/page.tsx`, `src/app/telegram/s/[sessionId]/page.tsx`, `src/components/telegram/TelegramSessionList.tsx`, `TelegramHistory.tsx`, `TelegramComposer.tsx`, and `src/hooks/useTelegramConversation.ts`.

Modify `src/components/AppShell.tsx` and `src/components/nav/ProjectSidebar.tsx` minimally for navigation without project-selection effects. Reuse presentation-only message components, not `useThread` or the project `run-manager` path.

Deliver destination disclosure, first-send confirmation, history boundaries, older-page controls, plain-text compose, queue state, delivery badges, unavailable/read-only fallback and reconnect state. Historical messages must not activate recommendation, file, approval or mutation controls. Separate already-stored prompt bubbles from pending optimistic entries using submission/admission identity rather than matching text.

### Task 8: Context-window circle requested by Shawn

Add a reusable compact accessible context ring beside editable chat composers, including shared Telegram compose where the native session supplies a trustworthy measurement. Inspect `session.stats`, snapshots and session/run usage rather than guessing field semantics. Do not use cumulative billing tokens, all historical token totals, or message counts as current context occupancy.

Show tokens used, usable limit, model, freshness and measured/estimated/unknown status on hover, focus or tap. No fabricated percentage when usage/capacity is absent. Invalidate on model change, reset and compaction; label previous-turn measurements honestly. Clamp ring rendering, preserve real values, and avoid colour-only status. No composer or mandatory run subscriptions in read-only history solely for this feature.

Likely create `src/components/chat/ContextUsageRing.tsx`, `src/lib/context-usage.ts`, `src/lib/context-usage.test.ts`; inspect actual normal composer file before wiring it. Test unknown/zero/over-limit values, stale measurements, model changes and narrow mobile layouts.

### Task 9: Verification, documentation and staged rollout

Update `README.md` and `CLAUDE.md` with the new transport boundary, identity/delivery behavior and tested runtime version. Correct the stale blanket single-consumer statement with version-qualified findings, without changing ordinary project streaming casually. Do not modify `/api/v1` contracts in this release.

PWA commands:
```
pnpm test
pnpm typecheck
pnpm exec eslint src --max-warnings=0
pnpm openapi:check
pnpm build
```

Gateway tests: discover current fixtures and contributor instructions first; run focused new bridge/echo tests using the repository's supported Python/pytest environment, then the existing session authority, admission, reset, transport and delivery-ledger regression suites. Do not install arbitrary dependencies into system Python. Record exact commands and actual results during implementation.

Release in gates: history viewer -> native observation -> scoped compose in an explicitly approved test topic -> prompt mirroring/recovery -> general owner use. Default compose off until capability/auth/delivery checks pass. Use the repo deployment runbook; preserve current services during active work. Rollback disables new admission/compose while preserving admitted work and delivery receipts, not deleting state or resubmitting pending prompts.

## 7. Required acceptance tests

1. From an approved test topic, Telegram input appears in the PWA and yields one native turn and one normal Telegram response.
2. A web prompt appears once in shared history and once in Telegram as a labelled bot-authored echo. The same assistant response is visible in both interfaces without an extra PWA-forwarded final.
3. Send concurrently from Telegram and two PWA tabs; all accepted work shares the native queue and no second agent run is created for one submission.
4. Repeat identical HTTP/native retries after a lost acknowledgement; one admission remains. Changed body with reused ID conflicts. Stable actor identity survives ticket renewal and PWA restart.
5. Lock/background the phone, disconnect observers and reopen; accepted work continues. Recover via snapshot/receipt after replay truncation. Do not infer completion from stream closure.
6. Fault inject at intent persisted, admission committed, receipt response lost, echo attempting, Telegram acknowledged-before-timeout, inference completed, and final delivery failed. Preserve distinct state and never regenerate inference to fix transport delivery.
7. Compress during a conversation: retain logical ownership while following the physical tip. Reset from Telegram: old-view submissions are refused or explicitly redirected only after user confirmation, never silently sent to the replacement conversation.
8. Archive/hidden/history-only and non-Telegram targets cannot become writable through crafted session IDs. Profile mismatch and forged route/author/command parameters are denied.
9. Refresh metadata/snapshots with a passive read grant; confirm no session-policy mutation, new turn, source conversion or project-table registration occurs merely from viewing.
10. Confirm no owner ticket/key/bot token, internal message/event fields, private tool outputs or system prompts cross the browser API. Message text remains safely rendered; paths do not grant file access.
11. Queue/run status and Telegram delivery status remain distinct. Group/topic destination disclosure and first-send confirmation work on desktop and mobile.
12. Context ring reflects verified backend semantics or explicitly shows unknown/estimated. Normal Engineering Projects chat, streaming, file handling, recommendations and native API contracts regress cleanly.

Live sends require user-approved test destination and a later implementation/testing action. This planning turn sent none and does not claim these tests passed.

## 8. Open decisions and release blockers

- Running native protocol/listener and compatibility with the inspected checkout remain unverified.
- Existing authenticated ticket grants may be too broad; verify scoping before implementation. An unrestricted browser RPC tunnel is never acceptable.
- Native web input attribution and Telegram echo require real integration tests, not just a source-level expectation.
- Decide and document minimal durable gateway echo extension after tracing existing admission/delivery transactions; do not duplicate working machinery.
- Exactly-once external Telegram delivery is not guaranteed across ambiguous network acknowledgement. Honest uncertainty and reconciliation are required.
- Stored Hermes history is not a complete Telegram account archive; edits, deletions, media and historical delivery formatting may differ.
- Public hosting, multi-user authorization, Android additions, attachments, search and project linking are outside this milestone.

## 9. Definition of done

One gateway-owned conversation can be read and continued from Telegram or this PWA, with explicit destination/author attribution, shared queueing, idempotent admission and recoverable observation. Native Telegram reply delivery is reused rather than duplicated. Prompt mirroring and delivery failures are recorded honestly. Read-only browsing is safe independently, the context ring does not fabricate usage, and release claims are backed by actual tests and an approved cross-interface exchange.
