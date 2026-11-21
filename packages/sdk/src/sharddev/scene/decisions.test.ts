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

// meta ONE-FORMAT CC26: a boss's decision script runs its actor's moves (`actors/moves`) and lands on named spots
// (`world/targets`); `defineShard` takes both beside `decisions`, emitted on the same path, so a serpent's burrow and leap
// need no hand-written platform sections.
test('a scene shard declares its moves and spots beside its decisions, and the output carries them', async () => {
  const moves = [{ id: 'den.boss.leap', kind: 'leap', to: { kind: 'spot', spot: 'den.mound' }, height: 9 }] as const;
  const spots = [{ id: 'den.mound', at: [2, 0, -10], yaw: 0 }] as [{ id: string; at: [number, number, number]; yaw: number }];
  const { output } = await defineShard({ slug: 'den', name: 'Den' }, build, { decisions: [ROW], moves, spots })(ctx);
  expect(output.platform?.sections.map((row) => row.name)).toEqual(['actors/moves', 'sim/scripts', 'world/targets']);
  const read = (name: string): unknown => JSON.parse(new TextDecoder().decode(output.platform?.files.get(`sections/${name}.json`)));
  expect(read('actors/moves')).toMatchObject([...moves]);
  expect(read('world/targets')).toEqual({ targets: [], spots });
});

// meta MOSSGATE-ZONE MZ35: a scene shard's completion card, the card a grid cell opens once its quest's done flag is up
test('a scene shard declares its completion card, and the output carries it as ui/completion', async () => {
  const completion = { doneFlag: 'den.done', seenFlag: 'den.card', trigger: 'quest', system: 'game.completion', before: ['main.world'], after: [],
    title: 'Den', card: { kicker: 'The den · cleared', flavour: [] }, menuSubtitle: 'The den', toastSuffix: ' complete', safeRadius: 25,
    pollSeconds: 1, maximumTodo: 7, more: 'more', coveredEvents: [], groups: [], stats: [{ label: 'Time played', value: { kind: 'time' } }] } as const;
  const { output } = await defineShard({ slug: 'den', name: 'Den' }, build, { completion: structuredClone(completion) as never })(ctx);
  expect(output.platform?.sections.map((row) => row.name)).toEqual(['ui/completion']);
  expect(JSON.parse(new TextDecoder().decode(output.platform?.files.get('sections/ui/completion.json')))).toEqual(completion);
  await expect(defineShard({ slug: 'den', name: 'Den' }, build, { completion: { ...completion, trigger: 'toast' } as never })(ctx)).rejects.toThrow();
});
