// MOSSGATE-ZONE MZ31 (QA 11-19 row 35, Jake in Glowfen: "I'm setting these lanterns and nothing happens. It's just so
// anticlimactic."): where the first flame's and the Lamplighter's beats land (`world.questStep`, `world.questPayoff`). Each
// brazier flares amber as it catches, with the engine's `ignite` voice; each leg of the old rite glows where it is read; the
// first flame pays off at the moss gate, and the Lamplighter's chain pays off round her: the Hollow's lanterns, which were
// never there before, light in a ring about her path (a panel on the shared flag her completion raises), with the score's
// dawn take, then the Pond Hermit's gate as the next goal.
import * as THREE from 'three';
import type { ShardWorld } from '@wildshard/sdk/scene/author';
import { fire } from '@wildshard/sdk/scene/fire';
import { groundHeight, LAYOUT } from './hollow';
import { GATE_PASS, PLAY } from './play';
import { HAUNTS } from './creatures';
import { MEADOW } from './meadow';
import { BOG } from './bog';
import { RIDGE } from './ridge';
import { QUARRYMASTER } from './quarry';

/** The shared flag the Lamplighter's completion raises, which shows the Hollow's lanterns. */
export const HOLLOW_LANTERNS = 'mossgate.hollow.lanterns';
const AMBER = '#ffa040', RITE = '#9fe0ff', GOLD = '#ffe6a8';
/** The lanterns' ring round the Lamplighter: six posts, 4.5 m out. */
const RING = { r: 4.5, posts: 6 };

/** A ground node at (x, z). */
function ground(world: ShardWorld, x: number, z: number): THREE.Object3D {
  const node = new THREE.Object3D(); node.position.set(x, groundHeight(x, z), z); world.scene.add(node); return node;
}

/** One lantern post: a dark iron pole, a hanging cage and a flame in it, its light pooled on the grass. */
function lanternPost(into: THREE.Group, x: number, z: number, seed: number): void {
  const gy = groundHeight(x, z), iron = new THREE.MeshStandardMaterial({ color: '#2b2622', roughness: 0.6, metalness: 0.4 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.6, 8), iron); pole.position.set(x, gy + 1.3, z); into.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.06), iron); arm.position.set(x + 0.22, gy + 2.55, z); into.add(arm);
  const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.36, 6, 1, true), new THREE.MeshStandardMaterial({ color: '#ffd28a', emissive: '#ffb050', emissiveIntensity: 2.2, transparent: true, opacity: 0.75, side: THREE.DoubleSide }));
  cage.position.set(x + 0.42, gy + 2.3, z); into.add(cage);
  const flame = fire({ size: 0.28, seed }); flame.position.set(x + 0.42, gy + 2.18, z); into.add(flame);
  for (const [r, opacity] of [[2.6, 0.12], [1.5, 0.2]] as const) {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 24), new THREE.MeshStandardMaterial({ color: '#ffb050', emissive: '#ffb050', emissiveIntensity: 1.2, transparent: true, opacity, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.set(x + 0.3, gy + 0.03, z); into.add(disc);
  }
}

/** The beats, and the lanterns the Lamplighter's payoff reveals. */
export function buildLandings(world: ShardWorld): void {
  for (const [x, z, letter] of LAYOUT.BRAZIERS) {
    const step = letter.toLowerCase();
    world.questStep('mossgate.lamplighter', step, ground(world, x, z), { colour: AMBER, radius: 7, sound: 'ignite' });
    if (letter === 'A') world.questStep('mossgate.first-light', 'a', ground(world, x, z), { colour: AMBER, radius: 7, sound: 'ignite' });
  }
  world.questStep('mossgate.first-light', 'gate', ground(world, GATE_PASS.x, GATE_PASS.z), { colour: AMBER, radius: 5, sound: 'grate' });
  world.questPayoff('mossgate.first-light', ground(world, GATE_PASS.x, GATE_PASS.z), { colour: AMBER, radius: 10, sound: 'glyph', next: 'Find the Lamplighter on the path north of spawn' });
  // the old rite, each leg where it is read
  const rite: [string, { x: number; z: number }, 'chime' | 'glyph' | 'ignite'][] = [['hermit', PLAY.HERMIT, 'chime'], ['stones', MEADOW.STONES, 'glyph'],
    ['shrine', BOG.SHRINE, 'glyph'], ['beacon', RIDGE.LOOKOUT, 'ignite'], ['quarrymaster', QUARRYMASTER, 'chime'], ['warden', HAUNTS.WARDEN, 'glyph'],
    ['report', LAYOUT.LAMPLIGHTER, 'chime']];
  for (const [step, { x, z }, sound] of rite) world.questStep('mossgate.lamplighter', step, ground(world, x, z), { colour: step === 'beacon' ? AMBER : RITE, radius: step === 'warden' ? 12 : 6, sound });
  const { x: lx, z: lz } = LAYOUT.LAMPLIGHTER;
  world.questPayoff('mossgate.lamplighter', ground(world, lx, lz), { colour: GOLD, radius: 16, sound: 'glyph', reveal: HOLLOW_LANTERNS, next: 'Ask the Pond Hermit about the north gate' });
  world.part('hollow-lanterns', (part) => {
    for (let i = 0; i < RING.posts; i++) {
      const a = (i / RING.posts) * Math.PI * 2 + 0.3;
      lanternPost(part, lx + Math.cos(a) * RING.r, lz + Math.sin(a) * RING.r, 11 + i * 7);
    }
  }, { panel: 'mossgate.hollow-lanterns', shownWhen: { field: HOLLOW_LANTERNS, equals: true } });
}
