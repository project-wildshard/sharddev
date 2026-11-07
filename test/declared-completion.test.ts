// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import { Vector3 } from 'three';
import { Scope } from '../src/shared/engine/app/scope';
import { Flags } from '../src/shared/engine/world/interact/flags';
import { createQuestPlacements } from '../src/shared/engine/world/interact/types';
import { parseCompletion } from '@wildshard/format/completion';
import { createShardProduct } from '../src/shared/game/shardfile/shardProduct';
import { emptyShardfile } from '../src/sharddev/author';
import { completionProjection, fmtPlayTime, installCompletion, type CompletionContext } from '../src/client/game/complete/declared';
import { completeEntry } from '../src/client/game/complete/ShardComplete';
import { completionRows, COMPLETE_CONTENT } from '../src/shards/driftwood-isle/generators/completion';
import { templateOutput } from '../src/shards/_template/generators/productOutput';
import { installCatalogueFixture } from './fixtures/bootSetup';

await installCatalogueFixture();

const template = templateOutput({ hash: '0'.repeat(64) });

const policy = completionRows();
function fixture(row = policy) {
  const scope = new Scope('completion'), flags = new Flags('completion-fixture', false), source = emptyShardfile({ slug: 'completion-fixture', name: 'Template shard', author: 'Wildshard', revision: 1, seed: 1 });
  const product = createShardProduct({ slug: source.identity.slug, revision: 1, shardfile: source,
    sections: new Map([['ui/completion', row]]), files: new Map(), read: () => Promise.reject(new Error('No asset read')) });
  const systems: Parameters<CompletionContext['system']>[0][] = [], log: string[] = [];
  const player = { position: new Vector3(), velocity: new Vector3(2, 3, 4), carried: false };
  const weapons = { visible: true }, audio = { worldMuted: false };
  const enemy = { position: new Vector3(1, 0, 1), alive: true, aggressive: true };
  const ctx: CompletionContext = { scope, product, manifest: { slug: 'driftwood-isle' }, system: system => { systems.push(system); },
    game: { runtime: { world: { player }, play: { audio, weapons, hud: { toast: text => { log.push(text); }, onResume: () => { log.push('resume'); } }, animals: { animals: [enemy] } } } } };
  return { scope, flags, systems, log, player, weapons, audio, enemy, ctx };
}

test('the admitted projection retains ordered stats, todo truncation, live counts and late placement anchors', () => {
  const flags = new Flags('completion-data', false), placement = createQuestPlacements({ terrain: () => 0 });
  placement.setAnchor('lookout.zipline', { x: 71, z: 32 });
  const progress = { playS: 3661, earnedCount: 1, title: { title: 'Beachcomber' }, rows: [
    { def: { id: 'one', name: 'One', count: 1, event: 'glass' }, count: 0, earned: false },
    { def: { id: 'two', name: 'Two', count: 5 }, count: 2, earned: false },
  ] };
  flags.set('glass:1'); flags.set('shard:cave'); flags.set('seen:hut');
  const result = completionProjection(policy, flags, progress, policy.title, 'Next world', placement.anchors);
  expect(result.data.kicker).toBe(COMPLETE_CONTENT.card.kicker);
  expect(result.data.stats.map(row => [row.label, row.value])).toEqual([
    ['Time played', '1h 01m'], ['Achievements', '1 / 2'], ['Glyph shards', '1 / 3'], ['Sea glass', '1 / 15'], ['Places', '1 / 9'], ['Title', 'Beachcomber'],
  ]);
  expect(result.data.todo).toEqual(['14 sea glass', 'The reef treasure', 'The Pier', 'Vista Point', 'Rope Bridge', 'Zipline', '+5 more']);
  expect(result.markers[0]?.id).toBe('glass:2');
  expect(result.markers.find(row => row.id === 'seen:zipline')).toEqual({ id: 'seen:zipline', label: 'ZIPLINE', short: 'ZIPLINE', x: 71, z: 32 });
  progress.playS = 59; progress.title.title = 'New title';
  expect(completionProjection(policy, flags, progress).data.stats.at(-1)?.value).toBe('New title');
  expect([fmtPlayTime(0), fmtPlayTime(60), fmtPlayTime(3599)]).toEqual(['< 1m', '1m', '59m']);
  expect(() => parseCompletion({ ...policy, stats: [{ label: 'Missing', value: { kind: 'group', group: 'missing', total: 1 } }] })).toThrow();
});

test('reward handoff, saved seen flag, safe fallback and keep-exploring preserve their owners and order', () => {
  const f = fixture(), objective = document.createElement('div'); objective.classList.add('ws-quest-hide');
  try {
    const complete = installCompletion(f.ctx, f.flags, undefined, objective);
    expect(completeEntry()).toBeNull(); f.flags.set(policy.doneFlag); expect(completeEntry()?.sub).toBe(policy.menuSubtitle);
    for (const system of f.systems) system.run(1, 1); expect(f.log).toEqual([]);
    f.enemy.alive = false; for (const system of f.systems) system.run(1, 2);
    expect(f.log).toEqual(['Driftwood Isle complete · open the menu to see your island']);
    expect(complete.showAfterReward()).toBe(true); expect(complete.showAfterReward()).toBe(false);
    expect(f.flags.has(policy.seenFlag)).toBe(true); expect(f.player.carried).toBe(true); expect(f.player.velocity.length()).toBe(0);
    expect(f.weapons.visible).toBe(false); expect(f.audio.worldMuted).toBe(true);
    document.querySelector<HTMLButtonElement>('[data-act="keep"]')?.click();
    expect(complete.up).toBe(false); expect(f.player.carried).toBe(false); expect(f.weapons.visible).toBe(true); expect(f.audio.worldMuted).toBe(false);
    expect(objective.classList.contains('ws-quest-hide')).toBe(false); expect(f.log.at(-1)).toBe('resume');
    expect(complete.showAfterReward()).toBe(false); complete.open(); expect(complete.up).toBe(true);
    f.scope.dispose(); expect(complete.up).toBe(false);
  } finally { f.scope.dispose(); }
});

test('Template consumes an actual emitted second-user section and opens its minimal card once on quest completion', () => {
  const platform = template.platform;
  if (platform === undefined) throw new Error('Template must declare completion sections');
  const descriptor = platform.sections.find(row => row.name === 'ui/completion');
  const bytes = descriptor === undefined ? undefined : platform.files.get(descriptor.path);
  if (bytes === undefined) throw new Error('Template must emit its completion policy');
  const rows = parseCompletion(JSON.parse(new TextDecoder().decode(bytes))), f = fixture(rows);
  f.enemy.alive = false;
  try {
    const complete = installCompletion(f.ctx, f.flags, undefined);
    expect(complete.up).toBe(false); f.flags.set(rows.doneFlag);
    for (const system of f.systems) system.run(1, 1);
    expect(complete.up).toBe(true); expect(f.flags.has(rows.seenFlag)).toBe(true);
    expect(document.querySelectorAll('.ws-complete-stat')).toHaveLength(0);
    document.querySelector<HTMLButtonElement>('[data-act="keep"]')?.click();
    for (const system of f.systems) system.run(1, 2);
    expect(complete.up).toBe(false); expect(f.log).toEqual(['resume']);
  } finally { f.scope.dispose(); }
});
