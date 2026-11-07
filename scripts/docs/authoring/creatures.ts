import { compileBehaviourModule } from '@wildshard/sharddev/buildBehaviour';
import { emptyShardfile } from '@wildshard/sharddev/author';
import { parseShardfile } from '@wildshard/engine/host/shardfile';

/** Data-only goats flee through the guarded-herd owner; a hawk dives through the native flight/contact owner. */
export function creaturesExample() {
  const shard = emptyShardfile({ slug: 'mesa-fauna', name: 'Mesa fauna', author: 'Example', revision: 1, seed: 435 });
  const dims = { bodyY: 0.8, bodyHalfLen: 0.6, bodyRadius: 0.3, headRadius: 0.2,
    legLen: 0.6, feet: [[0.2, 0.3], [-0.2, -0.3]] as [number, number][], halfWidth: 0.3 };
  const mods = { speed: 1, chargeDist: 1, damageTaken: 1, chargeDamage: 5, relentless: false };
  const variants = [{ id: 'plain', label: 'Plain', rarity: 'common' as const, weight: 1,
    scale: [1, 1] as [number, number], hp: 60, mods }];
  shard.rows.species = [
    { id: 'goat', kind: 'goat', label: 'Goat', aggressive: false, lockable: true, dims, variants },
    { id: 'hawk', kind: 'hawk', label: 'Hawk', aggressive: true, lockable: true, dims, variants,
      flight: { altitude: 8, above: 'world', climbRate: 8, diveRate: 20 } },
  ];
  shard.rows.strikes = [{ id: 'hawk.dive', shape: { kind: 'sphere', radius: 2 },
    windup: 0.2, active: 0.6, recover: 0.3, cooldown: 2, range: 12, damage: 5,
    tags: ['animal.hawk'], weight: 1, speed: 0 }];
  shard.creatures.groups = [{ id: 'goats', kind: 'grazer', pattern: 'herd', thinkDivisor: 6,
    members: ['goat.0', 'goat.1', 'goat.2'], walkSpeed: 1, trotSpeed: 3, gallopSpeed: 7, chargeSpeed: 8,
    sightRadius: 25, grazingSightRadius: 18, coneAngle: Math.PI, hearing: [10, 16, 24, 30],
    alertThreshold: 0.5, flightMinDistance: 25, flightMaxDistance: 40,
    stallionVariant: 'guard', foalPrefix: 'kid', snortCue: 'goat.snort', neighCue: 'goat.call', squealCue: 'goat.alarm' }];
  shard.creatures.brains = [{ id: 'hawk', kind: 'diver', pattern: 'orbit', thinkDivisor: 6, strike: 'hawk.dive',
    home: { x: 0, z: 0, r: 10, y: 8 }, circleSpeed: 5, hangAltitude: 4, stalkSpeed: 8, diveSpeed: 12,
    restSeconds: 3, noticeRadius: 35, giveUpRadius: 50, initialRestSeconds: 0, stalkMaxSeconds: 20,
    riseMargin: 2, targetHeight: 1.2, alignRadius: 3, alignTolerance: 1 }];
  shard.creatures.spawns = [0, 1, 2].map(i => ({ id: `goat.${i}`, species: 'goat', variant: 'plain',
    brain: 'goats', strike: null, seed: i, scale: 1, at: [i * 2 + 4, 0, 0] as [number, number, number], yaw: 0 }));
  shard.creatures.spawns.push({ id: 'hawk.0', species: 'hawk', variant: 'plain', brain: 'hawk',
    strike: null, seed: 9, scale: 1, at: [0, 8, 4], yaw: 0 });
  return parseShardfile(shard);
}

/** Give the data-only roster real existing platform primitive views; declaration-only creatures fail view proofs. */
export function visibleCreaturesExample() {
  const shard = creaturesExample();
  shard.rows.looks = shard.rows.species.map(row => ({ id: `look.${row.id}`, species: row.id, recipe: 'engine.sphere',
    parameters: { radius: 0.5, colour: [0.5, 0.5, 0.5] }, material: null,
    animation: { recipe: 'engine.scale-wave', parameters: { axis: 'y', frequency: 4, amplitude: 0.08, rest: 1, dead: 0.4 } } }));
  return parseShardfile(shard);
}

/** Compile an event-controlled beacon beside the live primitive views, using only public author modules. */
export async function sceneInteractionExample(source: string) {
  const shard = visibleCreaturesExample();
  shard.state.shared = [{ id: 101, name: 'door.open', type: 'bool', privacy: 'public', default: false }];
  shard.sim.scriptTickDivisor = 1;
  const { bytes, module } = await compileBehaviourModule(source, 2);
  const resident = bytes.length + 2 * 65536 * 3;
  shard.files = [{ hash: module, kind: 'wasm', compressed: bytes.length, decoded: bytes.length, gpu: 0, triangles: 0, draws: 0, dependencies: [], critical: true }];
  shard.critical = [module];
  shard.budgets.sim = { resident, compressed: bytes.length };
  shard.serverBudget.memory += resident;
  shard.sim.scripts = [module];
  shard.sim.bindings = [{ module, entity: 1106943697, actorId: 'actor.player', kind: 'server' }];
  shard.hooks.scenes = [{ id: 'beacon.light', type: 201, value: 1 }];
  shard.targets.interactions = [{ id: 'beacon', at: [0, 1.68, 1], radius: 3, label: 'LIGHT BEACON', scene: 'beacon.light' }];
  return { shard: parseShardfile(shard), assets: new Map([[module, bytes]]) };
}
