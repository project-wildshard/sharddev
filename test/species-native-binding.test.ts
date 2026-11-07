import { expect, test, vi } from 'vitest';
import { Bone, BufferGeometry, MeshStandardMaterial, SkinnedMesh, Vector3 } from 'three';
import { Animal } from '../src/client/engine/entities/AnimalView';
import { AnimalSim } from '../src/shared/engine/entities/AnimalSim';
import type { AnimalModel } from '../src/client/engine/entities/AnimalFactory';
import { speciesWithLook, type SpeciesLook } from '../src/client/engine/entities/species/look';
import type { SpeciesRow } from '../src/server/engine/ai/species';
import type { ThinkCtx } from '../src/shared/engine/entities/species/registry';
import { CRAB, MONKEY, SAILOR } from './fake/driftwoodSpecies';
import { Rng } from '../src/shared/engine/core/rng';
import { speciesBrains } from '../src/sharddev/speciesBrains';
import { strike } from '../src/sharddev/species';
import { DRIFTWOOD_ENEMY_SPECIES } from '../src/shards/driftwood-isle/generators/enemySpecies';
import { CRAB_LOOK, SAILOR_LOOK, MONKEY_LOOK } from './fake/driftwoodLooks';
import { SIGNAL_SPECIES, SIGNAL_STRIKES, SIGNAL_MODULES } from '../src/shards/sunscar-dunes/generators/rows/brains';
import DRIFTWOOD_STRIKE_ROWS from '../src/shards/driftwood-isle/data/strikes.json' with { type: 'json' };
import { SKITTERER_DATA } from '../src/shards/sunscar-dunes/generators/rows/species/skitterer';
import { spawnRuntimeHome, type RuntimeHome } from '../src/shared/game/plugin/runtimeRows';
import { DUNE_RAY } from '../src/shards/sunscar-dunes/generators/rows/species/duneRay';

function body(row: SpeciesRow, look: SpeciesLook, scale = 1, entityId?: string): { actor: Animal; dispose: () => void } {
  const variant = row.variants[0];
  if (variant === undefined) throw new Error('Test body needs a variant');
  const geometry = new BufferGeometry(), material = new MeshStandardMaterial(), mesh = new SkinnedMesh(geometry, material);
  const root = new Bone(), head = new Bone(); root.add(head); mesh.add(root);
  const model: AnimalModel = {
    kind: row.kind, variant: variant.id, style: 'toon', species: speciesWithLook(row, look), variantDef: variant,
    render: { lowPoly: true, waitForModels: false, furRim: false, tintRange: 0, oneMaterial: true },
    geometry, bones: [], dims: { bodyY: 1, bodyHalfLen: .5, bodyRadius: .3, headRadius: .2, legLen: 1, feet: [], halfWidth: .3 },
    fur: material, hard: material, eye: material, shells: [],
  };
  const actor = new Animal({ mesh, bones: { body: root, head }, materials: [material] }, model, .5, scale, entityId);
  actor.bindSimulation(new AnimalSim({ kind: row.kind, label: actor.label, variant: variant.id, rarity: variant.rarity,
    hp: actor.maxHp, aggressive: actor.aggressive, dims: model.dims, mods: actor.mods,
    ...(row.flight === undefined ? {} : { flight: row.flight }),
  }, .5, scale, actor.entityId, { heightAt: () => 0, random: () => .5 }));
  return { actor, dispose: () => { geometry.dispose(); material.dispose(); } };
}
function context(): ThinkCtx {
  return {
    dt: .1, t: 0, player: new Vector3(0, 0, 1), playerSpeed: 0, rng: new Rng(357), calm: false, herd: null, world: {},
    hurt: () => undefined, sound: () => undefined, heightAt: () => 0, waterLevel: () => 0,
    steer: (a, yaw, speed, turn) => { a.setMotion(yaw, speed, turn); },
    flight: { steer: (a, yaw, speed, altitude, turn) => { a.fly(yaw, speed, altitude, turn); } },
    pathYaw: (a, x, z) => Math.atan2(x - a.position.x, z - a.position.z),
    confine: () => undefined, reach: () => true, claim: () => true, mayAttack: () => true,
  };
}

test('standalone decision homes allocate declared page identities and refill through replacement', () => {
  const id = 'test.pack.member', first = body(CRAB, CRAB_LOOK, 1, id), next = body(CRAB, CRAB_LOOK, 1, id);
  const animals = { spawn: vi.fn(() => first.actor), replace: vi.fn(() => next.actor) };
  const home: RuntimeHome = { id, kind: 'crab', x: 2, z: 3, yaw: 0, respawn: 1, animal: null, wait: 0 };
  try {
    home.animal = spawnRuntimeHome(animals, home, 'crab', false, [id]);
    expect(animals.spawn).toHaveBeenCalledWith(home.kind, 2, 3, 0, 'crab', { entityId: id });
    expect(home.animal.entityId).toBe(id);
    home.animal = spawnRuntimeHome(animals, home, 'crab', false, [id]);
    expect(animals.replace).toHaveBeenCalledWith(first.actor, 2, 3, 0, 'crab', {});
    expect(home.animal).toBe(next.actor); expect(home.animal.entityId).toBe(id);
    spawnRuntimeHome(animals, { ...home, animal: null }, undefined, false);
    expect(animals.spawn).toHaveBeenLastCalledWith(home.kind, 2, 3, 0, undefined, undefined);
  } finally { first.dispose(); next.dispose(); }
});

test('the species host constructs once on the first act and keeps subsequent contexts live', () => {
  const made = body(CRAB, CRAB_LOOK), catalogue = speciesBrains(DRIFTWOOD_ENEMY_SPECIES, Object.values(DRIFTWOOD_STRIKE_ROWS).map(strike));
  const first = context(), later = context(), constructions: ThinkCtx[] = [], calls: ThinkCtx[] = [];
  const bound = catalogue.bind('crab', (_actor, _decision, initial) => {
    if (initial === undefined) throw new Error('Missing first context');
    constructions.push(initial);
    return { think: ctx => { calls.push(ctx); }, act: ctx => { calls.push(ctx); } };
  });
  try {
    expect(constructions).toEqual([]); expect(catalogue.witness(made.actor)).toBeNull();
    bound.act(made.actor, first); bound.think(made.actor, later); bound.act(made.actor, later);
    expect(constructions).toEqual([first]); expect(calls).toEqual([first, later, later]);
    expect(catalogue.witness(made.actor)).toBe('skirmisher');
  } finally { made.dispose(); }
});

test('monkey first-act allocation draws no decisions and later decisions see the current perch world', () => {
  const made = body(MONKEY, MONKEY_LOOK), first = context();
  try {
    const before = first.rng.snapshot(); MONKEY.act?.(made.actor, first);
    expect(first.rng.snapshot()).toEqual(before); expect(made.actor.mem['init']).toBeUndefined();
    const later = { ...context(), player: new Vector3(50, 0, 0), world: { perches: [new Vector3(7, 5, 0)] } };
    MONKEY.think?.(made.actor, later);
    expect(made.actor.mem['px']).toBe(7);
    const saved = made.actor.snapshot(); made.actor.mem['init'] = 0;
    MONKEY.think?.(made.actor, { ...later, world: { perches: [new Vector3(9, 6, 0)] } });
    expect(made.actor.mem['px']).toBe(9);
    made.actor.restore(saved);
    expect(made.actor.mem['px']).toBe(7);
  } finally { made.dispose(); }
});

test('bound crab and sailor bodies keep once-only strikes and restored attack memory', () => {
  for (const [row, look] of [[CRAB, CRAB_LOOK], [SAILOR, SAILOR_LOOK]] as const) {
    const made = body(row, look), ctx = context(), hits: number[] = [];
    ctx.hurt = damage => { hits.push(damage); };
    try {
      made.actor.mem['st'] = 2; made.actor.mem['hit'] = 0; made.actor.startAttack(.9); made.actor.step(.7);
      const saved = made.actor.snapshot();
      row.act?.(made.actor, ctx); expect(hits.some(damage => damage > 0)).toBe(true);
      hits.length = 0; row.act?.(made.actor, ctx); expect(hits).toEqual([]);
      made.actor.restore(saved); row.act?.(made.actor, ctx);
      expect(hits.some(damage => damage > 0)).toBe(true);
    } finally { made.dispose(); }
  }
});

test('a missed crab or sailor strike stays spent when the target returns inside reach', () => {
  for (const [row, look] of [[CRAB, CRAB_LOOK], [SAILOR, SAILOR_LOOK]] as const) {
    const made = body(row, look), ctx = context(), hits: number[] = [];
    ctx.hurt = damage => { hits.push(damage); };
    try {
      made.actor.mem['st'] = 2; made.actor.mem['hit'] = 0; made.actor.startAttack(.9); made.actor.step(.7);
      ctx.player.set(0, 0, 100); row.act?.(made.actor, ctx);
      expect(hits).toEqual([]); expect(made.actor.mem['hit']).toBe(1);
      ctx.player.set(0, 0, 1); row.act?.(made.actor, ctx); expect(hits).toEqual([]);
    } finally { made.dispose(); }
  }
});

test('the declared patrol species uses the same lazy callback owner through its first act and later contexts', () => {
  const made = body(DUNE_RAY, CRAB_LOOK), catalogue = speciesBrains(SIGNAL_SPECIES, SIGNAL_STRIKES, SIGNAL_MODULES), bound = catalogue.bind(DUNE_RAY.kind);
  try {
    expect(catalogue.witness(made.actor)).toBeNull();
    bound.act(made.actor, context()); expect(catalogue.witness(made.actor)).toBe('patrol-diver');
    const later = context(); later.player.set(50, 0, 50);
    bound.think(made.actor, later); bound.act(made.actor, later);
    expect(Number.isFinite(made.actor.yaw)).toBe(true); expect(Number.isFinite(made.actor.speed)).toBe(true);
    expect(catalogue.witness(made.actor)).toBe('patrol-diver');
  } finally { made.dispose(); }
});

test('declared contacts retain scale, damage, sound and cover through both body paths', () => {
  const catalogue = speciesBrains(DRIFTWOOD_ENEMY_SPECIES, Object.values(DRIFTWOOD_STRIKE_ROWS).map(strike));
  const made = body(CRAB, CRAB_LOOK, 2), ctx = context(), hits: number[] = [], sounds: string[] = [];
  ctx.hurt = amount => { hits.push(amount); }; ctx.sound = name => { sounds.push(name); };
  const native = catalogue.actions('crab', made.actor);
  if (native === null) throw new Error('Missing declared native actions');
  try {
    made.actor.mem['st'] = 2; made.actor.mem['hit'] = 0; made.actor.mods.chargeDamage = 23;
    made.actor.startAttack(.9); made.actor.step(.7); ctx.player.set(0, 0, 2.5);
    const saved = made.actor.snapshot(), contract = catalogue.decision('crab', made.actor).policy.snapshot();
    expect(native.snapshot()).toEqual(contract);
    ctx.reach = () => false; native.act(ctx);
    expect(hits).toEqual([]); expect(sounds).toEqual([]); expect(made.actor.mem['hit']).toBe(1);
    made.actor.restore(saved); native.restore(contract); ctx.reach = () => true;
    expect([made.actor.scale, made.actor.position.x, made.actor.position.z, made.actor.mem['st'], made.actor.mem['hit']]).toEqual([2, 0, 0, 2, 0]);
    native.act(ctx); expect(hits).toEqual([23]); expect(sounds).toEqual(['crab_snap']);
    made.actor.restore(saved); hits.length = 0; sounds.length = 0;
    CRAB.act?.(made.actor, ctx); expect(hits).toEqual([23]); expect(sounds).toEqual(['crab_snap']);
    made.actor.restore(saved); hits.length = 0; ctx.player.z = 2.57;
    native.act(ctx); expect(hits).toEqual([]);
  } finally { made.dispose(); }
});

test('contact rows refuse an unresolved strike before a body or decision exists', () => {
  const crab = DRIFTWOOD_ENEMY_SPECIES.find(row => row.kind === 'crab');
  if (crab?.body?.actions === undefined) throw new Error('Missing declared crab actions');
  const actions = [];
  for (const action of crab.body.actions.actions) actions.push({ ...action, strike: 'strike.missing' });
  const invalid = { ...crab, body: { ...crab.body, actions: { ...crab.body.actions, actions } } };
  expect(() => speciesBrains([invalid], Object.values(DRIFTWOOD_STRIKE_ROWS).map(strike))).toThrow('undeclared strike strike.missing');
});

test('a pack decision requires the existing body and contact authority', () => {
  const brains = speciesBrains(SIGNAL_SPECIES, SIGNAL_STRIKES, SIGNAL_MODULES);
  expect(() => brains.bind(SKITTERER_DATA.kind)).toThrow('Decision species requires its existing body authority');
});
