import { CONTRACTS } from './fixtures/pine-contracts';
import { expect, test } from 'vitest';
import { bindQuestDeathEffects } from '../src/shared/game/plugin/quests';
import { createAchievementCounters } from '../src/shared/game/achievements';
import { PINE_DEATH_EFFECTS, PINE_PAGE_DEATH_EFFECTS } from '../src/shards/pine-hollow/generators/questDeaths';
import deathRows from '../src/shards/driftwood-isle/data/questDeaths.json' with { type: 'json' };
import { recordKill, isFilled, type Board } from '../src/shared/game/quest/contracts';
import { PINE_FEAT_COUNTERS } from '../src/shards/pine-hollow/generators/questInventory';
import { DRIFTWOOD_FEAT_COUNTERS } from '../src/shards/driftwood-isle/generators/questInventory';

test('death rows retain achievement, contract notice and key/flag order without creating save state', () => {
  const order: string[] = [], flags = { set: (flag: string): void => { order.push(flag); } };
  let pineCounts: Record<string, number> = {};
  const pine = createAchievementCounters(PINE_FEAT_COUNTERS, { read: () => pineCounts, write: counts => { pineCounts = counts; },
    emit: name => { order.push(name); } });
  const board: Board = { next: 1, claimed: 0, streak: 0, best: 0, slots: [{ serial: 0, kind: 'species', target: 'deer', need: 1, have: 0,
    title: 'Venison', goal: 'Take a deer', reward: { items: [], bolts: 1 } }] };
  const contracts = (body: { kind: string; variant?: string; label?: string }): void => {
    const moved = recordKill(CONTRACTS, board, { kind: body.kind, elite: null, tags: [] });
    if (moved.length === 0) return;
    order.push('contract-save');
    for (const index of moved) { const contract = board.slots[index]; if (contract !== undefined && isFilled(contract)) order.push('contract-toast'); }
  };
  const consequences = bindQuestDeathEffects(PINE_PAGE_DEATH_EFFECTS, { flags, kill: pine.kill, event: pine.event });
  const page = (body: Parameters<typeof contracts>[0]): void => { consequences(body); contracts(body); };
  page({ kind: 'deer', variant: 'ghost' });
  expect(order).toContain('pine.feat.ghost');
  expect(order.indexOf('pine.feat.ghost')).toBeLessThan(order.indexOf('contract-save'));
  expect(order.indexOf('contract-save')).toBeLessThan(order.indexOf('contract-toast'));
  page({ kind: 'deer', variant: 'thrall', label: 'Thrall' });
  expect(pineCounts['thralls']).toBe(1); // Either older label or declared coat matches; both together submit one event.
  page({ kind: 'deer', label: 'Thrall' }); expect(pineCounts['thralls']).toBe(2);
  order.length = 0; page({ kind: 'antler-king' }); expect(order[0]).toBe('dead:king');
  order.length = 0;
  bindQuestDeathEffects(PINE_DEATH_EFFECTS, { kill: pine.kill, event: pine.event, calls: new Map([['contracts', contracts]]) })({ kind: 'antler-king' });
  expect(order).not.toContain('dead:king');

  let dwCounts: Record<string, number> = {};
  const dw = createAchievementCounters(DRIFTWOOD_FEAT_COUNTERS, { read: () => dwCounts, write: counts => { dwCounts = counts; },
    emit: name => { order.push(name); } });
  const sailor = { kind: 'sailor', position: { x: 4, z: 8 } }, keys: unknown[] = [];
  const drop = (body: typeof sailor): void => { keys.push(body.position); order.push('key'); };
  const dwPage = bindQuestDeathEffects(deathRows.page, { flags, calls: new Map([['hold-key', drop]]), toast: () => { order.push('kill-toast'); } });
  order.length = 0; dwPage(sailor); dw.kill(sailor.kind); // Page achievement listener retains its later priority.
  expect(keys[0]).toBe(sailor.position);
  expect(order.indexOf('key')).toBeLessThan(order.indexOf('dead:sailor'));
  expect(order.indexOf('dead:sailor')).toBeLessThan(order.indexOf('kill-toast'));
  const feat = order.find(name => name.startsWith('driftwood.'));
  expect(feat).toBeDefined(); if (feat !== undefined) expect(order.indexOf('kill-toast')).toBeLessThan(order.indexOf(feat));
  order.length = 0;
  drop(sailor); // The native quest keeps its original floor/state key listener ahead of kill continuation.
  bindQuestDeathEffects(deathRows.kills, { flags, kill: dw.kill })(sailor);
  expect(order[0]).toBe('key'); expect(order[1]).toBe('dead:sailor');
  dwPage({ kind: 'captain', position: { x: 0, z: 0 } }); expect(order).toContain('dead:captain');
  const before = [...order];
  expect(() => bindQuestDeathEffects([{ effects: [{ kind: 'flag', flag: 'written' }] }, { effects: [{ kind: 'call', name: 'missing' }] }], { flags })).toThrow();
  expect(() => bindQuestDeathEffects([{ effects: [{ kind: 'kill' }] }], {})).toThrow();
  expect(() => bindQuestDeathEffects([{ effects: [{ kind: 'event', event: 'thrall' }] }], {})).toThrow();
  expect(() => bindQuestDeathEffects([{ effects: [{ kind: 'toast', text: 'notice' }] }], {})).toThrow();
  expect(() => bindQuestDeathEffects([{ when: [{}], effects: [{ kind: 'kill' }] }], { kill: pine.kill })).toThrow();
  expect(() => bindQuestDeathEffects([{ effects: [{ kind: 'flag', flag: '../escape' }] }], { flags })).toThrow();
  expect(() => bindQuestDeathEffects([{ effects: [{ kind: 'flag', flag: 'safe', unknown: true }] }], { flags })).toThrow();
  expect(() => bindQuestDeathEffects(Array.from({ length: 129 }, () => ({ effects: [{ kind: 'kill' }] })), { kill: pine.kill })).toThrow();
  expect(order).toEqual(before);
});
