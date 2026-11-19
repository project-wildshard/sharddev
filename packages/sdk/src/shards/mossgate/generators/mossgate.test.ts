import { expect, test } from 'vitest';
import { sceneSummary } from '@wildshard/sdk/scene/lower';
import { builtSceneShardfile } from '@wildshard/sdk/scene/shardfile';
// the build hands the compiler in (`ctx.compileScript`); a test passes the sdk's own
import { compileScript } from '@wildshard/sdk/compileScript';
import { parseShardfile } from '@wildshard/format/shardSchema';
import { gameplay } from './gameplay';
import { mossgate } from './shard';
import { groundHeight } from './world';

/** SHARD-SOURCE AP15: the whole cleanroom (mossgate-cleanroom 9cb4dc6 src/world.js) lowers with no refusal, one part per
 *  section, with the colliders, lights, water and sky the cleanroom has. */
test('Mossgate whole lowers with every section', () => {
  const t0 = performance.now();
  const shard = mossgate.describe();
  console.info(`lowered in ${(performance.now() - t0).toFixed(0)} ms`, sceneSummary(shard));
  const names = shard.parts.map((p) => p.name);
  for (const name of ['light', 'walls', 'district', 'paths', 'braziers', 'hut', 'sign', 'gate', 'lamplighter', 'pond', 'arena', 'trees', 'boulders', 'flora', 'fireflies']) expect(names).toContain(name);
  const part = (name: string) => shard.parts.find((p) => p.name === name);
  // the walls' runs, the gate's pillars and bars, the arena's ring: colliders said at the cleanroom's numbers
  expect(part('walls')?.colliders.length).toBeGreaterThan(8);
  expect(part('arena')?.colliders.length).toBeGreaterThan(30);
  // the gate's two pillars; its bars are their own panel (TR-12: brazier A's field sinks them)
  expect(part('gate')?.colliders).toHaveLength(2);
  expect(part('gate-bars')?.colliders).toHaveLength(1);
  // TR-12: every brazier starts cold (no fire, no light): their flames are panels their fields show
  expect(part('braziers')?.lights.filter((l) => l.kind === 'point')).toHaveLength(0);
  expect(part('pond')?.water).toHaveLength(1);
  // AP32d: the grass and the ferns are detail layers (counts per cell, the engine grows them round the camera)
  const layer = (id: string) => shard.details?.find((d) => d.id === id);
  expect(shard.details?.map((d) => d.id)).toEqual(['ferns', 'grass']);
  expect(layer('grass')?.clumps).toBeGreaterThan(5);
  expect(layer('grass')?.sway).toEqual({ amount: 0.06, rate: 0.5 });
  expect(layer('ferns')?.shadow).toBe(true);
  expect(shard.look.sky?.graph.kind).toBe('material');
  expect(shard.ground).not.toBeNull();
  // SS8e: the gallows-post and bracket lanterns hang (5 posts, 6 brackets), each lamp with its lantern's swing
  const swings = shard.parts.flatMap((p) => p.swings ?? []);
  expect(swings).toHaveLength(11);
  expect(shard.parts.flatMap((p) => p.lights).filter((l) => l.swing !== undefined)).toHaveLength(11);
  // SS9e: the crate inside the yard gate is a touchable panel, its body fitted round it
  expect(part('crate')?.touch).toMatchObject({ material: 'wood', density: 250, shape: { cuboid: { x: expect.closeTo(0.41, 2), y: expect.closeTo(0.4, 2), z: expect.closeTo(0.41, 2) } } });
});

// The full cook walks all 23 lanes for 50 m. Keep the terrain samples
// beneath those walks flat too, including the interpolation margin.
test('Mossgate keeps every 50m edge approach at road height', () => {
  for (let lane = 0; lane <= 22; lane++) {
    const lateral = -3.65 + lane * 7.3 / 22;
    for (let inward = 0; inward <= 54; inward += 0.5) {
      const edge = 249.6 - inward;
      for (const [x, z] of [[lateral, edge], [lateral, -edge], [edge, lateral], [-edge, lateral]] as const) {
        expect(groundHeight(x, z), `road at ${x},${z}`).toBe(0);
      }
    }
  }
});

// TEMPLATE-E2E TR-12 (J434): the Template's gameplay (its TC-M rows) on Mossgate's scene, before `_template` goes (TR-11).
// The built shardfile carries every switch as scene state (SS-GF0: the sdk writes the fields, scenes, panels and script),
// the quests and both talks, and the rack's take of the moss blade; and it parses whole.
test('Mossgate carries the Template gameplay', { timeout: 120_000 }, async () => {
  const { shard } = await builtSceneShardfile(mossgate.describe(), compileScript, { extend: gameplay });
  // oxlint-disable-next-line unicorn/prefer-structured-clone -- JSON wire normalization, as the build writes it
  expect(() => parseShardfile(JSON.parse(JSON.stringify(shard)))).not.toThrow();
  const uses = new Map(shard.targets.interactions.map((row) => [row.id, row]));
  for (const id of ['mossgate.brazier-a.use', 'mossgate.brazier-b.use', 'mossgate.brazier-c.use', 'mossgate.lever.use', 'mossgate.chest.use', 'mossgate.rack.use']) expect(uses.has(id), id).toBe(true);
  // a lit brazier's prompt goes (spent), and so does the pulled lever's and the opened chest's
  expect(uses.get('mossgate.brazier-a.use')?.unless).toBe('mossgate.brazier-a.use.spent');
  const field = (name: string) => shard.state.shared.find((f) => f.name === name)?.id;
  const shown = (panel: string) => shard.targets.panels.find((p) => p.panel === panel);
  // brazier A's flames show, and the moss gate's bars (and their collider) go, once it burns
  expect(shown('mossgate.flame-a')).toMatchObject({ fieldId: field('mossgate.brazier-a'), equals: 1, visibleWhenMatched: true });
  expect(shown('mossgate.gate')).toMatchObject({ fieldId: field('mossgate.brazier-a'), equals: 0, colliders: ['mossgate.gate'] });
  expect(shown('mossgate.pond-stones')).toMatchObject({ fieldId: field('mossgate.brazier-b'), equals: 1, colliders: ['mossgate.pond-stones'] });
  // TC-M4a: the lever opens the north gate; TC-M4b: the lift rides to the ledge cache, whose region pays
  expect(shown('mossgate.north-gate')).toMatchObject({ fieldId: field('mossgate.north-gate.open'), equals: 0, colliders: ['mossgate.north-gate'] });
  expect(shard.movers?.map((m) => m.id)).toEqual(['mossgate.lift']);
  expect(shard.quests.triggers.find((t) => t.id === 'mossgate.ledge.found')).toMatchObject({ kind: 'region', radius: 1.4 });
  // TC-M5a, TC-M5b: the chest's lid opens; the rack hands over the moss blade, not in the loadout, and raises its flag
  expect(shown('mossgate.chest.lid-open')).toMatchObject({ fieldId: field('mossgate.chest.open'), equals: 1 });
  expect(shard.targets.itemActions).toContainEqual({ scene: 'mossgate.rack.take', item: 'weapon.moss-blade', action: 3, setsFlag: 'mossgate.rack.taken' });
  expect(shard.items.rows.map((r) => r.id)).toEqual(['weapon.sword-iron', 'weapon.moss-blade', 'tool.hut-lantern']);
  // the Template's held lantern: the hut lantern comes off its stand by the door (a pickup: the sdk's take of a tool)
  expect(shard.targets.itemActions).toContainEqual({ scene: 'mossgate.lantern.take', item: 'tool.hut-lantern', action: 3, setsFlag: 'mossgate.lantern.taken' });
  // the quests' facts pay achievements (the Template's ledger)
  expect(shard.ledger.map((row) => row.fact)).toEqual(['mossgate.first-light', 'mossgate.lamplighter', 'mossgate.hermit', 'mossgate.chest', 'mossgate.ledge']);
  expect(shard.items.loadout.primary).toBe('weapon.sword-iron');
  // TC-M3, TC-M6: two talks, the Lamplighter drawn by her own figure panel
  expect(shard.targets.talks?.map((t) => [t.id, t.dialogue, t.figure])).toEqual([['mossgate.lamplighter.talk', 'mossgate.lamplighter', 'mossgate.lamplighter'], ['mossgate.hermit.talk', 'mossgate.hermit', undefined]]);
  expect(shard.props?.panels.map((p) => p.id)).toContain('mossgate.lamplighter');
  // TC-M7a: the quests chain (the starter's hut, the first flame, the Lamplighter's relighting, the Hermit's gate, three side quests)
  expect(shard.quests.quests.map((q) => q.id)).toEqual(['hut.visit', 'mossgate.first-light', 'mossgate.lamplighter', 'mossgate.hermit', 'mossgate.chest', 'mossgate.ledge', 'mossgate.rack']);
  // a lit brazier raises its flag through the condition the sdk wrote for its prompt
  const conditions = new Set(shard.hooks.conditions.map((c) => c.id));
  for (const t of shard.quests.triggers) if (t.kind === 'script') expect(conditions.has(t.condition), t.condition).toBe(true);
});
