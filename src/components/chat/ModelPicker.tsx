"use client";

import { Sheet } from "@/components/ui/Sheet";
import { IconCheck, IconChip, IconCross } from "@/components/primitives/icons";
import { ICON_BUTTON, buttonClass } from "@/components/ui/SettingsControls";
import type { ModelsPayload, ModelProviderView } from "@/app/api/models/route";
import type { ModelOptions, ModelSelection } from "@/lib/model-options";

export type { ModelOptions, ModelSelection };

/* Model selection, from Hermes' own inventory.
 *
 * /v1/models only lists the virtual `hermes-agent` alias plus any configured
 * model_routes, which is not a picker. /api/model/options is the real
 * catalogue — the same one the Hermes dashboard and TUI read — with a
 * per-model {fast, reasoning} capability map.
 *
 * The choice is stored on the project and passed per-run on POST /v1/runs.
 * Hermes also has a session model *lock* (POST /api/sessions/{id}/model), and
 * this deliberately doesn't use it: a lock plus a per-run model is exactly
 * what api_server's route-conflict guard rejects, and keeping the choice in
 * our own row means it survives a session reset.
 *
 * "Gateway default" names the model Hermes actually runs, which only
 * /api/model/options knows. /v1/capabilities and /v1/models both answer
 * "hermes-agent" — the virtual OpenAI-compatible alias, not a model anyone
 * chose. Labelling the row with that told the user nothing. */

export function ModelPicker({
  open,
  onClose,
  selection,
  onSelect,
  payload,
  refreshing,
  onRefresh,
}: {
  open: boolean;
  onClose: () => void;
  selection: ModelSelection;
  onSelect: (next: ModelSelection) => void;
  /** from useModels(), shared with the composer's chip — null until it lands */
  payload: ModelsPayload | null;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const providers = payload?.providers ?? [];
  const current = payload?.current ?? { model: null, provider: null };
  const currentProviderName =
    providers.find((p) => p.slug === current.provider)?.name ?? current.provider;

  // Reasoning and fast apply to whatever will actually run, which is the
  // gateway's own model when nothing is pinned — so the options below are not
  // gated on having made a selection.
  const effectiveModel = selection.model ?? current.model;
  const caps = findCapabilities(providers, effectiveModel);

  return (
    <Sheet open={open} onClose={onClose} label="Model">
      <div className="flex items-center justify-between gap-2 px-5 pt-5 pb-3">
        <span className="flex items-center gap-2 text-title font-semibold text-ink">
          <IconChip size={16} className="text-ink-2" />
          Model
        </span>
        <button type="button" aria-label="Close" onClick={onClose} className={`${ICON_BUTTON} -mr-2`}>
          <IconCross size={16} />
        </button>
      </div>

      <div className="flex flex-col gap-0.5 px-3 pb-5">
        <Row
          title="Gateway default"
          subtitle={
            current.model
              ? `${current.model}${currentProviderName ? ` · ${currentProviderName}` : ""}`
              : payload
                ? "whatever Hermes is configured for"
                : "…"
          }
          selected={selection.model === null}
          onClick={() =>
            // Clearing the pin keeps the reasoning choice: it applies to the
            // gateway's model just as much as to a pinned one.
            onSelect({ model: null, provider: null, modelOptions: selection.modelOptions })
          }
        />
        <p className="px-2.5 pt-1 pb-2 text-label leading-snug text-ink-3">
          Follows whatever Hermes is set to. Pin one below to keep this project
          on it even if the gateway changes.
        </p>

        {payload?.unavailable && (
          <p className="px-2.5 py-3 text-label text-ink-3">
            Hermes didn&rsquo;t answer with its model inventory. The gateway
            default still works.
          </p>
        )}
        {!payload && (
          <p className="px-2.5 py-3 text-label text-ink-3">Loading models…</p>
        )}

        {providers.map((provider) => (
          <div key={provider.slug} className="mt-3">
            <div className="flex items-center gap-2 px-2.5 pb-1">
              <span className="text-label text-ink-3">{provider.name}</span>
              {provider.isCurrent && (
                <span className="rounded-chip bg-green-tint px-1.5 text-meta text-green">
                  active
                </span>
              )}
            </div>
            {provider.warning && !provider.authenticated && (
              <p className="px-2.5 pb-1 text-label text-ink-3">{provider.warning}</p>
            )}
            {provider.models.map((model) => (
              <Row
                key={model.id}
                title={model.id}
                mono
                /* No capability subtitle. "reasoning · fast" under every row
                 * read as state — "fast mode is on" — when it only ever meant
                 * "this model supports it", and it distinguished nothing:
                 * every model Hermes lists advertises reasoning, and `fast` is
                 * uniform within a provider. A capability you can act on
                 * belongs in a control, which is what Fast mode below is; one
                 * you can't is noise. The id is all there is to say.
                 */
                badge={
                  model.id === current.model && provider.slug === current.provider
                    ? "gateway"
                    : undefined
                }
                disabled={!provider.authenticated}
                selected={selection.model === model.id}
                onClick={() =>
                  onSelect({
                    model: model.id,
                    provider: provider.slug,
                    // Reasoning carries over — it is a preference about how you
                    // want this project answered, not a property of the model.
                    // `fast` doesn't: it is a per-model service tier, and
                    // sending it to a model without one is a field Hermes drops.
                    modelOptions: model.fast
                      ? selection.modelOptions
                      : { ...selection.modelOptions, fast: undefined },
                  })
                }
              />
            ))}
          </div>
        ))}

        {(caps.reasoning || caps.fast) && (
          <div className="mt-4 border-t border-line pt-3">
            <span className="block px-2.5 pb-1 text-label text-ink-3">
              Options for {effectiveModel ?? "this project"}
            </span>
            {/* Thinking used to live here. It moved to the chip beside the
              * composer: it is a per-turn decision, and three taps into a
              * sheet is the wrong depth for something you change that often. */}

            {caps.fast && (
              <Row
                title="Fast mode"
                subtitle="OpenAI Priority Processing / Anthropic Fast Mode"
                selected={selection.modelOptions.fast === true}
                onClick={() => {
                  /* Turning it off removes the key rather than storing false.
                   * api_server distinguishes the two: an absent `fast` leaves
                   * whatever service_tier the gateway is configured for, while
                   * an explicit false clears it. Off should mean "don't ask",
                   * not "override to none". */
                  const next: ModelOptions = { ...selection.modelOptions };
                  if (next.fast) delete next.fast;
                  else next.fast = true;
                  onSelect({ ...selection, modelOptions: next });
                }}
              />
            )}
          </div>
        )}

        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className={`${buttonClass("secondary", "sm")} mt-4 self-start`}
        >
          {refreshing ? "Refreshing…" : "Refresh from Hermes"}
        </button>
      </div>
    </Sheet>
  );
}

function Row({
  title,
  subtitle,
  selected,
  disabled,
  mono,
  badge,
  onClick,
}: {
  title: string;
  subtitle?: string;
  selected: boolean;
  disabled?: boolean;
  mono?: boolean;
  /** small chip on the right — marks the model the gateway itself runs */
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-11 w-full items-center gap-3 rounded-control px-2.5 py-2 text-left
        transition-[transform,background-color] duration-150 enabled:hover:bg-hover enabled:active:scale-[0.99]
        disabled:cursor-default disabled:opacity-40"
    >
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-ui text-ink ${mono ? "font-mono text-label" : ""}`}
        >
          {title}
        </span>
        {subtitle && (
          <span className="block truncate text-label text-ink-3">{subtitle}</span>
        )}
      </span>
      {badge && (
        <span className="shrink-0 rounded-chip bg-field px-1.5 text-meta text-ink-3">
          {badge}
        </span>
      )}
      <span className="flex size-4 shrink-0 items-center justify-center text-ink">
        {selected && <IconCheck size={16} strokeWidth={2.4} />}
      </span>
    </button>
  );
}

function findCapabilities(providers: ModelProviderView[], model: string | null) {
  if (!model) return { fast: false, reasoning: false };
  for (const provider of providers) {
    const found = provider.models.find((m) => m.id === model);
    if (found) return { fast: found.fast, reasoning: found.reasoning };
  }
  // Unknown model — it may predate the cached inventory. Offer both rather
  // than hiding controls the run would actually honour.
  return { fast: true, reasoning: true };
}
