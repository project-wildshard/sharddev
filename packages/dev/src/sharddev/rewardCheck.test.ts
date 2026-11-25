import { describe, expect, it } from 'vitest';
import { catalogueRewardRefusals, catalogueRewards, rewardCheck } from './rewardCheck';

// FORMAT-PRUNE FP56 (QA 11-16 mini row 46, F32): Honeyknoll's catalogue reward was outside the platform policy (staging's
// /api/items.json listed 0 items), so the engine refused the whole shard at load while `wildshard check` passed it.
const LEDGER = [
  { fact: 'honey.first', origin: 'quest', rewards: [{ kind: 'catalogue', item: 'skin.honey', tier: 1, quantity: 1 }, { kind: 'achievement', id: 'honey' }] },
  { fact: 'honey.hoard', origin: 'quest', rewards: [{ kind: 'catalogue', item: 'skin.comb', tier: 3, quantity: 1 }, { kind: 'catalogue', item: 'skin.honey', tier: 0, quantity: 2 }] },
];
const ITEMS = [{ id: 'skin.honey', maxTier: 2 }, { id: 'skin.comb', maxTier: 2 }];
const api = (body: unknown, status = 200): { server: string; fetch: typeof fetch } => ({ server: 'https://api.test/',
  fetch: (url => { expect(String(url)).toBe('https://api.test/api/items.json'); return Promise.resolve(Response.json(body, { status })); }) as typeof fetch });

describe('rewardCheck (FP56)', () => {
  it('lists only the catalogue rewards, with their fact', () => {
    expect(catalogueRewards(LEDGER).map(reward => `${reward.fact} ${reward.item}`)).toEqual(['honey.first skin.honey', 'honey.hoard skin.comb', 'honey.hoard skin.honey']);
    expect(catalogueRewards(undefined)).toEqual([]);
  });

  it('refuses as the engine does: an unlisted item, a tier over its max, a quantity other than one; each named', () => {
    const refusals = catalogueRewardRefusals(catalogueRewards(LEDGER), ITEMS);
    expect(refusals).toHaveLength(2);
    expect(refusals[0]).toContain('ledger fact honey.hoard: catalogue reward skin.comb (tier 3, quantity 1) is over the platform\'s tier 2');
    expect(refusals[1]).toContain('catalogue reward skin.honey (tier 0, quantity 2) grants 2, the platform grants 1');
    expect(catalogueRewardRefusals(catalogueRewards(LEDGER), [])[0]).toContain('skin.honey (tier 1, quantity 1) is not in the platform catalogue (0 items listed)');
  });

  it('reads the API\'s catalogue, and only warns when it does not answer', async () => {
    expect((await rewardCheck(LEDGER, api({ version: 1, items: [] }))).refusals).toHaveLength(3);
    expect(await rewardCheck(LEDGER, api({ version: 1, items: [{ id: 'skin.honey', maxTier: 3 }, { id: 'skin.comb', maxTier: 3 }] }))).toEqual({ refusals: ['ledger fact honey.hoard: catalogue reward skin.honey (tier 0, quantity 2) grants 2, the platform grants 1; the engine refuses the whole shard at load'], warnings: [] });
    for (const offline of [api({ error: 'down' }, 503), undefined]) {
      const verdict = await rewardCheck(LEDGER, offline);
      expect(verdict.refusals).toEqual([]);
      expect(verdict.warnings[0]).toContain('3 catalogue rewards unchecked');
    }
    expect(await rewardCheck([], undefined)).toEqual({ refusals: [], warnings: [] });
  });
});
