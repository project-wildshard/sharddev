import { expect, test, vi } from 'vitest';
import { BufferGeometry, Float32BufferAttribute, InstancedMesh, InterleavedBufferAttribute, MeshBasicMaterial, PerspectiveCamera, Vector3 } from 'three';
import { Scope } from '../src/shared/engine/app/scope';
import { ReturnProgram } from '../src/shared/game/population/returnProgram';
import { parsePageLife } from '@wildshard/format/pageLife';
import { PINE_LIFE_ORIGINAL as program } from './fixtures/pine-life';
import { PAGE_LIFE } from '../src/shards/pine-hollow/generators/pageLife';
import { PAGE_LIFE as coastLife } from '../src/shards/driftwood-isle/generators/pageLife';
import { AmbientFlockDraw } from '../src/client/game/ambient/ambientFlock';
import { installPageLife } from '../src/client/game/population/pageLife';
import type { ShardContext, GameServices } from '../src/client/game/plugin/context';
import type { ShardRuntime } from '../src/shared/game/shard/runtime';
import type { ShardWorld } from '../src/server/game/shard/world';
import type { Game } from '../src/client/engine/core/Game';
import type { Player } from '../src/client/engine/player/Player';
import type { SkyRig } from '../src/client/engine/world/skyRig';
import type { SystemSpec } from '../src/client/engine/app/systems';
import { legacyDouble, FakeGame } from '@wildshard/engine/test/FakeGame';
import { HeldEquipment } from '../src/client/game/plugin/heldEquipment';
import type { HeldTool } from '../src/client/game/plugin/heldTool';
import type { Animal } from '../src/client/engine/entities/AnimalView';
import type { AnimalManager } from '../src/server/engine/entities/AnimalManager';
import type { EquipmentService } from '../src/client/engine/combat/EquipmentService';
import type { Audio } from '../src/client/engine/audio/Audio';
import type { DeclaredSoundBank } from '../src/client/engine/audio/declaredBank';
import type { ShardManifest } from '../src/client/game/shard/manifest';
import { PosedDraw, type PosedLayout } from '../src/client/game/looks/posedInstances';

test('forest v1 decisions retain arrival draws and exact corpse boundaries', () => {
  const guest = ReturnProgram.page(program);
  for (const draw of [0, 0.2, 1]) for (const scale of [0.5, 1]) {
    expect(guest.project('arrival', { now: 7, minimum: 18, maximum: 52, draw, scale }))
      .toEqual({ arrival: 7 + (18 + draw * (52 - 18)) * scale });
  }
  const fields = { now: 100, kill: 0, arrival: 100, harvest: -1, site: -1, visit: 3,
    distance: 170, reach: 170, giveUp: 240, present: 1 };
  expect(guest.project('carcass', fields)).toEqual({ gather: 1 });
  expect(guest.project('carcass', { ...fields, distance: 170.01 })).toEqual({ gather: -2 });
  expect(guest.project('carcass', { ...fields, now: 99.99 })).toEqual({});
  expect(guest.project('carcass', { ...fields, present: 0 })).toEqual({ remove: 1 });
  expect(guest.project('carcass', { ...fields, site: 0, visit: 2, harvest: 10, now: 250 })).toEqual({ dim: 1 });
  expect(guest.project('carcass', { ...fields, site: 0, visit: 2, harvest: 10, now: 250.01 })).toEqual({ dim: 1, fade: 1, remove: 1 });
  expect(guest.project('carcass', { ...fields, site: -2, now: 900 })).toEqual({});
  expect(guest.project('carcass', { ...fields, site: -2, now: 900.01 })).toEqual({ remove: 1 });
  for (const [night, combat, eligible] of [[0.49, 0, 1], [0.5, 0, 0], [0, 1, 0]] as const)
    expect(guest.project('guide', { night, combat })).toEqual({ eligible });
});

test('hollow admission retains the original floor-plane distance and strict vertical boundary', () => {
  const guest = ReturnProgram.page(program);
  const center = new Vector3(), point = new Vector3();
  for (const [x, y, z] of [[0, 0, 0], [15, 2, -20], [10000, 10, -10000]]) {
    if (x === undefined || y === undefined || z === undefined) throw new Error('Missing original center');
    center.set(x, y, z);
    for (const dy of [0, 0.3, 2.3]) for (const dx of [0, 2.2 - 1e-9, 2.2, 2.2 + 1e-9])
      for (const height of [0, 0.8 - 1e-9, 0.8, 0.8 + 1e-9]) for (const taken of [0, 1]) {
        const floorY = y + dy, playerX = x + dx, playerY = floorY + height, playerZ = z;
        const original = taken === 0 && center.distanceToSquared(point.set(playerX, floorY, playerZ)) < 2.2 * 2.2
          && Math.abs(playerY - floorY) < 0.8;
        expect(guest.project('secret', { playerX, playerY, playerZ, atX: x, atY: y, atZ: z, floorY, taken }))
          .toEqual({ accept: Number(original) });
      }
  }
});

// the coast's borrowed gull flock (its reef fish school draws from its own product library, read through a real product)
const coast = parsePageLife({ ...coastLife, flocks: coastLife.flocks.filter(row => row.library === undefined) });
test('page wildlife and its own guide retain two shadow policies over one scoped upload owner', async () => {
  const fake = new FakeGame(), source = new BufferGeometry().setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  const material = new MeshBasicMaterial(), systems: SystemSpec[] = [];
  const layout: PosedLayout = { name: 'wildlife', attributes: ['aAnim', 'aAnim2'], channels: [['a0', 'a1', 'a2', 'a3'], ['kind', 'b1', 'b2', 1]] };
  const library = vi.spyOn(PosedDraw, 'library').mockResolvedValue({ name: layout.name, models: [], preload: () => Promise.resolve(),
    look: () => ({ name: layout.name, geometry: source, material }),
    draw: (capacity, buffers) => new PosedDraw(layout, capacity, source, material, buffers) });
  const rows = { version: 1, seed: PAGE_LIFE.seed, system: PAGE_LIFE.system, draw: PAGE_LIFE.draw, flocks: PAGE_LIFE.flocks, foragers: [] };
  const ctx = legacyDouble<ShardContext>({ scope: fake.playerScope, product: legacyDouble<ShardContext['product']>({}),
    game: legacyDouble<GameServices>({ runtime: legacyDouble<ShardRuntime>({ hooks: {}, play: null,
      world: legacyDouble<ShardWorld>({ game: fake.asGame(), player: legacyDouble<Player>({ position: new Vector3(), sprinting: false }),
        sky: legacyDouble<SkyRig>({ dayNight: null }) }) }) }), system: spec => { systems.push(spec); } });
  try {
    const life = await installPageLife(ctx, rows), wild = life.mesh;
    if (wild === undefined) throw new Error('Missing wildlife');
    const guideGroup = wild.children[0], guide = guideGroup?.children[0];
    if (!(guide instanceof InstancedMesh)) throw new Error('Missing guide draw');
    expect(wild.receiveShadow).toBe(true); expect(guide.receiveShadow).toBe(false);
    expect(guide.parent?.parent).toBe(wild);
    const guideRow = PAGE_LIFE.flocks.find(row => row.id === 'guide');
    if (guideRow === undefined || !(guide.geometry instanceof BufferGeometry)) throw new Error('Missing guide row or geometry');
    expect(systems.map(system => system.id).sort((a, b) => a.localeCompare(b))).toEqual([PAGE_LIFE.system.id, guideRow.row.system.id].sort((a, b) => a.localeCompare(b)));
    const a = wild.geometry.getAttribute('aAnim'), b = guide.geometry.getAttribute('aAnim');
    if (!(a instanceof InterleavedBufferAttribute) || !(b instanceof InterleavedBufferAttribute)) throw new Error('Expected shared channels');
    expect(a.data).toBe(b.data); expect(a.offset).toBe(0); expect(b.offset).toBe((PAGE_LIFE.draw?.capacity ?? 0) * 4);
    for (const system of systems) system.run(1 / 60, 1 / 60);
    expect(wild.receiveShadow).toBe(true); expect(guide.receiveShadow).toBe(false);
  } finally { library.mockRestore(); fake.playerScope.dispose(); source.dispose(); material.dispose(); }
});
test('page owner preserves the real coast flock and an independent marsh draw', async () => {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  const material = new MeshBasicMaterial(), at = new Vector3(0, 1.7, 0);
  const first = coast.flocks[0]; if (first === undefined) throw new Error('Missing coast group');
  const marsh = parsePageLife({ ...coast, seed: 23, system: { ...coast.system, id: 'marsh.flight' },
    flocks: [{ ...first, id: 'reedbirds', row: { ...first.row, seed: 23, count: 3, scale: 0.3 } }] });
  try {
    for (const rows of [coast, marsh]) {
      const row = rows.flocks[0]; if (row === undefined) throw new Error('Missing group');
      const draw = new AmbientFlockDraw(row.row, { name: row.id, geometry, material }, []);
      const control = new AmbientFlockDraw(row.row, { name: 'control', geometry, material }, []);
      const systems: SystemSpec[] = [], hooks = {}, scope = new Scope('ambient-page');
      const ctx = legacyDouble<ShardContext>({
        scope, game: legacyDouble<GameServices>({ runtime: legacyDouble<ShardRuntime>({ hooks, play: null,
          world: legacyDouble<ShardWorld>({ game: legacyDouble<Game>({ camera: new PerspectiveCamera() }),
            sky: legacyDouble<SkyRig>({ dayNight: null }), player: legacyDouble<Player>({ position: at }) }) }) }),
        system: spec => { systems.push(spec); },
      });
      try {
        const life = await installPageLife(ctx, rows, null, null, new Map([[row.id, draw]]));
        expect(life.busy).toBe(false); expect(hooks).toEqual({});
        expect(systems.map(value => value.id)).toEqual([rows.system.id]);
        for (let frame = 0; frame < 1200; frame++) {
          for (const system of systems) system.run(1 / 60, frame / 60);
          control.update(1 / 60, at);
        }
        expect(draw.flock.birds).toEqual(control.flock.birds);
        expect(draw.mesh.count).toBe(control.mesh.count);
        expect(draw.mesh.instanceMatrix.array).toEqual(control.mesh.instanceMatrix.array);
      } finally { scope.dispose(); draw.mesh.geometry.dispose(); control.mesh.geometry.dispose(); }
    }
    expect(PAGE_LIFE.carcasses?.group).toBe('scavengers');
    const guide = PAGE_LIFE.guide;
    if (guide !== undefined) expect(() => parsePageLife({ ...PAGE_LIFE, guide: { ...guide, policy: { ...guide.policy, schedule: { ...guide.policy.schedule, period: [0, 0] } } } })).toThrow();
    expect(() => parsePageLife({ ...marsh, flocks: [{ ...marsh.flocks[0], perches: [{ x: 0, y: Infinity, z: 0 }] }] })).toThrow();
  } finally { geometry.dispose(); material.dispose(); }
});

test('independent marsh tool rows hold the real reward until the final frame', async () => {
  const rows = parsePageLife({ ...coast, flocks: [], harvest: { len: 0.8, kneelIn: 0.1, rise: 0.6,
    cuts: [0.2, 0.4], sounds: ['reed-cut', 'reed-pull'], camera: { down: 0.2, targetY: 0.1, defaultPitch: 0.2, maxPitch: 0.4 },
    surface: 'grass', gain: 0.7, kick: [-0.5, 0.2], fallbackSurface: 'ground', fallbackPan: 0.2, fallbackGain: 0.3 } });
  const fake = new FakeGame(), game = fake.asGame(), systems: SystemSpec[] = [], hooks: ShardRuntime['hooks'] = {};
  const toolFrames: number[] = [], sounds: string[] = [];
  const equipment = legacyDouble<EquipmentService>({ enabled: true, visible: true,
    setEnabled: value => { equipment.enabled = value; } });
  const player = legacyDouble<Player>({ position: new Vector3(0, 1.7, 0), swimming: false });
  const ctx = legacyDouble<ShardContext>({
    scope: fake.playerScope, manifest: legacyDouble<ShardManifest>({ slug: 'pastel-plain' }),
    game: legacyDouble<GameServices>({ runtime: legacyDouble<ShardRuntime>({ hooks,
      play: legacyDouble<NonNullable<ShardRuntime['play']>>({ animals: legacyDouble<AnimalManager>({ animals: [] }),
        weapons: equipment, audio: legacyDouble<Audio>({ footstep: () => undefined }) }),
      world: legacyDouble<ShardWorld>({ game, player, sky: legacyDouble<SkyRig>({ dayNight: null }) }) }) }),
    system: spec => { systems.push(spec); },
  });
  const held = vi.spyOn(HeldEquipment, 'current').mockReturnValue(legacyDouble<HeldEquipment>({
    tool: () => legacyDouble<HeldTool>({ update: time => { toolFrames.push(time); } }),
  }));
  try {
    const bank = legacyDouble<DeclaredSoundBank>({ shot: id => { sounds.push(id); return true; } });
    const life = await installPageLife(ctx, rows, null, bank);
    let rewards = 0;
    hooks.harvest?.(legacyDouble<Animal>({ position: new Vector3(0, 0, -1) }), () => { rewards++; });
    expect(life.busy).toBe(true); expect(equipment.enabled).toBe(false); expect(equipment.visible).toBe(false);
    for (let frame = 0; frame < 47; frame++) for (const system of systems) system.run(1 / 60, frame / 60);
    expect(rewards).toBe(0); expect(sounds).toEqual(['reed-cut', 'reed-pull']);
    for (const system of systems) system.run(1 / 60, 0.8);
    expect(rewards).toBe(1); expect(life.busy).toBe(false);
    expect(equipment.enabled).toBe(true); expect(equipment.visible).toBe(true);
    for (const system of systems) system.run(1 / 60, 1);
    expect(rewards).toBe(1); expect(toolFrames.at(-1)).toBe(-1);
  } finally { held.mockRestore(); fake.playerScope.dispose(); }
});
