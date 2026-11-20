// MOSSGATE-ZONE MZ22 (J452): the Hollow's finds, to the full-zone bar. Twelve pieces of the Lamplighter's lost lamp-glass,
// two in each of six regions, off the roads: a glint of amber crystals on a mossy stone. A piece is found by walking onto
// it (a region trigger, so each player finds their own); the set's quest counts them and pays one achievement. The glass
// stays where it lies: a piece the player took would need a state field each, and twelve more fields pass the 24 a
// generated script reads. A third chest on the Downs, at the Old Cairn's foot behind the crawlers' camp, as the Bog's
// (one lid for the world; the quest pays each player who stands at it once it is open). Four lore signs: the thicket's
// sign and the ridge's view stone (their own regions), the rite tablet on the Sunken Shrine's altar and the Quarry's
// notice board; each asks to be left, which files its reading, and the four make one quest.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { solid, type ShardWorld } from '@wildshard/sdk/scene/author';
import { CAIRN_CAMP, DOWNS } from './downs';
import { BOG } from './bog';
import { groundHeight } from './hollow';
import * as T from './textures';

/** The twelve pieces of lamp-glass, two to a region (layout.ts), each at least 3 m off every road. */
export const GLASS: readonly { readonly region: string; readonly x: number; readonly z: number }[] = [
  { region: 'meadow', x: -55, z: -95 }, { region: 'meadow', x: 15, z: -215 },
  { region: 'thicket', x: 100, z: -90 }, { region: 'thicket', x: 215, z: -150 },
  { region: 'downs', x: 205, z: -20 }, { region: 'downs', x: 120, z: 95 },
  { region: 'bog', x: -100, z: -30 }, { region: 'bog', x: -150, z: 95 },
  { region: 'quarry', x: -65, z: 140 }, { region: 'quarry', x: 75, z: 160 },
  { region: 'ridge', x: -120, z: -215 }, { region: 'ridge', x: -225, z: -170 },
];
export const glassFlag = (i: number): string => `mossgate.glass.${i + 1}`;
export const GLASS_FLAGS: readonly string[] = GLASS.map((_, i) => glassFlag(i));

/** The cairn's chest, at the Old Cairn's east foot, inside the ring of its crawlers' camp. */
export const CAIRN_CHEST = { x: DOWNS.CAIRN.x + 5, z: DOWNS.CAIRN.z, field: 'mossgate.cairn-chest.open', use: 'mossgate.cairn-chest.use' } as const;
export const FIND_FLAGS = {
  glassPaid: 'mossgate.glass.paid',
  atCairnChest: 'mossgate.cairn.chest.reached', cairnChestOpened: 'mossgate.cairn.chest.opened', cairnPaid: 'mossgate.cairn.paid',
  lorePaid: 'mossgate.lore.paid', loreTold: 'mossgate.hermit.lore',
} as const;
/** Each lore sign's reading: raised by its talk's last choice. */
export const LORE_FLAGS = { thicket: 'mossgate.lore.thicket', ridge: 'mossgate.lore.ridge', shrine: 'mossgate.lore.shrine', quarry: 'mossgate.lore.quarry' } as const;
/** MZ22: the Pond Hermit hears the four old signs read back (quests.ts adds the choice and its node to his tree). */
export const HERMIT_LORE = {
  choice: { id: 'lore', label: 'I have read the four old signs.', next: 'lore', sets: [FIND_FLAGS.loreTold], when: { all: Object.values(LORE_FLAGS), none: [FIND_FLAGS.loreTold] } },
  node: { id: 'lore', lines: ['All four? Then you know the Hollow better than the Warden does. Most of it is true.', 'The rest the Lamplighter made up to keep children off the Downs. Take these, for listening.'], choices: [] },
};
/** A lore sign's leaving choice, which files its reading. */
export const leave = (flag: string): { id: 'leave'; label: string; next: null; sets: string[] } => ({ id: 'leave', label: 'Leave it', next: null, sets: [flag] });

/** MZ22: the rite tablet on the Sunken Shrine's altar, and the Quarry's notice board by the blobs' camp. */
const SHRINE_TABLET = { x: BOG.SHRINE.x - 1.5, z: BOG.SHRINE.z + 1.5 };
const NOTICE = { x: -24, z: 181 };
export const SHRINE_TABLET_DIALOGUE = {
  id: 'mossgate.shrine.tablet', name: 'The rite tablet', start: 'read',
  nodes: [{ id: 'read', lines: [
    'Cut deep, half under the moss: THREE FLAMES IN THE HOLLOW, THE RITE AT THE STONES, THE WORD BROUGHT HERE, THE BEACON ON THE RIDGE.',
    'THEN THE RING OPENS, AND THE KEEPER WAKES TO BE PUT DOWN AGAIN. STRIKE WHERE IT GLOWS.',
  ], choices: [leave(LORE_FLAGS.shrine)] }],
};
export const NOTICE_DIALOGUE = {
  id: 'mossgate.quarry.notice', name: 'The notice board', start: 'read',
  nodes: [{ id: 'read', lines: [
    'WORK STOPPED. The pit woke. Something of sandstone stands where the face came down, and it does not like a pick.',
    'Blobs in the camp. Do not feed them. Do not leave the tarp up. Wages at the Quarrymaster\'s lean-to, past the bridge.',
  ], choices: [leave(LORE_FLAGS.quarry)] }],
};
const at = (x: number, z: number): [number, number, number] => [x, groundHeight(x, z), z];
export const FIND_TALKS = [
  { id: 'mossgate.shrine.tablet.read', at: at(SHRINE_TABLET.x, SHRINE_TABLET.z), radius: 2.4, label: 'Read the tablet', dialogue: SHRINE_TABLET_DIALOGUE.id },
  { id: 'mossgate.quarry.notice.read', at: at(NOTICE.x, NOTICE.z), radius: 2.2, label: 'Read the notice', dialogue: NOTICE_DIALOGUE.id },
];

const glassM = new THREE.MeshStandardMaterial({ name: 'find-glass', color: '#ffc46b', emissive: '#ff9a2a', emissiveIntensity: 1.6, roughness: 0.25 });
const stoneM = new THREE.MeshStandardMaterial({ name: 'find-stone', color: '#7d7a70', roughness: 0.95 });
const mossM = new THREE.MeshStandardMaterial({ name: 'find-moss', color: '#4f6e22', roughness: 1 });
const woodM = new THREE.MeshStandardMaterial({ name: 'find-wood', color: '#6b5236', roughness: 0.9 });
const paperM = new THREE.MeshStandardMaterial({ name: 'find-paper', color: '#d8ccb0', roughness: 1 });
const bandM = new THREE.MeshStandardMaterial({ name: 'find-band', color: '#3f4a3c', roughness: 0.5 });

const node = (part: THREE.Group, x: number, y: number, z: number): THREE.Object3D => { const o = new THREE.Object3D(); o.position.set(x, y, z); part.add(o); return o; };
const box = (w: number, h: number, d: number, m: THREE.Material): THREE.Mesh => { const b = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(0.03, w / 4, h / 4, d / 4)), m); b.castShadow = true; b.receiveShadow = true; return b; };
const block = (part: THREE.Group, x: number, y: number, z: number, hx: number, hy: number, hz: number): void => {
  const m = solid(new THREE.Mesh(new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2), stoneM)); m.position.set(x, y, z); m.visible = false; part.add(m);
};

/** One piece of lamp-glass: three amber crystals leaning out of a mossy stone. */
function glass(part: THREE.Group, x: number, z: number, rand: () => number): void {
  const gy = groundHeight(x, z);
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42, 0), stoneM); rock.scale.set(1.2, 0.55, 1); rock.position.set(x, gy + 0.12, z); rock.rotation.y = rand() * 3; rock.receiveShadow = true; part.add(rock);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.36, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), mossM); cap.scale.set(1.2, 0.3, 1); cap.position.set(x, gy + 0.22, z); part.add(cap);
  for (let k = 0; k < 3; k++) {
    const h = 0.34 + rand() * 0.22, crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), glassM);
    crystal.scale.set(0.8, h / 0.1, 0.8); crystal.position.set(x + (k - 1) * 0.12, gy + 0.28 + h * 0.5, z + (rand() - 0.5) * 0.15);
    crystal.rotation.set((rand() - 0.5) * 0.6, rand() * 3, (k - 1) * 0.35); part.add(crystal);
  }
}

/** The Quarry's notice board: two posts, a plank board with pinned sheets under a little roof. */
function notice(part: THREE.Group): void {
  const { x, z } = NOTICE, gy = groundHeight(x, z);
  for (const dx of [-0.7, 0.7]) { const post = box(0.12, 2, 0.12, woodM); post.position.set(x + dx, gy + 1, z); part.add(post); }
  const board = box(1.6, 1, 0.08, woodM); board.position.set(x, gy + 1.35, z); part.add(board);
  for (const [dx, dy] of [[-0.4, 0.1], [0.3, 0.15], [0, -0.2]] as const) { const sheet = box(0.38, 0.45, 0.02, paperM); sheet.position.set(x + dx, gy + 1.35 + dy, z + 0.05); sheet.rotation.z = dx * 0.15; part.add(sheet); }
  const roof = box(1.9, 0.08, 0.5, woodM); roof.position.set(x, gy + 2.02, z + 0.08); roof.rotation.x = 0.25; part.add(roof);
  block(part, x, gy + 1, z, 0.85, 1, 0.1);
}

/** The cairn's chest, as the Bog's: a shared prompt, its lid a panel its field shows shut or open. */
function cairnChest(world: ShardWorld): void {
  const { x, z } = CAIRN_CHEST, gy = groundHeight(x, z);
  world.part('cairn-chest', (part) => {
    const body = box(0.9, 0.5, 0.6, woodM); body.position.set(x, gy + 0.25, z); body.rotation.y = Math.PI / 2; part.add(body);
    for (const dz of [-0.3, 0.3]) { const strap = box(0.62, 0.52, 0.06, bandM); strap.position.set(x, gy + 0.25, z + dz); part.add(strap); }
    block(part, x, gy + 0.25, z, 0.3, 0.25, 0.45);
    world.interact(CAIRN_CHEST.use, node(part, x, gy + 0.6, z), { label: 'Open the cairn chest', radius: 2.2, sets: { field: CAIRN_CHEST.field, scope: 'shared', value: true } });
    world.trigger(FIND_FLAGS.atCairnChest, node(part, x, gy, z), { radius: 3 });
  });
  world.part('cairn-chest-lid', (part) => {
    const lid = box(0.64, 0.14, 0.94, woodM); lid.position.set(x, gy + 0.57, z); part.add(lid);
  }, { panel: 'mossgate.cairn-chest.lid', shownWhen: { field: CAIRN_CHEST.field, equals: false } });
  world.part('cairn-chest-lid-open', (part) => {
    const lid = box(0.14, 0.64, 0.94, woodM); lid.position.set(x + 0.32, gy + 0.82, z); part.add(lid);
  }, { panel: 'mossgate.cairn-chest.lid-open', shownWhen: { field: CAIRN_CHEST.field, equals: true } });
}

/** The finds: the twelve pieces of glass with a region trigger at each, the notice board and the cairn's chest. */
export function buildFinds(world: ShardWorld): void {
  world.part('finds', (part) => {
    const rand = T.rng(2201);
    GLASS.forEach(({ x, z }, i) => { glass(part, x, z, rand); world.trigger(glassFlag(i), node(part, x, groundHeight(x, z), z), { radius: 1.8 }); });
    notice(part);
  });
  cairnChest(world);
}

const dead = (spawn: string): string => `dead:${spawn}`;
const CAIRN_DEAD = CAIRN_CAMP.seats.map((_, i) => dead(`cairn-crawler-${i + 1}`));
const marker = (id: string, label: string, short: string, p: { x: number; z: number }, hideWhen?: string) =>
  ({ id, label, short, at: { poi: 'world' as const, x: p.x, z: p.z }, ...(hideWhen === undefined ? {} : { hideWhen: { all: [hideWhen] } }) });
const LORE = Object.values(LORE_FLAGS);

/** The finds' quest rows (quests.ts merges them): their flags, the chest's trigger and the three quests. */
export const FIND_QUESTS = {
  flags: [...GLASS_FLAGS, ...Object.values(FIND_FLAGS), ...LORE, ...CAIRN_DEAD],
  triggers: [{ id: 'cairn.chest.opened', kind: 'script' as const, flag: FIND_FLAGS.cairnChestOpened, condition: `${CAIRN_CHEST.use}.spent` }],
  dialogue: [SHRINE_TABLET_DIALOGUE, NOTICE_DIALOGUE],
  quests: [
    { id: 'mossgate.glass', title: "The Lamplighter's glass", track: false, completeFlag: FIND_FLAGS.glassPaid,
      steps: [{ id: 'glass', objective: 'Find the twelve pieces of lamp-glass', chip: 'Glass', count: [...GLASS_FLAGS], done: { all: [...GLASS_FLAGS] },
        hint: 'Amber glints on mossy stones, two in every region round the Hollow' }],
      onComplete: { fact: 'mossgate.glass', coins: 30 } },
    { id: 'mossgate.cairn', title: "The cairn's chest", track: false, completeFlag: FIND_FLAGS.cairnPaid,
      steps: [{ id: 'crawlers', objective: 'Clear the crawlers from the Old Cairn', chip: 'Crawlers', count: CAIRN_DEAD, done: { all: CAIRN_DEAD },
        markers: [marker('cairn.marker', 'The Old Cairn', 'Cairn', DOWNS.CAIRN, CAIRN_DEAD[0])] },
        { id: 'chest', objective: 'Open the chest at the cairn\'s foot', done: { all: [FIND_FLAGS.atCairnChest, FIND_FLAGS.cairnChestOpened] } }],
      onComplete: { fact: 'mossgate.cairn', coins: 20 } },
    { id: 'mossgate.lore', title: 'Old words', track: false, completeFlag: FIND_FLAGS.lorePaid,
      steps: [{ id: 'read', objective: 'Read the Hollow\'s four old signs', chip: 'Signs', count: LORE, done: { all: LORE },
        hint: 'A sign in the thicket, a stone on the ridge, a tablet in the shrine, a board at the quarry' },
        { id: 'report', objective: 'Tell the Pond Hermit what the old words say', done: { all: [FIND_FLAGS.loreTold] }, hint: 'The Hermit waits on the pond\'s north bank' }],
      onComplete: { fact: 'mossgate.lore', coins: 15 } },
  ],
};

const achievement = (fact: string, id: string, title: string) => ({ fact, origin: { kind: 'engine' as const, source: 'quest.complete' }, rewards: [{ kind: 'achievement' as const, id, title, threshold: 1 }] });
/** The finds' ledger: the set's one achievement, one for each chest the yard's has not, and the signs'. */
export const FIND_LEDGER = [
  achievement('mossgate.glass', 'mossgate.glass', 'Twelve panes'),
  achievement('mossgate.bog.shrine', 'mossgate.bogShrine', 'Drowned treasure'),
  achievement('mossgate.cairn', 'mossgate.cairn', 'Under the capstone'),
  achievement('mossgate.lore', 'mossgate.lore', 'Old words'),
];
