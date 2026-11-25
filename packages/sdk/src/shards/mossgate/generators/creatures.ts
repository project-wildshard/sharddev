// TEMPLATE-E2E TR-12b (J434): the Hollow's creatures, ported from the legacy Template (`_template`'s `data/creatures.json`,
// `data/rows/species.json` and `strikes.json`, built under TC-M) onto this scene. Each species is a `world.creature`: a
// Group of named bones with a mesh on each, which the sdk turns into the one skinned mesh, its skin file and its species
// and look rows (ONE-FORMAT CC24). `world.spawnAt` places each body at a node. The brains, the mossling pack, the two
// encounters and the Warden's decision script are rows `extend` adds (gameplay.ts) and `behaviour/warden.as`.
//
// - four hostile species: grey blobs (they pursue), sows and Greyback (boars: the sows ram, Greyback charges as an
//   elite), bog wisps (they circle the pond and dive) and the mossling pack (they shadow, ring and bite)
// - the Barrow Warden, the boss of the barrow ring: a golem of mossy stone blocks (the static scene's idle golem, now live)
// - MZ15: Gritmaw, the Old Quarry's elite: a smaller golem of quarried sandstone with its own decision script
// - MZ20: the barrow crawlers, the Warden's adds: four moss-capped stone blobs that wake in its third phase
// - MZ21: camps to the bar: a ridge camp of five grey blobs and a cairn camp of five crawlers; every camp body respawns
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { ShardRows } from '@wildshard/format/rows';
import type { Shardfile } from '@wildshard/format/shardSchema';
import type { ShardWorld } from '@wildshard/sdk/scene/author';
import { groundHeight, LAYOUT } from './hollow';
import { MEADOW_PACKS } from './meadow';
import { THICKET_CAMP } from './thicket';
import { BOG_WISPS } from './bog';
import { QUARRY, QUARRY_BLOBS } from './quarry';
import { RIDGE_CAMP } from './ridge';
import { CAIRN_CAMP } from './downs';

type Strike = ShardRows['strikes'][number];
type Variant = ShardRows['species'][number]['variants'][number];

/** What a boar's kill drops, declared (QA 11-25 row 26: the kit no longer copies its old harvest law in with a warning):
 *  meat and hide from every boar, a tusk from Greyback only. gameplay.ts puts both on the shard (the catalogue must name
 *  the items before a species' harvest does). */
export const BOAR_HARVEST = [{ item: 'boar-meat', count: 1 }, { item: 'boar-hide', count: 1 }, { item: 'boar-tusk', count: 1, variants: ['greyback'] }];
// Typed: inferred, the icons widen to string, and a new repo's tsc on the packed graph refuses them (packed-install, 661da3e7).
export const BOAR_ITEMS: NonNullable<Shardfile['items']['catalogue']> = [
  { id: 'boar-meat', label: 'Boar meat', icon: 'meat', travels: false },
  { id: 'boar-hide', label: 'Boar hide', icon: 'hide', travels: false },
  { id: 'boar-tusk', label: 'Boar tusk', icon: 'tusk', travels: false },
];
/** How long a beaten Greyback or Warden stays down before its fight re-arms, in seconds. */
export const BOSS_RESPAWN = 120;
/** Where the creatures stand (the Template's `data/layout.json`, moved off the starter's and ring 2's walks). */
export const HAUNTS = {
  /** the grey blobs, past the north gate (outside their 12 m notice of the spawn and of the starter's walk) */
  BLOBS: [[-4, -27], [-9, -24], [-2, -33], [-7, -31]] as const,
  /** MZ12: the mossling pack's den in Mossling Meadow (meadow.ts), and the second pack at the Standing Stones */
  MEADOW: MEADOW_PACKS.den.home,
  MOSSLINGS: MEADOW_PACKS.den.seats,
  STONES: MEADOW_PACKS.stones.home,
  STONES_PACK: MEADOW_PACKS.stones.seats,
  /** the sows graze west of the pond; the bog wisps circle over it */
  SOWS: [[-22, 15], [-25, 7]] as const,
  WISPS: [[-17, -2], [-22, 2]] as const,
  /** MZ13: Greyback's camp in the thicket's clearing (thicket.ts), its sows and the wallow's; the Barrow Warden in the barrow
   *  ring (world.ts `arena`) */
  GREYBACK: THICKET_CAMP.greyback,
  CAMP_SOWS: THICKET_CAMP.sows,
  WALLOW_SOWS: THICKET_CAMP.wallowSows,
  /** MZ14: three more wisps over Wisp Mere in the Bog (bog.ts) */
  MERE_WISPS: BOG_WISPS.seats,
  WARDEN: { x: LAYOUT.ARENA.x - 1, z: LAYOUT.ARENA.z, r: 8 },
  /** MZ15: the Old Quarry (quarry.ts): Gritmaw on the pit's floor, four grey blobs round the camp */
  GRITMAW: QUARRY.GRITMAW,
  QUARRY_BLOBS,
  /** MZ20: where the Warden's four adds rise in its third phase, inside the ring round it (the ring is 8 m across the floor) */
  /** MZ21: the scavengers' camp on Lookout Ridge's lower slope (ridge.ts), and the crawlers' camp round the Old Cairn (downs.ts) */
  RIDGE_BLOBS: RIDGE_CAMP.seats,
  CAIRN_CRAWLERS: CAIRN_CAMP.seats,
  CRAWLERS: [0.25, 0.75, 1.25, 1.75].map((t) => [LAYOUT.ARENA.x - 1 + Math.cos(t * Math.PI) * 5, LAYOUT.ARENA.z + Math.sin(t * Math.PI) * 5] as const),
} as const;

/** The spawn ids the encounters, the pack and the quests name. */
export const BODIES = {
  greyback: 'greyback',
  warden: 'barrow-warden',
  gritmaw: 'gritmaw',
  mosslings: HAUNTS.MOSSLINGS.map((_, i) => `mossling-${i + 1}`),
  stonesPack: HAUNTS.STONES_PACK.map((_, i) => `mossling-stones-${i + 1}`),
  /** MZ20: the Warden's third-phase adds (fights.ts lists them on the phase) */
  crawlers: HAUNTS.CRAWLERS.map((_, i) => `barrow-crawler-${i + 1}`),
} as const;
/** The two mossling packs' group ids (fights.ts): each body's brain is its pack. */
export const PACKS = { den: 'mossgate.mosslings', stones: 'mossgate.mosslings-stones' } as const;

const strike = (id: string, tag: string, row: Omit<Strike, 'id' | 'tags'>): Strike => ({ id, tags: [`creature.${tag}`], ...row } as Strike);
/** The Template's strike rows, renamed into the Hollow. */
export const STRIKES = {
  blobBump: strike('mossgate.blob.bump', 'greyBlob', { shape: { kind: 'point', radius: 1.8 }, windup: 0.7, active: 0.15, recover: 0.8, cooldown: 1, range: 2, damage: 8, weight: 2, speed: 0 } as Omit<Strike, 'id' | 'tags'>),
  blobLane: strike('mossgate.blob.lane', 'greyBlob', { shape: { kind: 'lane', length: 5, width: 1.4 }, windup: 1, active: 0.6, recover: 1, cooldown: 3, range: 6, damage: 12, weight: 1, speed: 5 } as Omit<Strike, 'id' | 'tags'>),
  sowRam: strike('mossgate.sow.ram', 'boar', { shape: { kind: 'lane', length: 5, width: 1.2 }, windup: 0.7, active: 0.5, recover: 0.9, cooldown: 3, range: 6, damage: 12, weight: 1, speed: 7 } as Omit<Strike, 'id' | 'tags'>),
  boarCharge: strike('mossgate.boar.charge', 'boar', { shape: { kind: 'lane', length: 8, width: 0.9 }, windup: 0.55, active: 0.6, recover: 0.8, cooldown: 2, range: 10, damage: 25, weight: 1, speed: 7.5 } as Omit<Strike, 'id' | 'tags'>),
  wispDive: strike('mossgate.wisp.dive', 'bogWisp', { shape: { kind: 'sphere', radius: 1.6 }, windup: 1, active: 1, recover: 0.6, cooldown: 5, range: 12, damage: 8, weight: 1, speed: 0 } as Omit<Strike, 'id' | 'tags'>),
  // MZ14: the mere's wisps are their own species (a species runs one brain), so their dive is their own row
  mereWispDive: strike('mossgate.mere-wisp.dive', 'mereWisp', { shape: { kind: 'sphere', radius: 1.6 }, windup: 1, active: 1, recover: 0.6, cooldown: 5, range: 12, damage: 8, weight: 1, speed: 0 } as Omit<Strike, 'id' | 'tags'>),
  // MZ20: the Warden's blows reach past its 1.3 m body (a player at its side stands 2 m off or more; 1.6 and 2.2 m never
  // landed). The slam fills the ember ring (3.4 m: step out of it in the windup), the sweep the wider dust ring (4.6 m, all
  // round its feet), and the stone flies down a lane at the nearest player (its windup turns the Warden: step aside)
  wardenSlam: strike('mossgate.warden.slam', 'barrowWarden', { shape: { kind: 'point', radius: 3.4 }, windup: 1.2, active: 0.2, recover: 0.6, cooldown: 0.5, range: 4, damage: 20, weight: 3, speed: 0 } as Omit<Strike, 'id' | 'tags'>),
  wardenSweep: strike('mossgate.warden.sweep', 'barrowWarden', { shape: { kind: 'arc', radius: 4.6, halfAngle: 3.1 }, windup: 0.9, active: 0.3, recover: 1, cooldown: 2.5, range: 7, damage: 14, weight: 1, speed: 0 } as Omit<Strike, 'id' | 'tags'>),
  wardenThrow: strike('mossgate.warden.throw', 'barrowWarden', { shape: { kind: 'lane', length: 18, width: 1.6 }, windup: 1.3, active: 0.3, recover: 0.8, cooldown: 3, range: 18, damage: 16, weight: 1, speed: 0 } as Omit<Strike, 'id' | 'tags'>),
  // MZ20: a barrow crawler's bump, as a grey blob's
  crawlerBump: strike('mossgate.crawler.bump', 'barrowCrawler', { shape: { kind: 'point', radius: 1.8 }, windup: 0.7, active: 0.15, recover: 0.8, cooldown: 1, range: 2, damage: 8, weight: 1, speed: 0 } as Omit<Strike, 'id' | 'tags'>),
  // MZ15: Gritmaw's two strikes, its decision script's slam and the quake round its feet
  gritmawSlam: strike('mossgate.gritmaw.slam', 'quarryGritmaw', { shape: { kind: 'point', radius: 1.8 }, windup: 1.1, active: 0.2, recover: 0.6, cooldown: 0.5, range: 4, damage: 14, weight: 3, speed: 0 } as Omit<Strike, 'id' | 'tags'>),
  gritmawQuake: strike('mossgate.gritmaw.quake', 'quarryGritmaw', { shape: { kind: 'arc', radius: 3.2, halfAngle: 3.1 }, windup: 1.1, active: 0.3, recover: 1, cooldown: 2, range: 5, damage: 10, weight: 1, speed: 0 } as Omit<Strike, 'id' | 'tags'>),
} as const;

type Temperament = NonNullable<ShardRows['species'][number]['temperament']>;
/** Each species' temperament, declared (the kit's presets name no brain of the Hollow's): `brain` is the one brain every
 *  spawn of it runs, or `none` where a group or an encounter drives it. */
const temper = (brain: string, leash: number): Temperament => ({ brain, reaction: 'aggressive', leash, assist: 0, home: { speed: 2, stop: 1.5 } });
const mods = (chargeDamage: number, speed = 1): Variant['mods'] => ({ speed, chargeDist: 1, damageTaken: 1, chargeDamage, relentless: false });
const variant = (id: string, label: string, hp: number, extra: Partial<Variant> = {}): Variant =>
  ({ id, label, rarity: 'common', weight: 1, scale: [1, 1], hp, mods: mods(25), ...extra } as Variant);

// ---- bodies: a Group of named bone nodes (each unrotated at rest), a mesh on each ----

const paint = (color: string, emissive?: string): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...(emissive === undefined ? {} : { emissive, emissiveIntensity: 1.4 }) });
const bone = (name: string, parent: THREE.Object3D, x: number, y: number, z: number): THREE.Group => {
  const b = new THREE.Group(); b.name = name; b.position.set(x, y, z); parent.add(b); return b;
};
const mesh = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh => {
  const m = new THREE.Mesh(geometry, material); m.position.set(x, y, z); parent.add(m); return m;
};

type Xyz = readonly [number, number, number];
/** One bone's position track: `rest` offset by each key's [dx, dy, dz], over `seconds`. */
function slide(boneName: string, rest: Xyz, keys: readonly Xyz[], seconds: number): THREE.VectorKeyframeTrack {
  const times = keys.map((_, i) => (seconds * i) / (keys.length - 1));
  return new THREE.VectorKeyframeTrack(`${boneName}.position`, times, keys.flatMap(([dx, dy, dz]) => [rest[0] + dx, rest[1] + dy, rest[2] + dz]));
}
/** A clip of that one track. */
const shift = (name: string, boneName: string, rest: Xyz, keys: readonly Xyz[], seconds: number): THREE.AnimationClip =>
  new THREE.AnimationClip(name, seconds, [slide(boneName, rest, keys, seconds)]);
/** A clip that turns one bone about x by each key's angle (radians), over `seconds`. */
function swing(boneName: string, angles: readonly number[], seconds: number): THREE.QuaternionKeyframeTrack {
  const times = angles.map((_, i) => (seconds * i) / (angles.length - 1));
  return new THREE.QuaternionKeyframeTrack(`${boneName}.quaternion`, times, angles.flatMap((a) => [Math.sin(a / 2), 0, 0, Math.cos(a / 2)]));
}

/** A blob (the grey blob, a mossling): a squat ball on a `body` bone, its eyes on a `head`; it bobs, lunges and sinks. */
function blobBody(colour: string, radius: number, cap?: string): { body: THREE.Group; clips: THREE.AnimationClip[] } {
  const root = new THREE.Group(), rest: Xyz = [0, radius * 0.8, 0], body = bone('body', root, ...rest);
  const ball = mesh(body, new THREE.SphereGeometry(radius, 14, 10), paint(colour)); ball.scale.set(1, 0.8, 1);
  const eye = paint('#1d1d1f');
  // every rig has a `head` (format skinData): the blob's carries its eyes
  const head = bone('head', body, 0, radius * 0.25, radius * 0.86);
  for (const s of [-1, 1]) mesh(head, new THREE.SphereGeometry(radius * 0.12, 8, 6), eye, s * radius * 0.35, 0, 0);
  if (cap !== undefined) { const top = mesh(body, new THREE.SphereGeometry(radius * 0.75, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), paint(cap), 0, radius * 0.35, 0); top.scale.set(1, 0.5, 1); }
  const r = radius;
  return { body: root, clips: [
    shift('idle', 'body', rest, [[0, 0, 0], [0, r * 0.06, 0], [0, 0, 0]], 1.6),
    shift('walk', 'body', rest, [[0, 0, 0], [0, r * 0.25, r * 0.05], [0, 0, 0]], 0.6),
    shift('attack', 'body', rest, [[0, 0, 0], [0, r * 0.1, -r * 0.3], [0, r * 0.2, r * 0.9], [0, 0, 0]], 1),
    shift('hit', 'body', rest, [[0, 0, 0], [0, 0, -r * 0.3], [0, 0, 0]], 0.4),
    shift('die', 'body', rest, [[0, 0, 0], [0, -r * 0.6, 0]], 0.8),
  ] };
}

/** A bog wisp: a glowing orb with a trailing tail on a `body` bone, its bright core the `head`; it pulses, dives and gutters out. */
function wispBody(): { body: THREE.Group; clips: THREE.AnimationClip[] } {
  const root = new THREE.Group(), rest: Xyz = [0, 0.6, 0], body = bone('body', root, ...rest);
  const glow = paint('#bfe88a', '#8fd04a'), core = paint('#f4ffd0', '#e8ff9a');
  mesh(body, new THREE.SphereGeometry(0.42, 14, 10), glow);
  mesh(bone('head', body, 0, 0, 0.18), new THREE.SphereGeometry(0.2, 10, 8), core);
  const tail = mesh(body, new THREE.ConeGeometry(0.28, 0.9, 10), glow, 0, 0, -0.55); tail.rotation.x = -Math.PI / 2;
  return { body: root, clips: [
    shift('idle', 'body', rest, [[0, 0, 0], [0, 0.15, 0], [0, 0, 0]], 1.2),
    shift('walk', 'body', rest, [[0, 0, 0], [0, 0.1, 0.1], [0, 0, 0]], 0.8),
    shift('attack', 'body', rest, [[0, 0, 0], [0, 0.3, -0.2], [0, -0.3, 0.8], [0, 0, 0]], 1),
    shift('hit', 'body', rest, [[0, 0, 0], [0, 0.2, -0.3], [0, 0, 0]], 0.4),
    shift('die', 'body', rest, [[0, 0, 0], [0, -0.55, 0]], 0.8),
  ] };
}

/** A boar (the sows and Greyback): a bristled barrel on a `body` bone, its `head` and four legs; it trots and charges. */
function boarBody(): { body: THREE.Group; clips: THREE.AnimationClip[] } {
  const root = new THREE.Group(), rest: Xyz = [0, 0.62, 0], body = bone('body', root, ...rest);
  const hide = paint('#6f6458'), dark = paint('#3e352d'), tusk = paint('#e8dcc0');
  mesh(body, new RoundedBoxGeometry(0.62, 0.58, 1.25, 2, 0.16), hide);
  const ridge = mesh(body, new RoundedBoxGeometry(0.22, 0.14, 1.0, 2, 0.05), dark, 0, 0.32, -0.05); ridge.castShadow = true;
  const head = bone('head', body, 0, 0.04, 0.68);
  mesh(head, new RoundedBoxGeometry(0.44, 0.42, 0.46, 2, 0.1), hide, 0, 0, 0.12);
  mesh(head, new RoundedBoxGeometry(0.26, 0.22, 0.2, 2, 0.05), dark, 0, -0.06, 0.42);
  for (const s of [-1, 1]) { const t = mesh(head, new THREE.ConeGeometry(0.035, 0.18, 6), tusk, s * 0.15, -0.05, 0.42); t.rotation.x = -0.6; }
  const legs: [string, number, number][] = [['legFL', -0.2, 0.45], ['legFR', 0.2, 0.45], ['legBL', -0.2, -0.44], ['legBR', 0.2, -0.44]];
  for (const [name, x, z] of legs) { const leg = bone(name, body, x, -0.22, z); mesh(leg, new RoundedBoxGeometry(0.15, 0.42, 0.17, 2, 0.04), dark, 0, -0.18, 0); }
  const trot = (front: number): THREE.QuaternionKeyframeTrack[] => [swing('legFL', [front, -front, front], 0.5), swing('legBR', [front, -front, front], 0.5), swing('legFR', [-front, front, -front], 0.5), swing('legBL', [-front, front, -front], 0.5)];
  return { body: root, clips: [
    new THREE.AnimationClip('idle', 2, [swing('head', [0, 0.25, 0.25, 0], 2)]),
    new THREE.AnimationClip('walk', 0.5, trot(0.45)),
    new THREE.AnimationClip('attack', 1, [swing('head', [0, -0.3, 0.35, 0], 1), ...trot(0.7).map((t) => new THREE.QuaternionKeyframeTrack(t.name, [0, 0.33, 0.66, 1], [...t.values, ...t.values.slice(0, 4)]))]),
    shift('hit', 'body', rest, [[0, 0, 0], [0, 0.05, -0.2], [0, 0, 0]], 0.4),
    shift('die', 'body', rest, [[0, 0, 0], [0, -0.35, 0]], 0.8),
  ] };
}

/** The Barrow Warden (world.ts `arena`'s idle golem, live): legs, hips, a torso with its glowing core, a head with eyes
 *  under a moss cap and two heavy block arms, at the scene golem's own size. Six bones, all under `body` (the hips). */
interface GolemLook { S: number; stone: string; moss: string; eye: string; core: string }
const WARDEN_LOOK: GolemLook = { S: 1.3, stone: '#a39f92', moss: '#6f8f30', eye: '#ffb040', core: '#ff9a30' };
function wardenBody(look: GolemLook = WARDEN_LOOK): { body: THREE.Group; clips: THREE.AnimationClip[] } {
  const S = look.S, root = new THREE.Group();
  const stone = paint(look.stone), moss = paint(look.moss), eye = paint(look.eye, '#ff9a20'), core = paint(look.core, '#ff7a10');
  const block = (parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material = stone): THREE.Mesh =>
    mesh(parent, new RoundedBoxGeometry(w * S, h * S, d * S, 2, 0.1 * S), m, x * S, y * S, z * S);
  const rest: Xyz = [0, 1.1 * S, 0], body = bone('body', root, ...rest);
  for (const [name, s] of [['legL', 1], ['legR', -1]] as const) {
    const leg = bone(name, body, s * 0.55 * S, 0, 0);
    block(leg, 0.75, 1.1, 0.8, 0, -0.55, 0); block(leg, 0.9, 0.35, 1.0, 0, -0.93, 0.08);
  }
  block(body, 1.5, 0.6, 1.0, 0, 0.3, 0); // hips
  block(body, 2.3, 1.5, 1.35, 0, 1.35, 0); // torso
  mesh(body, new THREE.OctahedronGeometry(0.22 * S, 0), core, 0, 1.35 * S, 0.7 * S);
  block(body, 2.5, 0.25, 1.45, 0, 2.15, 0, moss); // the moss on its shoulders
  const head = bone('head', body, 0, 2.1 * S, 0.15 * S);
  block(head, 0.95, 0.8, 0.9, 0, 0.4, 0);
  for (const s of [-1, 1]) mesh(head, new THREE.BoxGeometry(0.16 * S, 0.08 * S, 0.03 * S), eye, s * 0.2 * S, 0.45 * S, 0.46 * S);
  block(head, 1.0, 0.18, 0.95, 0, 0.86, 0, moss);
  for (const [name, s] of [['armL', 1], ['armR', -1]] as const) {
    const arm = bone(name, body, s * 1.45 * S, 1.85 * S, 0);
    block(arm, 0.95, 0.25, 0.95, 0, 0.45, 0, moss); block(arm, 0.85, 0.8, 0.85, 0, 0, 0); block(arm, 0.65, 1.0, 0.65, 0, -0.85, 0); block(arm, 0.9, 0.85, 0.9, 0, -1.75, 0.05);
  }
  const arms = (angles: readonly number[], seconds: number): THREE.QuaternionKeyframeTrack[] => [swing('armL', angles, seconds), swing('armR', angles, seconds)];
  return { body: root, clips: [
    new THREE.AnimationClip('idle', 3, [slide('body', rest, [[0, 0, 0], [0, 0.05, 0], [0, 0, 0]], 3), swing('head', [0, 0.08, 0], 3)]),
    new THREE.AnimationClip('walk', 1.2, [swing('legL', [0.35, -0.35, 0.35], 1.2), swing('legR', [-0.35, 0.35, -0.35], 1.2), ...arms([-0.15, 0.15, -0.15], 1.2)]),
    // the tell and the slam: both arms rise over its head, then fall
    new THREE.AnimationClip('attack', 1.4, [...arms([0, -2.6, -2.8, 0.2, 0], 1.4), swing('head', [0, -0.2, -0.2, 0.25, 0], 1.4)]),
    new THREE.AnimationClip('hit', 0.5, [slide('body', rest, [[0, 0, 0], [0, 0, -0.25], [0, 0, 0]], 0.5)]),
    new THREE.AnimationClip('die', 1.5, [slide('body', rest, [[0, 0, 0], [0, -0.9, 0]], 1.5), ...arms([0, 0.6], 1.5), swing('head', [0, 0.5], 1.5)]),
  ] };
}

const LOOPS = ['idle', 'walk'];
const PBR = { family: 'pbr', vertexColours: false } as const;

/** Place a body at (x, z) on the ground (`lift` metres over it), its +z turned by `yaw`. */
function spot(world: ShardWorld, x: number, z: number, yaw = 0, lift = 0): THREE.Object3D {
  const o = new THREE.Object3D(); o.position.set(x, groundHeight(x, z) + lift, z); o.rotation.y = yaw; world.scene.add(o); return o;
}

/** The Hollow's creatures: eight species, forty-six bodies in ten camps, the elites and the boss (MZ21). */
export function buildCreatures(world: ShardWorld): void {
  const blob = blobBody('#9a9a92', 0.6), mossling = blobBody('#7f9a4a', 0.32, '#4f6e22'), wisp = wispBody(), boar = boarBody(), warden = wardenBody();
  world.creature('grey.blob', blob.body, {
    species: { kind: 'greyBlob', label: 'Grey blob', aggressive: true, lockable: true, capExempt: false,
      dims: { bodyY: 0.5, bodyHalfLen: 0.4, bodyRadius: 0.55, headRadius: 0.3, legLen: 0.5, feet: [], halfWidth: 0.6 },
      variants: [variant('grey', 'Grey blob', 60)], temperament: temper('mossgate.blob-pursuit', 25), senses: { notice: 12 } },
    strikes: [STRIKES.blobBump, STRIKES.blobLane], size: 'medium', clips: blob.clips, loops: LOOPS, material: PBR,
  });
  world.creature('mossling', mossling.body, {
    species: { kind: 'greyBlob', label: 'Mossling', aggressive: true, lockable: true, capExempt: false,
      dims: { bodyY: 0.26, bodyHalfLen: 0.22, bodyRadius: 0.3, headRadius: 0.16, legLen: 0.26, feet: [], halfWidth: 0.32 },
      variants: [variant('moss', 'Mossling', 24, { mods: mods(6, 1.3) })], temperament: temper('none', 30), senses: { notice: 20 } },
    size: 'medium', clips: mossling.clips, loops: LOOPS, material: PBR,
  });
  world.creature('bog.wisp', wisp.body, {
    species: { kind: 'greyBlob', label: 'Bog wisp', aggressive: true, lockable: true, capExempt: false,
      dims: { bodyY: 0.6, bodyHalfLen: 0.3, bodyRadius: 0.42, headRadius: 0.2, legLen: 0.6, feet: [], halfWidth: 0.42 },
      variants: [variant('bog', 'Bog wisp', 30)], temperament: temper('mossgate.wisp-dive', 30), senses: { notice: 18 },
      flight: { above: 'ground', altitude: 5, climbRate: 5, diveRate: 14, lockRange: 25 } } as never,
    strikes: [STRIKES.wispDive], size: 'medium', clips: wisp.clips, loops: LOOPS, material: PBR,
  });
  // MZ14: Wisp Mere's wisps, the same body as the pond's, circling the mere (a species' temperament names its one brain)
  const mereWisp = wispBody();
  world.creature('mere.wisp', mereWisp.body, {
    species: { kind: 'greyBlob', label: 'Mere wisp', aggressive: true, lockable: true, capExempt: false,
      dims: { bodyY: 0.6, bodyHalfLen: 0.3, bodyRadius: 0.42, headRadius: 0.2, legLen: 0.6, feet: [], halfWidth: 0.42 },
      variants: [variant('mere', 'Mere wisp', 30)], temperament: temper('mossgate.mere-wisp-dive', 30), senses: { notice: 18 },
      flight: { above: 'ground', altitude: 5, climbRate: 5, diveRate: 14, lockRange: 25 } } as never,
    strikes: [STRIKES.mereWispDive], size: 'medium', clips: mereWisp.clips, loops: LOOPS, material: PBR,
  });
  world.creature('boar', boar.body, {
    species: { kind: 'boar', label: 'Boar', aggressive: true, lockable: true, capExempt: false, type: 'beast',
      dims: { bodyY: 0.62, bodyHalfLen: 0.65, bodyRadius: 0.33, headRadius: 0.2, legLen: 0.58, feet: [[-0.2, 0.45], [0.2, 0.45], [-0.2, -0.44], [0.2, -0.44]], halfWidth: 0.31 },
      variants: [variant('sow', 'Sow', 70, { scale: [0.85, 0.95] }), variant('greyback', 'Greyback', 160, { rarity: 'rare', weight: 0, scale: [1, 1] })],
      temperament: temper('none', 25), senses: { notice: 8 } } as never,
    strikes: [STRIKES.sowRam, STRIKES.boarCharge], size: 'medium', clips: boar.clips, loops: LOOPS, material: PBR,
  });
  world.creature('barrow.warden', warden.body, {
    species: { kind: 'barrowWarden', label: 'Barrow Warden', aggressive: true, lockable: true, capExempt: false,
      dims: { bodyY: 1.4, bodyHalfLen: 0.6, bodyRadius: 1.3, headRadius: 0.6, legLen: 1.4, feet: [], halfWidth: 1.6 },
      // MZ20: 1800 (was 420: two players felled it in one core window, 16 sword hits): about 66 hits, six or seven
      // windows alone, three or four for two
      variants: [variant('warden', 'Barrow Warden', 1800, { rarity: 'rare', weight: 0 })],
      temperament: { brain: 'none', reaction: 'aggressive', leash: 0, assist: 0, home: { speed: 0, stop: 0 } }, senses: { notice: 8 } } as never,
    strikes: [STRIKES.wardenSlam, STRIKES.wardenSweep, STRIKES.wardenThrow], size: 'medium', clips: warden.clips, loops: LOOPS, material: PBR, attackSpan: 1.4,
  });
  // MZ15: Gritmaw, the Warden's body cut smaller from the quarry's sandstone, its spoil-brown shoulders where the Warden's moss is
  const gritmaw = wardenBody({ S: 0.95, stone: '#b39d7c', moss: '#7a5c3e', eye: '#ffd27a', core: '#ffb347' });
  world.creature('quarry.gritmaw', gritmaw.body, {
    // its own kind (its strikes' tag): it shared the Warden's, so a walk proof's fight by kind chased both
    species: { kind: 'quarryGritmaw', label: 'Gritmaw', aggressive: true, lockable: true, capExempt: false,
      dims: { bodyY: 1.05, bodyHalfLen: 0.45, bodyRadius: 0.95, headRadius: 0.45, legLen: 1.05, feet: [], halfWidth: 1.2 },
      variants: [variant('gritmaw', 'Gritmaw', 260, { rarity: 'rare', weight: 0 })],
      temperament: { brain: 'none', reaction: 'aggressive', leash: 0, assist: 0, home: { speed: 0, stop: 0 } }, senses: { notice: 8 } } as never,
    strikes: [STRIKES.gritmawSlam, STRIKES.gritmawQuake], size: 'medium', clips: gritmaw.clips, loops: LOOPS, material: PBR, attackSpan: 1.4,
  });
  // MZ20: the Warden's adds, grey blobs of the ring's own stone with moss on their backs; they pursue as the yard's blobs do
  const crawler = blobBody('#7c7f74', 0.5, '#5d7a34');
  world.creature('barrow.crawler', crawler.body, {
    species: { kind: 'barrowCrawler', label: 'Barrow crawler', aggressive: true, lockable: true, capExempt: false,
      dims: { bodyY: 0.42, bodyHalfLen: 0.34, bodyRadius: 0.46, headRadius: 0.25, legLen: 0.42, feet: [], halfWidth: 0.5 },
      variants: [variant('crawler', 'Barrow crawler', 45)], temperament: temper('mossgate.blob-pursuit', 25), senses: { notice: 14 } },
    strikes: [STRIKES.crawlerBump], size: 'medium', clips: crawler.clips, loops: LOOPS, material: PBR,
  });

  // MOSSGATE-ZONE MZ1: the world is shared, so a fight someone won must come back for the next player, or the chain that
  // ends at the Warden stops at its last step for everyone after the first win (staging rev 5, 11-19). A body that comes
  // back re-arms its encounter (engine ai/phases.ts).
  HAUNTS.BLOBS.forEach(([x, z], i) => world.spawnAt(`grey-blob-${i + 1}`, spot(world, x, z), { species: 'grey.blob', variant: 'grey', brain: 'mossgate.blob-pursuit', strike: i === 3 ? STRIKES.blobLane.id : STRIKES.blobBump.id, seed: 435 + i, scale: 1, respawn: 60 }));
  HAUNTS.MOSSLINGS.forEach(([x, z], i) => world.spawnAt(`mossling-${i + 1}`, spot(world, x, z), { species: 'mossling', variant: 'moss', brain: PACKS.den, strike: null, seed: 501 + i, scale: 1, respawn: 45 }));
  HAUNTS.STONES_PACK.forEach(([x, z], i) => world.spawnAt(BODIES.stonesPack[i] ?? '', spot(world, x, z), { species: 'mossling', variant: 'moss', brain: PACKS.stones, strike: null, seed: 521 + i, scale: 1, respawn: 45 }));
  // a ram-grazer grazes round its home (the engine refuses one without)
  HAUNTS.SOWS.forEach(([x, z], i) => world.spawnAt(`sow-${i + 1}`, spot(world, x, z), { species: 'boar', variant: 'sow', brain: 'mossgate.sow-ram', strike: null, seed: 601 + i, scale: 1, respawn: 60,
    home: { x, y: groundHeight(x, z), z, r: 6 } }));
  HAUNTS.WISPS.forEach(([x, z], i) => world.spawnAt(`bog-wisp-${i + 1}`, spot(world, x, z, 0, 5), { species: 'bog.wisp', variant: 'bog', brain: 'mossgate.wisp-dive', strike: null, seed: 701 + i, scale: 1, respawn: 60 }));
  [...HAUNTS.CAMP_SOWS, ...HAUNTS.WALLOW_SOWS].forEach(([x, z], i) => world.spawnAt(i < HAUNTS.CAMP_SOWS.length ? `camp-sow-${i + 1}` : `wallow-sow-${i - HAUNTS.CAMP_SOWS.length + 1}`, spot(world, x, z), {
    species: 'boar', variant: 'sow', brain: 'mossgate.sow-ram', strike: null, seed: 611 + i, scale: 1, respawn: 60, home: { x, y: groundHeight(x, z), z, r: 6 } }));
  HAUNTS.MERE_WISPS.forEach(([x, z], i) => world.spawnAt(`mere-wisp-${i + 1}`, spot(world, x, z, 0, BOG_WISPS.home.y - groundHeight(x, z)), { species: 'mere.wisp', variant: 'mere', brain: 'mossgate.mere-wisp-dive', strike: null, seed: 711 + i, scale: 1, respawn: 60 }));
  world.spawnAt(BODIES.greyback, spot(world, HAUNTS.GREYBACK.x, HAUNTS.GREYBACK.z, Math.PI * 0.75), { species: 'boar', variant: 'greyback', brain: null, strike: STRIKES.boarCharge.id, seed: 801, scale: 1, respawn: BOSS_RESPAWN });
  // the Warden faces the arch, west, as the static golem did
  world.spawnAt(BODIES.warden, spot(world, HAUNTS.WARDEN.x, HAUNTS.WARDEN.z, -Math.PI / 2), { species: 'barrow.warden', variant: 'warden', brain: null, strike: STRIKES.wardenSlam.id, seed: 901, scale: 1, respawn: BOSS_RESPAWN });
  // MZ15: Gritmaw faces up the haul path, north; the camp's blobs pursue as the yard's do
  world.spawnAt(BODIES.gritmaw, spot(world, HAUNTS.GRITMAW.x, HAUNTS.GRITMAW.z, Math.PI), { species: 'quarry.gritmaw', variant: 'gritmaw', brain: null, strike: STRIKES.gritmawSlam.id, seed: 951, scale: 1, respawn: BOSS_RESPAWN });
  // MZ20: the Warden's adds wait out of the world until its third phase (fights.ts lists them on it); no respawn of their own
  HAUNTS.CRAWLERS.forEach(([x, z], i) => world.spawnAt(BODIES.crawlers[i] ?? '', spot(world, x, z, Math.atan2(HAUNTS.WARDEN.x - x, HAUNTS.WARDEN.z - z)), { species: 'barrow.crawler', variant: 'crawler', brain: 'mossgate.blob-pursuit', strike: STRIKES.crawlerBump.id, seed: 921 + i, scale: 1 }));
  HAUNTS.QUARRY_BLOBS.forEach(([x, z], i) => world.spawnAt(`quarry-blob-${i + 1}`, spot(world, x, z), { species: 'grey.blob', variant: 'grey', brain: 'mossgate.blob-pursuit', strike: i === 0 ? STRIKES.blobLane.id : STRIKES.blobBump.id, seed: 461 + i, scale: 1, respawn: 60 }));
  // MZ21: the ridge's scavengers pursue as the yard's blobs do (one throws the lane), and the cairn's crawlers face out from it
  HAUNTS.RIDGE_BLOBS.forEach(([x, z], i) => world.spawnAt(`ridge-blob-${i + 1}`, spot(world, x, z), { species: 'grey.blob', variant: 'grey', brain: 'mossgate.blob-pursuit', strike: i === 4 ? STRIKES.blobLane.id : STRIKES.blobBump.id, seed: 471 + i, scale: 1, respawn: 60 }));
  HAUNTS.CAIRN_CRAWLERS.forEach(([x, z], i) => world.spawnAt(`cairn-crawler-${i + 1}`, spot(world, x, z, Math.atan2(x - 210, z - 80)), { species: 'barrow.crawler', variant: 'crawler', brain: 'mossgate.blob-pursuit', strike: STRIKES.crawlerBump.id, seed: 931 + i, scale: 1, respawn: 60 }));
}
