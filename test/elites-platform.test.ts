import { flatPopulationEnvironment } from './fixtures/population-environment';
// oxlint-disable-next-line import/no-nodejs-modules -- Use the real native body/physics fixture without a renderer.
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { loadRapier } from '../src/shared/engine/physics/rapier';
import { createSimHost } from '../src/server/engine/sim';
import { ScriptStrikes } from '../src/server/game/population/scriptStrikes';
import { SIM_LEVEL } from './fixtures/sim-level/level';
import { leadCommands } from '@wildshard/engine/sim/leadPlayer';

const marshStrike = (exempt = false) => [{ id: 'marsh.bite', row: { id: 'strike.marsh.bite', shape: { kind: 'point', radius: 3 },
  windup: 0.1, active: 0.2, recover: 0.2, cooldown: 0, range: 3, damage: 7,
  tags: [exempt ? 'cover.exempt' : 'cover.checked'], weight: { kind: 'constant', value: 1 } }, trauma: 0.2, stun: 0.5,
  startCue: 'hiss', activeCue: 'snap', doneCue: 'settle' }];

test('an unrelated marsh contact uses real geometry, cover, one hit and declared effect edges', async () => {
  const rapier = await loadRapier(readFileSync('public/assets/physics/rapier.wasm'));
  const host = createSimHost(SIM_LEVEL, { rapier });
  try {
    const body = host.entities.get('boar:1'); if (body === undefined) throw new Error('Missing native fixture');
    const target = { x: body.position.x, y: body.position.y, z: body.position.z + 1 };
    const runner = new ScriptStrikes(marshStrike());
    expect(runner.start(1, 1, body, target)).toEqual(['hiss']);
    expect(runner.advance(1, 0.1, body, target, () => false)).toEqual({ hit: null, cues: ['snap'], done: false });
    expect(runner.advance(1, 0.05, body, target, () => false).hit).toBeNull();
    expect(runner.advance(1, 0.05, body, target, () => true).hit).toEqual({ damage: 7, tags: ['cover.checked'], stun: 0.5, trauma: 0.2, throughWalls: false });
    expect(runner.advance(1, 0.05, body, target, () => true).hit).toBeNull();
    runner.advance(1, 0.2, body, target, () => true);
    expect(runner.advance(1, 0.2, body, target, () => true).done).toBe(true);
    const exempt = new ScriptStrikes(marshStrike(true)); exempt.start(1, 1, body, target);
    exempt.advance(1, 0.1, body, target, () => false);
    expect(exempt.advance(1, 0.05, body, target, () => false).hit?.throughWalls).toBe(true);
  } finally { host.dispose(); }
});

test('scripted contact continuation validates actor/row identity atomically and consumes no hit twice', async () => {
  const rapier = await loadRapier(readFileSync('public/assets/physics/rapier.wasm'));
  const host = createSimHost(SIM_LEVEL, { rapier });
  try {
    const body = host.entities.get('boar:1'); if (body === undefined) throw new Error('Missing native fixture');
    const target = { x: body.position.x, y: body.position.y, z: body.position.z + 1 };
    const source = new ScriptStrikes(marshStrike()); source.start(1, 1, body, target);
    source.advance(1, 0.1, body, target, () => true); source.advance(1, 0.05, body, target, () => true);
    const saved = source.snapshot(), replay = new ScriptStrikes(marshStrike());
    const commit = replay.prepareRestore(saved, new Set([1])); expect(replay.snapshot()).toEqual([]); commit();
    expect(replay.snapshot()).toEqual(saved);
    for (const bad of [saved.map(row => ({ ...row, actor: 99 })), saved.map(row => ({ ...row, id: 99 })), [...saved, ...saved],
      saved.map(row => ({ ...row, runner: { ...row.runner, elapsed: -1 } }))]) {
      expect(() => replay.prepareRestore(bad, new Set([1]))).toThrow(); expect(replay.snapshot()).toEqual(saved);
    }
    for (let i = 0; i < 40; i++) {
      expect(replay.advance(1, 1 / 60, body, target, () => true)).toEqual(source.advance(1, 1 / 60, body, target, () => true));
      expect(replay.snapshot()).toEqual(source.snapshot());
    }
    expect(() => new ScriptStrikes([{ ...marshStrike()[0], after: () => undefined }])).toThrow();
  } finally { host.dispose(); }
});

test('a made-up reed guardian drives different species, slots and laws through the same elite host', async () => {
  const { compileDecisionScripts } = await import('../src/sharddev/buildDecisionScripts');
  const { parseSpawnScript, spawnScriptRegistries } = await import('@wildshard/format/spawnScripts');
  const { readSpeciesPrograms } = await import('@wildshard/format/speciesPrograms');
  const { installPopulationRoster } = await import('../src/server/game/population/roster');
  const { installNativeEliteFeature } = await import('../src/server/game/quest/eliteFeature');
  const { DayCycle } = await import('../src/shared/engine/world/dayCycle');
  // Pine's day: its keyed-sky row through the game's clock spec (as its headless assembly builds it)
  const [{ keyedSkyDaySpec }, { default: PINE_SKY }] = await Promise.all([import('../src/shared/game/looks/keyedSkyClock'), import('../src/shards/pine-hollow/data/sky.json', { with: { type: 'json' } })]);
  const PINE_DAY = keyedSkyDaySpec(PINE_SKY), PINE_PHASES = PINE_SKY.phases;
  const rapier = await loadRapier(readFileSync('public/assets/physics/rapier.wasm'));
  const host = createSimHost({ ...SIM_LEVEL, id: 'reed-marsh', entities: [] }, { rapier });
  const sample = SIM_LEVEL.entities[0]; if (sample === undefined) throw new Error('Missing recipe');
  const variants = ['crown', 'reed', 'white'], slots = ['guardian', 'west', 'east'];
  const population = readSpeciesPrograms({ page: [], native: [{ id: 'heron', kind: 'heron', label: 'Heron',
    variants: variants.map(id => ({ id, label: id, weight: 1, rarity: 'common', scale: [1, 1] })) }],
    hunt: { limit: 8, player: 'host', fight: {}, bands: { states: [], legacyKinds: [] }, hit: { namespace: 'marsh', tags: [] } } });
  flatPopulationEnvironment(host);
  installPopulationRoster(host, { population, nav: null, spawnY: 10, bake: { actors: [], herds: [], parked:
    variants.map((variant, i) => ({ ...sample, id: `recipe.${i}`, kind: 'heron', variant, spec: { ...sample.spec, kind: 'heron', variant } })) } },
  { version: 1, environment: 'fixture.habitat', step: 'marsh.flock', seed: 91, bodyCount: 0, limit: 8, scripted: 'sidestep', encounter: 'reed.guard',
    poseKinds: [], spawn: { x: 0, z: 0 }, fauna: [], identities: [], ordinary: {}, reserves: [], homes: [] });
  const program = parseSpawnScript({ step: 'reed.guard', roster: 'marsh.flock', seed: 17, maximum: 3, controlState: 'sidestep', bytes: '',
    slots: slots.map((id, i) => ({ id, handle: i + 1, release: i === 0 ? 'retain' : 'detach' })),
    species: slots.map((id, i) => ({ id, kind: 'heron', variant: variants[i] })),
    sites: slots.map((id, i) => ({ id, slot: id, point: [i * 2, 1], face: 'player' })),
    spawns: slots.map(id => ({ id, species: id, site: id })), fields: [{ id: 'weatherDark', source: 'observed' }, { id: 'landingX', source: 'x' }, { id: 'landingZ', source: 'z' }], flags: [], cues: ['hiss', 'snap', 'settle'], channels: ['count', 'dark'], moves: [{ id: 'landing', kind: 'relocate', point: { kind: 'fields', x: 'landingX', z: 'landingZ' }, facing: 'target' }], strikes: marshStrike(),
    script: { id: 'reed.guard', abi: '1.0', side: 'sim', source: 'behaviour/guardian.as', module: `blobs/wasm/${'0'.repeat(64)}.wasm`,
      binding: { spawnGroup: 'reed.family' }, pages: 1, onFail: 'hold', tick: 10, on: ['start', 'tick'],
      reads: ['alive', 'nearestPlayer', 'spawnGroupAlive', 'field'], commands: ['spawn', 'strike', 'channel', 'field', 'move'],
      actors: Object.fromEntries(slots.map(id => [id, id])), spawns: { west: 'west', east: 'east', family: 'reed.family' },
      moves: { landing: 'landing' }, strikes: { snap: 'strike.marsh.bite' }, fields: { light: 'weatherDark', landingX: 'landingX', landingZ: 'landingZ' }, flags: {}, cues: {}, channels: { count: 'count', dark: 'dark' },
      params: {}, stateVersion: 1, state: [{ name: 'mode', type: 'i32', scope: 'actor', default: 0 }, { name: 'step', type: 'i32', scope: 'actor', default: 0 }] } });
  const source = "import {State,Read,Do,Clock,Spawn,Strike,Channel,Field,Move} from './generated/reedGuard';\nexport function onStart():void{}\nexport function onTick(dt:f64):void{State.step+=1;if(Clock.self!==1){if(!Read.alive(Clock.self)&&State.step===1)Do.spawn(Clock.self===2?Spawn.west:Spawn.east);}else{Do.channel(Channel.count,Read.spawnGroupAlive(Spawn.family));Do.channel(Channel.dark,Read.field(Clock.self,Field.light));if(State.step===2){Do.field(Clock.self,Field.landingX,1);Do.field(Clock.self,Field.landingZ,2);Do.move(Clock.self,Move.landing,Read.nearestPlayer(Clock.self));Do.strike(Clock.self,Strike.snap,Read.nearestPlayer(Clock.self));}}}";
  const built = await compileDecisionScripts([program.script], spawnScriptRegistries(program), new Map([['behaviour/guardian.as', source]]), { asLineCeiling: 128 });
  const compiled = built.rows[0], blob = built.blobs[0]; if (compiled === undefined || blob === undefined) throw new Error('Missing guest');
  try {
    const day = new DayCycle(PINE_DAY); await day.set(PINE_PHASES.night);
    const feature = installNativeEliteFeature(host, day, { step: 'marsh.elites', version: 1, bounds: [-16, 16, -16, 16],
      streams: { spawn: 'marsh.hatch.', fight: 'marsh.guard.', pickup: 'marsh.shell.' }, ordinary: { heron: ['reed'] }, fights: [{
        def: { id: 'reed-guardian', name: 'Reed Guardian', epithet: 'Nest watcher', lair: { x: 0, z: 1, r: 4 }, awareR: 12, engageR: 8, leashR: 16,
          rule: 'always', respawnMin: 1, signature: 'BEAK', phase2: 'NEST', drop: { skin: null, skinName: '', weapon: 'sword', blurb: '' } },
        kind: 'heron', variant: 'crown', main: 'guardian', spawn: 'guardian', mode: 'mode', modes: ['watch'], forces: {}, defaultForce: 1, observations: [{ field: 'weatherDark', source: 'night' }],
        program: { ...program, script: compiled, bytes: btoa(String.fromCodePoint(...blob.bytes)) },
        legacy: { fields: [], rivals: [], lanes: [], phase: 'p2', actorPrefix: 'creature:', rivalMode: 0 } }] });
    feature.initialize();
    for (let i = 0; i < 20; i++) host.step(leadCommands(host, { moveX: 0, moveZ: 0, yaw: 0 }));
    const script = feature.scripts[0]; if (script === undefined) throw new Error('Missing guardian');
    expect(script.program.failure).toBeNull(); expect(script.program.channel(1)).toBe(3); expect(script.program.channel(2)).toBe(1);
    expect(slots.map(slot => script.program.body(slot)?.variant)).toEqual(variants);
    expect(script.animal?.position.x).toBe(1); expect(script.animal?.position.z).toBe(2);
    const saved = script.program.snapshot(), bodies = slots.map(slot => script.program.body(slot)?.entityId);
    script.program.prepareRestore(saved)(); expect(script.program.snapshot()).toBe(saved);
    expect(script.program.host.metrics().every(row => row.refusals === 0)).toBe(true);
    expect(slots.map(slot => script.program.body(slot)?.entityId)).toEqual(bodies);
    script.reset(); expect(script.program.body('west')).toBeNull(); expect(script.program.body('east')).toBeNull();
    expect(script.program.body('guardian')?.entityId).toBe(bodies[0]);
  } finally { host.dispose(); }
}, 60_000);

test('Nalati captain charges on the 10 Hz guest and leashing cancels its attack', async () => {
  const { charge } = await import('../src/shards/nalati-grasslands/generators/eliteCharge');
  const { compileDecisionScripts } = await import('../src/sharddev/buildDecisionScripts');
  const { parseSpawnScript, spawnScriptRegistries } = await import('@wildshard/format/spawnScripts');
  const { decisionBindingMap } = await import('@wildshard/format/decisionBindings');
  const { actorDecisionRows } = await import('@wildshard/format/decisionScripts');
  const { DecisionHost } = await import('../src/server/engine/script/decision');
  const rows = parseSpawnScript(charge), registry = spawnScriptRegistries(rows);
  const built = await compileDecisionScripts([rows.script], registry, new Map([[rows.script.source,
    readFileSync(`src/shards/nalati-grasslands/${rows.script.source}`, 'utf8')]]), { asLineCeiling: 2837 });
  const row = built.rows.at(0), blob = built.blobs.at(0);
  if (row === undefined || blob === undefined) throw new Error('Missing captain guest');
  const ids = decisionBindingMap(row, registry).ids;
  const resolved = actorDecisionRows(row).map(script => Object.assign(script, { ids,
    reads: ['x', 'z', 'yaw', 'alive', 'nearestPlayer', 'field', 'strikeState'] as const, lists: [] }));
  const commands: number[] = [], failures: string[] = [];
  let leashing = false;
  const host = new DecisionHost({ scripts: resolved, bindings: [{ id: 1, script: resolved.at(0)?.id ?? row.id, self: 1, actors: [1], instance: 0 }],
    modules: new Map([[row.module, blob.bytes]]), seed: [4501, 0], limits: { fuelPerCall: 2000000, fuelPerTick: 8000000 },
    world: { read: (op, actor, field) => {
      if (op === 1) return actor === 1 ? 0 : 10;
      if (op === 6) return 1;
      if (op === 9) return 2;
      if (op === 7) return field === ids.fields?.['engaged'] ? 1 : field === ids.fields?.['leashing'] ? Number(leashing) : 0;
      return 0;
    }, list: () => 0, failed: (_mode, _context, reason) => { failures.push(reason); },
    prepare: batch => ({ commit: () => { commands.push(...batch.map(command => command[0])); } }) },
  });
  for (let tick = 1; tick <= 240; tick++) host.step(tick);
  expect(failures).toEqual([]);
  expect(commands.filter(op => op === 2)).toHaveLength(1);
  expect(host.metrics()[0]?.calls).toBeLessThanOrEqual(40);
  leashing = true; commands.length = 0;
  for (let tick = 241; tick <= 300; tick++) host.step(tick);
  expect(failures).toEqual([]);
  expect(commands).toContain(3);
  expect(commands).not.toContain(2);
});
