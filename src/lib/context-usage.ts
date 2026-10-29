/** Only verified context occupancy belongs here, never lifetime billing totals. */
export interface ContextUsageMeasurement {
  usedTokens: number | null;
  limitTokens: number | null;
  model: string | null;
  measuredAt: string | null;
  quality: 'measured' | 'estimated' | 'unknown';
  basis: 'current' | 'previous-turn';
  generation?: string;
}
export function contextUsageView(m: ContextUsageMeasurement | null | undefined, options: {now?:number;model?:string|null;generation?:string} = {}): {percent:number|null; label:string} {
  const unknown = {percent:null, label:`Context usage unknown; no verified occupancy measurement. Model: ${options.model ?? 'unknown'}; freshness: unknown.`};
  if (!m) return unknown;
  const at = m.measuredAt ? Date.parse(m.measuredAt) : NaN;
  const age = (options.now ?? Date.now()) - at;
  const detail = `Model: ${m.model ?? 'unknown'}; ${m.quality}; ${m.basis}; measured ${m.measuredAt ?? 'unknown'}.`;
  if (!['measured','estimated'].includes(m.quality) || !['current','previous-turn'].includes(m.basis) || m.usedTokens === null || m.limitTokens === null || !Number.isFinite(m.usedTokens) || !Number.isFinite(m.limitTokens) || m.usedTokens < 0 || m.limitTokens <= 0 || !Number.isFinite(at) || age < -60_000 || age > 300_000 || (options.model != null && options.model !== m.model) || (options.generation !== undefined && options.generation !== m.generation)) return {percent:null,label:`Context usage unknown or stale. ${detail}`};
  return {percent:Math.min(100,Math.max(0,m.usedTokens/m.limitTokens*100)),label:`Context: ${m.usedTokens.toLocaleString('en-US')} / ${m.limitTokens.toLocaleString('en-US')} tokens. ${detail}`};
}
