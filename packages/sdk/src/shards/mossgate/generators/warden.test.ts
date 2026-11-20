// MOSSGATE-ZONE MZ20: the Barrow Warden, a real boss. Three phases on its boss bar (the slam and the sweep; then the thrown
// stone; then its four crawlers), each blow told by its own panel before it lands, and blows that reach a player at its
// side: its body is 1.3 m round, so a player swinging at it stands 2 m off or more, where the old 1.6 m slam and 2.2 m
// facing-only sweep never landed.
import { expect, test } from 'vitest';
import { builtSceneShardfile } from '@wildshard/sdk/scene/shardfile';
import { compileScript } from '@wildshard/sdk/compileScript';
import { BODIES, HAUNTS, STRIKES } from './creatures';
import { ENCOUNTERS, WARDEN_DECISION, WARDEN_FIELDS, WARDEN_PANELS } from './fights';
import { gameplay } from './gameplay';
import { mossgate } from './shard';
import { LAYOUT } from './world';

test('the Warden fights in three phases, the last with its crawlers out', { timeout: 120_000 }, async () => {
  const { shard } = await builtSceneShardfile(mossgate.describe(), compileScript, { extend: gameplay });
  const fight = shard.encounters.find((row) => row.id === ENCOUNTERS.warden);
  expect(fight?.phases.map((p) => [p.at, p.name])).toEqual([[1, 'First phase'], [0.6, 'Second phase'], [0.3, 'Third phase']]);
  expect(fight?.phases[2]?.adds).toEqual(BODIES.crawlers);
  // the crawlers rise inside the ring round the Warden, pursue, and come back with the fight (no respawn of their own)
  for (const id of BODIES.crawlers) {
    const row = shard.creatures.spawns.find((s) => s.id === id);
    expect(row, id).toMatchObject({ species: 'barrow.crawler', brain: 'mossgate.blob-pursuit' });
    expect(Math.hypot((row?.at[0] ?? 0) - LAYOUT.ARENA.x, (row?.at[2] ?? 0) - LAYOUT.ARENA.z), id).toBeLessThan(LAYOUT.ARENA.r - 1);
    expect(row?.respawn, id).toBeUndefined();
  }
  // each blow's tell is its own field and panel
  const script = WARDEN_DECISION as unknown as { fields: Record<string, string>; params: Record<string, number>; state: { name: string; max?: number }[] };
  expect(script.fields).toMatchObject({ tell: WARDEN_FIELDS.tell.name, sweep: WARDEN_FIELDS.sweep.name, stone: WARDEN_FIELDS.stone.name });
  for (const [field, panel] of [[WARDEN_FIELDS.sweep, WARDEN_PANELS.sweep], [WARDEN_FIELDS.stone, WARDEN_PANELS.stone]] as const) {
    expect(shard.targets.panels.find((row) => row.panel === panel)?.fieldId, panel).toBe(field.id);
  }
  // each phase beats faster
  expect(script.params['firstBeat']).toBeGreaterThan(script.params['secondBeat'] ?? 0);
  expect(script.params['secondBeat']).toBeGreaterThan(script.params['thirdBeat'] ?? 0);
  expect(script.state.find((row) => row.name === 'phase')?.max).toBe(4);
});

test('the Warden\'s blows reach a player at its side', () => {
  const stand = 1.3 + 0.7;
  const slam = STRIKES.wardenSlam.shape, sweep = STRIKES.wardenSweep.shape, stone = STRIKES.wardenThrow.shape;
  expect(slam.kind === 'point' ? slam.radius : 0).toBeGreaterThan(stand + 1);
  // the sweep goes all round its feet (the Warden does not turn to sweep), wider than the slam
  expect(sweep.kind === 'arc' ? sweep.halfAngle : 0).toBeGreaterThan(3);
  expect(sweep.kind === 'arc' && slam.kind === 'point' && sweep.radius > slam.radius).toBe(true);
  // the stone flies down a lane at its target, as far as the ring's far side
  expect(stone.kind === 'lane' ? stone.length : 0).toBeGreaterThanOrEqual(HAUNTS.WARDEN.r * 2);
});
