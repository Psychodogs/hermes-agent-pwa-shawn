import { describe, expect, it } from 'vitest';
import { contextUsageView } from './context-usage';
const m = {usedTokens:150,limitTokens:100,model:'m',measuredAt:'2026-10-29T12:00:00Z',quality:'measured' as const,basis:'previous-turn' as const,generation:'g'};
const now = Date.parse('2026-10-29T12:00:01Z');
describe('context occupancy', () => {
  it('does not invent a percentage without verified usage and capacity', () => {
    expect(contextUsageView(null).percent).toBeNull();
    expect(contextUsageView(null).label).toContain('unknown');
  });
  it('rejects unrecognized quality and reports the selected model when unknown', () => {
    expect(contextUsageView({...m, quality:'billing-total' as typeof m.quality},{now}).percent).toBeNull();
    expect(contextUsageView(null,{model:'selected-model'}).label).toContain('selected-model');
  });
  it('preserves real token values but clamps the ring; zero is valid', () => {
    expect(contextUsageView(m,{now}).percent).toBe(100);
    expect(contextUsageView(m,{now}).label).toContain('150 / 100');
    expect(contextUsageView({...m,usedTokens:0},{now}).percent).toBe(0);
  });
  it('invalidates stale, mismatched, absent and invalid measurements', () => {
    for (const bad of [{...m,limitTokens:0},{...m,usedTokens:-1},{...m,usedTokens:NaN},{...m,measuredAt:null},{...m,quality:'unknown' as const}]) expect(contextUsageView(bad,{now}).percent).toBeNull();
    expect(contextUsageView(m,{now,model:'other'}).percent).toBeNull();
    expect(contextUsageView(m,{now,generation:'reset'}).percent).toBeNull();
    expect(contextUsageView(m,{now:now+600_000}).percent).toBeNull();
  });
});
