// meta TEMPLATE-E2E TR-12b: a scene shard's boss runs a decision script. `defineShard`'s `decisions` are the script rows
// (`sim/scripts`, each naming its `behaviour/*.as` source); the build hands them to the project's decision compiler, the
// one path every decision script takes (a data shard's output sidecar, Brasscap's Wyrm), so a scene shard needs no
// hand-written generator wrapper to carry one.
import { expect, test } from 'vitest';
import type { DecisionScripts } from '@wildshard/format/decisionScripts';
import { outputDecisionScripts } from '../outputProduct';
import { hashImmutableBytes } from '../immutable';
import type { ProjectGenerationContext } from '../projectGeneration';
import { defineShard } from './shard';

const ROW = {
  id: 'den.boss.decision', abi: '1.0', side: 'sim', module: `blobs/wasm/${'0'.repeat(64)}.wasm`, source: 'behaviour/boss.as',
  binding: { encounter: 'den.boss' }, pages: 1, onFail: 'reset', on: ['start', 'stop'], tick: null, reads: [], commands: ['stop'],
  actors: { boss: 'boss' }, moves: {}, strikes: {}, cues: {}, fields: {}, flags: {}, zones: {}, spots: {}, targets: {}, spawns: {},
  signals: {}, facts: {}, rewards: {}, channels: {}, impulses: {}, weather: {}, timers: [], stateVersion: 1, state: [], params: {},
} as unknown as DecisionScripts[number];

const ctx = { asset: (bytes: Uint8Array): string => hashImmutableBytes(bytes), compileScript: () => { throw new Error('no state lane here'); } } as unknown as ProjectGenerationContext;
const build = (world: Parameters<Parameters<typeof defineShard>[1]>[0]): void => { world.ground(() => 0); world.spawn(0, 1, 0, 0); };

test('a scene shard declares its decision scripts, and the build output carries them as sim/scripts', async () => {
  const shard = defineShard({ slug: 'den', name: 'Den' }, build, { decisions: [ROW] });
  const { output } = await shard(ctx);
  expect(outputDecisionScripts(output.platform).map((row) => [row.id, row.source])).toEqual([['den.boss.decision', 'behaviour/boss.as']]);
});

test('a scene shard with no decisions has no platform sections', async () => {
  const { output } = await defineShard({ slug: 'den', name: 'Den' }, build)(ctx);
  expect(output.platform).toBeUndefined();
});
