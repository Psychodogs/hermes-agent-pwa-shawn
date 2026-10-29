# Context usage ring: why it shows "unknown"

Investigated against Hermes 0.22.4 (rev 3f348625). No value reachable through the
:8642 REST API gives current context occupancy, so the ring in `Composer.tsx`
deliberately receives no measurement and shows "?". Nothing is estimated or guessed.

## What exists, and why it does not qualify

Current occupancy lives in the agent's context compressor (`last_prompt_tokens`,
`context_length`, `compression_count`), set at `agent/context_compressor.py:2908`
and projected by `gateway/session_usage.py:_context` (lines 33-52, fields
`last_prompt_tokens`, `context_tokens`, `context_length`, `compression_count`).
That projection is published only as `session.usage` to local viewers and returned
by the `session.stats` verb (`gateway/session_tui_reads.py:129`,
`gateway/session_controls.py:219`). It is not registered as an HTTP route: the
REST route table is `gateway/platforms/api_server.py:1652-1688` and the
`/api/sessions/{id}` family is the only per-session surface.

REST-readable values and their semantics:

- `GET /api/sessions/{id}` (`_session_response`, `api_server.py:2934-2966`):
  `input_tokens`, `output_tokens`, `cache_*_tokens`, `api_call_count`,
  `message_count`. These are billing counters accumulated across the whole
  session (`agent/turn_usage.py:181-184`). Cumulative, not occupancy.
- Run `usage` on `run.completed` and `GET /v1/runs/{id}`
  (`api_server_runs.py:88-90`, `_run_usage` at 867-874): copied from
  `session_prompt_tokens`, `session_completion_tokens`, `session_total_tokens`,
  which are the same session-cumulative counters. Not occupancy.
- `POST /api/sessions/{id}/chat` response usage
  (`api_server.py:4131-4133`): same `session_*` counters.
- `GET /v1/models` (`api_server.py:2417-2431`) and `GET /api/model/options`
  (`hermes_cli/inventory.py`): no `context_length` or window field.
  So the usable limit is not reachable either.
- Session messages expose `token_count` (`api_server.py:2973`), but nothing found
  documents it as the prompt size of an API call, so it is not used.

## Conclusion

Neither (a) tokens currently in context (or the previous turn's prompt tokens) nor
(b) the model's usable context limit is exposed over REST. Dividing cumulative
totals by a guessed window would fabricate a percentage, which the requirement
forbids.

## What would unblock it

Any one of these on the gateway side, then a reader in `src/lib` that projects it
into `ContextUsageMeasurement` (with `basis: 'previous-turn'`, a generation marker
that changes on `compression_count` or session id rotation, and the model id):

- A REST route (or session field) returning the `session_usage._context` dict.
- `last_prompt_tokens` and `context_length` added to the run terminal event/status.

`ContextUsageRing` already accepts `measurement`, `model` and `generation`, and
`contextUsageView` already refuses stale, model-mismatched or generation-mismatched
measurements, so no UI change is needed when a source appears. This needs a live
gateway to re-verify, in case a newer Hermes adds the field.
