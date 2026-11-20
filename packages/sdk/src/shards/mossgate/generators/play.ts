// TEMPLATE-E2E TR-12 (J434): Mossgate's gameplay, ported from the legacy Template (`_template`'s `data/` and `behaviour/`,
// built under TC-M) onto this scene at its own node positions. Every switch is the scene's own state (SS-GF0): a use prompt
// `sets` a shared field and a panel part's `shownWhen` reads it, so no hand-written script is needed. The quests, the talks
// and the rack's take are rows `extend` adds (gameplay.ts). TR-12b: the creatures (creatures.ts) and the Barrow Warden's
// tell, its ground ring and open core, as panels its decision script's fields show (fights.ts).
//
// - braziers A, B and C: each prompt lights its own; its flames burn on the brazier, its row twin and the arena's rim
// - brazier A lit sinks the moss gate's bars; brazier B lit raises the pond's stepping stones
// - the lever by the north wall opens the north gate (TC-M4a); the lift rides up to the ledge cache (TC-M4b)
// - the old chest by the sign opens (TC-M5a); the moss blade comes off its rack (TC-M5b)
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { solid, type ShardWorld } from '@wildshard/sdk/scene/author';
import { fire } from '@wildshard/sdk/scene/fire';
import { buildMossgate, groundHeight, LAYOUT } from './world';
import { buildCreatures, HAUNTS } from './creatures';
import { GRITMAW_PANELS, WARDEN_PANELS } from './fights';
import { buildQuarry } from './quarry';
import { buildMeadow } from './meadow';
import { buildThicket } from './thicket';
import { buildBog } from './bog';
import { buildRidge } from './ridge';
import { buildPlaces } from './places';

/** Where the gameplay stands (the Template's `data/layout.json`, which was this scene's plan). */
export const PLAY = {
  /** braziers A to C's use points, 1.7 m over their pads (above the plinth's collider, or the prompt's sight line hits it) */
  BRAZIERS: LAYOUT.BRAZIERS,
  /** the north gate's gap in the yard's north wall (z = YARD.z0), at the lever's x */
  NORTH_GATE: { x: 8.5, half: 1.9 },
  LEVER: { x: 8.5, z: -16.6 },
  RACK: { x: 1, z: -12 },
  CHEST: { x: -8.2, z: -7.6 },
  HERMIT: { x: -15.2, z: 7 },
  LIFT: { x: 8.5, z: 3.65 },
  LEDGE: { x: 8.5, z: 6.4, hx: 2, hz: 1.4, height: 5.2 },
  /** the hut lantern's stand, beside the hut door (the Template's held lantern, which the chest refilled) */
  LANTERN: { x: -1.6, z: -11.2 },
} as const;

/** The state fields the prompts set, and the prompts' ids (a shared prompt is spent while `<id>.spent` holds). */
export const FIELDS = {
  brazier: (letter: string): string => `mossgate.brazier-${letter.toLowerCase()}`,
  northGate: 'mossgate.north-gate.open',
  chest: 'mossgate.chest.open',
  ledgeCache: 'mossgate.ledge-cache.open',
} as const;
export const USES = {
  brazier: (letter: string): string => `mossgate.brazier-${letter.toLowerCase()}.use`,
  lever: 'mossgate.lever.use',
  chest: 'mossgate.chest.use',
  rack: 'mossgate.rack.use',
  lantern: 'mossgate.lantern.take',
  ledgeCache: 'mossgate.ledge-cache.use',
} as const;
/** The hut lantern a player takes off its stand (`world.pickup`: the sdk writes the tool, its take and its light). */
export const HUT_LANTERN = { id: 'tool.hut-lantern', name: 'Hut lantern', blurb: 'The lantern from the hut door; its stand refills it.', colour: '#c9a25a', intensity: 3, fuelSeconds: 300 } as const;
/** The scene the rack's prompt runs: a take of the moss blade (gameplay.ts declares it). */
export const RACK_SCENE = 'mossgate.rack.take';
/** The quest flag the ledge cache's region raises. */
export const LEDGE_FLAG = 'mossgate.ledge.found';
/** MZ4 (J454): the flag the region just past the moss gate raises, the first flame's second step. */
export const GATE_PASSED_FLAG = 'mossgate.gate.passed';
/** Where that region stands: west of the gate (world.ts `LAYOUT.GATE`), short of the pond. */
export const GATE_PASS = { x: -11.8, z: 0, radius: 1.6 } as const;

/** A panel's own material: its textures load with the shard, and the yard's far tiles may not share them (SS9e). */
const plain = (color: string, roughness = 0.9, emissive?: string): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness, ...(emissive === undefined ? {} : { emissive, emissiveIntensity: 1.6 }) });
const box = (w: number, h: number, d: number, material: THREE.Material, r = 0.04): THREE.Mesh => {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, r), material); m.castShadow = true; m.receiveShadow = true; return m;
};
/** An invisible solid box at these numbers. */
const block = (x: number, y: number, z: number, hx: number, hy: number, hz: number): THREE.Mesh => {
  const m = solid(new THREE.Mesh(new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2), plain('#000000'))); m.position.set(x, y, z); m.visible = false; return m;
};
/** A node the prompt or trigger reads its place from. */
const node = (part: THREE.Group, x: number, y: number, z: number): THREE.Object3D => { const o = new THREE.Object3D(); o.position.set(x, y, z); part.add(o); return o; };

/** One burning bowl: the sdk's fire (MZ7, QA 11-19 row 29) on the coals at (x, y, z): additive tongues that lick and
 *  breathe, embers, thin smoke and a glow on the coals, all in graph materials, so the panel that shows it carries them. */
function flame(into: THREE.Group, x: number, y: number, z: number, size: number): void {
  const f = fire({ size, seed: Math.abs(Math.round(x * 13 + z * 7)) + 1 }); f.position.set(x, y, z); into.add(f);
}

/** MZ31 (QA 11-19 row 35, "nothing happens"): a lit fire's light on the ground round it, three soft warm discs laid flat
 *  (a panel holds meshes only, so the glow is drawn, not a lamp: MZ34 brings real lights to panels). */
function glowPool(into: THREE.Group, x: number, y: number, z: number, size: number, colour = '#ffb050'): void {
  for (const [r, opacity, lift] of [[3.4, 0.1, 0.02], [2.3, 0.16, 0.03], [1.3, 0.24, 0.04]] as const) {
    const material = new THREE.MeshStandardMaterial({ color: colour, emissive: colour, emissiveIntensity: 1.2, roughness: 1, transparent: true, opacity, depthWrite: false });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(r * size, 28), material);
    disc.rotation.x = -Math.PI / 2; disc.position.set(x, y + lift, z); disc.receiveShadow = false; into.add(disc);
  }
}

/** The rim brazier on the arena's far wall that burns with quest brazier `letter` (world.ts `arena`). */
function rimSeat(letter: string): [number, number, number] {
  const a = ({ A: -0.42, B: 0, C: 0.42 } as Record<string, number>)[letter] ?? 0, { x, z, r } = LAYOUT.ARENA;
  return [x + Math.cos(a) * (r + 0.05), 2.12, z + Math.sin(a) * (r + 0.05)];
}

/** The braziers: a prompt over each bowl, and each letter's flames as a panel its field shows. */
function braziers(world: ShardWorld): void {
  world.part('brazier-uses', (part) => {
    for (const [x, z, letter] of PLAY.BRAZIERS) {
      world.interact(USES.brazier(letter), node(part, x, groundHeight(x, z) + 1.7, z), { label: `Light brazier ${letter}`, radius: 2.5, sets: { field: FIELDS.brazier(letter), scope: 'shared', value: true } });
    }
  });
  for (const [x, z, letter] of PLAY.BRAZIERS) {
    world.part(`flame-${letter.toLowerCase()}`, (part) => {
      flame(part, x, groundHeight(x, z) + 1.16, z, 1);
      glowPool(part, x, groundHeight(x, z), z, 1);
      // its row twin by brazier A (world.ts `LAYOUT.ROW`, scale 0.92) and its rim brazier in the arena
      for (const [rx, rz, l] of LAYOUT.ROW) if (l === letter) flame(part, rx, groundHeight(rx, rz) + 1.09, rz, 0.92);
      const [ax, ay, az] = rimSeat(letter); flame(part, ax, ay, az, 0.8);
    }, { panel: `mossgate.flame-${letter.toLowerCase()}`, shownWhen: { field: FIELDS.brazier(letter), equals: true } });
  }
}

/** The moss gate's bars (cleanroom world.js 577-606): standing while brazier A is cold, sunk once it burns. */
function gateBars(world: ShardWorld): void {
  world.part('gate-bars', (part) => {
    const { x: gx, z: gz, half } = LAYOUT.GATE, stone = plain('#8d877b', 0.92), span = half * 2 + 0.05;
    for (const y of [0.2, 2.75]) { const rail = box(0.34, 0.3, span, stone, 0.05); rail.position.set(gx, y, gz); part.add(rail); }
    for (let i = 0; i < 6; i++) { const bar = box(0.26, 2.6, 0.26, stone, 0.06); bar.position.set(gx, 1.45, gz - half + 0.3 + i * ((half * 2 - 0.6) / 5)); part.add(bar); }
    part.add(block(gx, 1.2, gz, 0.15, 1.2, half));
  }, { panel: 'mossgate.gate', shownWhen: { field: FIELDS.brazier('A'), equals: false } });
  // MZ4 (J454): through the opened gate, the first flame's second step
  world.part('gate-pass', (part) => { world.trigger(GATE_PASSED_FLAG, node(part, GATE_PASS.x, groundHeight(GATE_PASS.x, GATE_PASS.z), GATE_PASS.z), { radius: GATE_PASS.radius }); });
}

/** The pond's stepping stones (world.ts `pond`), raised out of the water once brazier B burns. */
function pondStones(world: ShardWorld): void {
  world.part('pond-stones', (part) => {
    const P = LAYOUT.POND, stone = plain('#8a8579', 0.9), moss = plain('#5f7a34', 1), n = 5, x0 = P.x + P.hx - 1.5, x1 = P.x - P.hx + 1.5, top = 0.28;
    for (let i = 0; i < n; i++) {
      const x = x0 + (x1 - x0) * (i / (n - 1));
      const stoneBox = box(1.7, 0.7, 1.7, stone, 0.08); stoneBox.position.set(x, top - 0.35, P.z); part.add(stoneBox);
      const cap = box(1.75, 0.16, 1.75, moss, 0.06); cap.position.set(x, top + 0.06, P.z); part.add(cap);
      part.add(block(x, top - 0.6, P.z, 0.85, 0.6, 0.85));
    }
  }, { panel: 'mossgate.pond-stones', shownWhen: { field: FIELDS.brazier('B'), equals: true } });
}

/** TC-M4a: the north gate in the yard's north wall (world.ts leaves the gap) and its lever inside the yard. */
function northGateAndLever(world: ShardWorld): void {
  const wood = plain('#7a5232', 0.85), dark = plain('#4e3522', 0.9), iron = plain('#3c3c40', 0.5);
  world.part('north-gate', (part) => {
    const { x, half } = PLAY.NORTH_GATE, z = LAYOUT.YARD.z0, h = 1.9;
    for (let i = 0; i < 6; i++) { const plank = box((half * 2) / 6 - 0.04, h, 0.12, wood, 0.02); plank.position.set(x - half + (i + 0.5) * ((half * 2) / 6), h / 2, z); part.add(plank); }
    for (const y of [0.4, 1.5]) { const brace = box(half * 2, 0.16, 0.16, dark, 0.03); brace.position.set(x, y, z + 0.12); part.add(brace); }
    part.add(block(x, h / 2, z, half, h / 2, 0.2));
  }, { panel: 'mossgate.north-gate', shownWhen: { field: FIELDS.northGate, equals: false } });
  world.part('lever', (part) => {
    const { x, z } = PLAY.LEVER, gy = groundHeight(x, z);
    const post = box(0.3, 1.1, 0.3, dark, 0.03); post.position.set(x, gy + 0.55, z); part.add(post);
    const handle = box(0.08, 0.7, 0.08, iron, 0.02); handle.position.set(x, gy + 1.3, z); handle.rotation.x = 0.5; part.add(handle);
    part.add(block(x, gy + 0.55, z, 0.15, 0.55, 0.15));
    world.interact(USES.lever, node(part, x, gy + 1, z), { label: 'Pull the lever', radius: 2, sets: { field: FIELDS.northGate, scope: 'shared', value: true } });
  });
}

/** TC-M5b: the moss blade on its rack by the yard; taking it is the engine's rack take (gameplay.ts). */
function rack(world: ShardWorld): void {
  world.part('rack', (part) => {
    const { x, z } = PLAY.RACK, gy = groundHeight(x, z), wood = plain('#6e4a2c', 0.85), blade = plain('#9fb88a', 0.35), grip = plain('#3a2a1c', 0.8);
    for (const dx of [-0.6, 0.6]) { const leg = box(0.12, 1.3, 0.12, wood, 0.02); leg.position.set(x + dx, gy + 0.65, z); part.add(leg); }
    for (const y of [0.55, 1.15]) { const bar = box(1.4, 0.1, 0.12, wood, 0.02); bar.position.set(x, gy + y, z); part.add(bar); }
    const sword = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.0, 0.02), blade); sword.position.set(x, gy + 0.95, z + 0.09); part.add(sword);
    const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.05), grip); hilt.position.set(x, gy + 0.43, z + 0.09); part.add(hilt);
    part.add(block(x, gy + 0.65, z, 0.7, 0.65, 0.1));
    world.interact(USES.rack, node(part, x, gy + 1, z), { label: 'Take the moss blade', radius: 2, scene: RACK_SCENE });
  });
}

/** TC-M5a: the old chest by the sign, its lid shut until the first player opens it. */
function chest(world: ShardWorld): void {
  const { x, z } = PLAY.CHEST, gy = groundHeight(x, z), wood = plain('#7b5434', 0.85), band = plain('#4a4a50', 0.5);
  world.part('chest', (part) => {
    const body = box(0.9, 0.5, 0.6, wood, 0.03); body.position.set(x, gy + 0.25, z); part.add(body);
    for (const dx of [-0.3, 0.3]) { const strap = box(0.06, 0.52, 0.62, band, 0.01); strap.position.set(x + dx, gy + 0.25, z); part.add(strap); }
    part.add(block(x, gy + 0.25, z, 0.45, 0.25, 0.3));
    world.interact(USES.chest, node(part, x, gy + 0.6, z), { label: 'Open the old chest', radius: 2.2, sets: { field: FIELDS.chest, scope: 'shared', value: true } });
  });
  world.part('chest-lid', (part) => {
    const lid = box(0.94, 0.14, 0.64, wood, 0.03); lid.position.set(x, gy + 0.57, z); part.add(lid);
  }, { panel: 'mossgate.chest.lid', shownWhen: { field: FIELDS.chest, equals: false } });
  world.part('chest-lid-open', (part) => {
    const lid = box(0.94, 0.64, 0.14, wood, 0.03); lid.position.set(x, gy + 0.82, z - 0.32); part.add(lid);
  }, { panel: 'mossgate.chest.lid-open', shownWhen: { field: FIELDS.chest, equals: true } });
}

/** The hut lantern on its stand by the hut door: a post, an arm and the lantern on its hook. */
function lanternStand(world: ShardWorld): void {
  world.part('lantern-stand', (part) => {
    const { x, z } = PLAY.LANTERN, gy = groundHeight(x, z), wood = plain('#5e4330', 0.85), brass = plain('#b08a4a', 0.4), glass = plain('#ffd690', 0.6, '#ffb040');
    const post = box(0.12, 1.6, 0.12, wood, 0.02); post.position.set(x, gy + 0.8, z); part.add(post);
    const arm = box(0.5, 0.08, 0.08, wood, 0.02); arm.position.set(x + 0.22, gy + 1.55, z); part.add(arm);
    const cage = box(0.2, 0.28, 0.2, brass, 0.03); cage.position.set(x + 0.42, gy + 1.3, z); part.add(cage);
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), glass); light.position.set(x + 0.42, gy + 1.3, z); part.add(light);
    part.add(block(x, gy + 0.8, z, 0.08, 0.8, 0.08));
    world.pickup(USES.lantern, node(part, x + 0.42, gy + 1.3, z), { label: 'Take the hut lantern', radius: 2, item: HUT_LANTERN, flag: 'mossgate.lantern.taken' });
  });
}

/** TC-M4b: the ledge by the south wall, its cache on top, and the lift beside it that rides up and down all the time. */
function liftAndLedge(world: ShardWorld): void {
  const L = PLAY.LEDGE, ground = groundHeight(L.x, L.z), top = ground + L.height;
  world.part('ledge', (part) => {
    const stone = plain('#8c867a', 0.92), moss = plain('#5b7a30', 1), wood = plain('#86592f', 0.85), base = ground - 0.4, h = top - base;
    const body = box(L.hx * 2, h, L.hz * 2, stone, 0.06); body.position.set(L.x, base + h / 2, L.z); part.add(body);
    const cap = box(L.hx * 2 + 0.2, 0.18, L.hz * 2 + 0.2, moss, 0.05); cap.position.set(L.x, top - 0.05, L.z); part.add(cap);
    const cache = box(0.8, 0.5, 0.5, wood, 0.03); cache.position.set(L.x, top + 0.29, L.z + L.hz - 0.6); part.add(cache);
    part.add(block(L.x, base + h / 2, L.z, L.hx, h / 2, L.hz));
    world.trigger(LEDGE_FLAG, node(part, L.x, top, L.z), { radius: 1.4 });
    // MZ4 (J454): the cache is searched, not found by standing on it; it holds the old chest's key (quests.ts)
    world.interact(USES.ledgeCache, node(part, L.x, top + 0.8, L.z + L.hz - 0.6), { label: 'Search the ledge cache', radius: 1.8, sets: { field: FIELDS.ledgeCache, scope: 'shared', value: true } });
  });
  const { x, z } = PLAY.LIFT, floor = groundHeight(x, z), half = 1.2, thick = 0.12, rest = floor - thick + 0.1, rise = top - floor - 0.1;
  world.part('lift', (part) => {
    const wood = plain('#86592f', 0.85);
    const deck = solid(box(half * 2, thick * 2, half * 2, wood, 0.03)); deck.position.set(x, rest, z); part.add(deck);
    for (const dx of [-half + 0.05, half - 0.05]) { const post = box(0.1, 0.9, 0.1, wood, 0.02); post.position.set(x + dx, rest + 0.45, z - half + 0.05); part.add(post); }
    const bar = box(half * 2, 0.08, 0.08, wood, 0.02); bar.position.set(x, rest + 0.9, z - half + 0.05); part.add(bar);
  }, { panel: 'mossgate.lift', mover: { path: [[x, rest, z], [x, rest + rise, z]], seconds: 4, start: 'always', loop: 'pingpong' } });
}

/** TR-12b: the Warden's tell, a ring of ember spikes round its feet while it rears, and the gem over its crown while its core
 *  is open. Panels with no `shownWhen`: their rows read the decision script's own fields (fights.ts). */
function wardenTell(world: ShardWorld): void {
  const { x, z } = HAUNTS.WARDEN, gy = groundHeight(x, z), ember = plain('#ff8a2a', 1, '#ff6a10'), gem = plain('#ffc070', 0.4, '#ffa030');
  world.part('warden-ring', (part) => {
    for (let k = 0; k < 12; k++) {
      const a = (k * Math.PI) / 6, spike = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.9, 6), ember);
      spike.position.set(x + Math.sin(a) * 2.8, gy + 0.45, z + Math.cos(a) * 2.8); part.add(spike);
    }
  }, { panel: WARDEN_PANELS.ring });
  world.part('warden-core', (part) => {
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), gem); core.position.set(x, gy + 5.2, z); part.add(core);
  }, { panel: WARDEN_PANELS.core });
}

/** MZ15: Gritmaw's tell, a ring of grit spikes round its feet while it rears (its script's `tell` field, fights.ts). */
function gritmawTell(world: ShardWorld): void {
  const { x, z } = HAUNTS.GRITMAW, gy = groundHeight(x, z), grit = plain('#d8b878', 1, '#c08a30');
  world.part('gritmaw-ring', (part) => {
    for (let k = 0; k < 10; k++) {
      const a = (k * Math.PI) / 5, spike = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.8, 5), grit);
      spike.position.set(x + Math.sin(a) * 2.4, gy + 0.4, z + Math.cos(a) * 2.4); spike.rotation.z = Math.sin(a) * 0.2; part.add(spike);
    }
  }, { panel: GRITMAW_PANELS.ring });
}

/** MZ31 (QA 11-19 rows 26, 35): the chain's payoff. The Warden down (its script's `relit` field, fights.ts), the Hollow
 *  answers: a ring of moss runes burns round the barrow floor, and a trail of lit stones leads from the ring back to the
 *  Lamplighter, the next goal. It goes out when the Warden re-arms. */
function hollowRelit(world: ShardWorld): void {
  const { x: ax, z: az, r } = LAYOUT.ARENA, rune = plain('#ffd27a', 0.6, '#ffb040'), moss = plain('#b8ff7a', 0.8, '#7adf40');
  world.part('hollow-relit', (part) => {
    for (let k = 0; k < 16; k++) {
      const a = (k * Math.PI) / 8, rx = ax + Math.cos(a) * (r - 1.6), rz = az + Math.sin(a) * (r - 1.6), gy = groundHeight(rx, rz);
      const stone = box(0.34, 0.5, 0.34, k % 2 === 0 ? rune : moss, 0.05); stone.position.set(rx, gy + 0.25, rz); stone.rotation.y = a; part.add(stone);
    }
    glowPool(part, ax, groundHeight(ax, az), az, 2.2, '#ffc860');
    // the trail home: lit stones every 1.6 m from the ring's west gap, along the yard path, to the Lamplighter
    const route: [number, number][] = [[ax - r + 0.5, az], [8, -2], [LAYOUT.LAMPLIGHTER.x + 1.4, LAYOUT.LAMPLIGHTER.z + 1.2]];
    for (let leg = 0; leg < route.length - 1; leg++) {
      const [x0, z0] = route[leg] ?? [0, 0], [x1, z1] = route[leg + 1] ?? [0, 0], n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 1.6));
      for (let i = 0; i < n; i++) {
        const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, gy = groundHeight(x, z);
        const lit = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.08, 10), rune); lit.position.set(x, gy + 0.04, z); part.add(lit);
        glowPool(part, x, gy, z, 0.22, '#ffc860');
      }
    }
  }, { panel: WARDEN_PANELS.relit });
}

/** Everything the player uses in the Hollow (TR-12), at the scene's own places. */
export function buildPlay(world: ShardWorld): void {
  braziers(world);
  gateBars(world);
  pondStones(world);
  northGateAndLever(world);
  rack(world);
  chest(world);
  lanternStand(world);
  liftAndLedge(world);
}

/** The whole Hollow: the cleanroom's scene (world.ts), what the player uses in it and what it fights (TR-12b). */
export function buildHollow(world: ShardWorld): void {
  buildMossgate(world);
  buildPlay(world);
  buildCreatures(world);
  buildMeadow(world);
  buildThicket(world);
  buildBog(world);
  buildQuarry(world);
  buildRidge(world);
  buildPlaces(world);
  wardenTell(world);
  gritmawTell(world);
  hollowRelit(world);
}
