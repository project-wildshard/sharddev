/**
 * TEMPLATE-E2E TC-M4b: the lift and its ledge, in the yard's north-east corner. A stone ledge stands against the north wall,
 * a coin cache on top; a plank lift beside it rises to the ledge's top and comes back down, all the time, and pauses at each
 * end so a rider steps on and off. Whoever stands on its deck rides it.
 *
 * The lift is a declared mover (`template.lift`, a native `track` on an `always` trigger, ping-pong): the server steps it,
 * every page draws it as the props panel of the same id, baked here at its rest pose, and stands on its deck box (engine
 * TC-E5b). The ledge is solid from the ground up, so the cache's region (TC-M4b's quest) is reachable only from its top.
 */
import { BoxCollider } from '@wildshard/sdk/physics';
import type { PropsBakeSource } from '@wildshard/sdk/bake/props';
import { lowerMoverMotion, type MoverMotion } from '@wildshard/format/moverMotion';
import { parseMovers } from '@wildshard/format/movers';
import { Group, Mesh, MeshStandardMaterial } from 'three';
import layout from '../data/layout.json' with { type: 'json' };
import { surfaceBox } from './weather';

type Colliders = NonNullable<PropsBakeSource['colliders']>[number]['shapes'];
/** The ledge's top over the ground at its centre, and the lift deck's half size and thickness. The top stands out of reach
 *  of the best double jump (about 3.0 m) from the north wall's cap (about 1 m) beside it, so only the lift reaches the cache. */
export const LEDGE_HEIGHT = 5.2, DECK_HALF = 1.2, DECK_HALF_THICK = 0.12;
/** The lift's cycle: rest at the bottom, rise, rest at the top, then the same back (ping-pong), in seconds. */
const DWELL = 2, RISE = 4;
/** The mover's script entity: clear of the hooks' (1001, 1002) and every brain's. */
export const LIFT_ENTITY = 9101, LIFT_ID = 'template.lift';
/** Both are shadowless panels: tile 0/4/4 holds 8 draws, it had 6, and a shadow is a second draw. */
const STONE = 0x8c867a, MOSS = 0x5b7a30, WOOD = 0x86592f;

const box = (w: number, h: number, d: number, color: number): Mesh => new Mesh(surfaceBox(w, h, d), new MeshStandardMaterial({ color, flatShading: true }));

/** Where the lift rests and how far it rises: its deck's top at the ground, then at the ledge's top. */
export function liftRest(heightAt: (x: number, z: number) => number): { at: { x: number; y: number; z: number }; top: number; rise: number } {
  const { x, z } = layout.LIFT, ground = heightAt(x, z), top = heightAt(layout.LEDGE.x, layout.LEDGE.z) + LEDGE_HEIGHT;
  return { at: { x, y: ground - DECK_HALF_THICK + 0.1, z }, top, rise: top - ground - 0.1 };
}

/** The ledge (stone, solid, a moss cap and the cache on top) and its colliders. */
export function ledge(heightAt: (x: number, z: number) => number): { object: Group; colliders: Colliders; cache: [number, number, number] } {
  const { x, z, hx, hz } = layout.LEDGE, base = heightAt(x, z) - 0.4, top = heightAt(x, z) + LEDGE_HEIGHT, h = top - base;
  const object = new Group(), body = box(hx * 2, h, hz * 2, STONE); body.position.set(x, base + h / 2, z); object.add(body);
  const cap = box(hx * 2 + 0.2, 0.18, hz * 2 + 0.2, MOSS); cap.position.set(x, top - 0.05, z); object.add(cap);
  // the cache: a small wooden box with a lid, at the ledge's back edge
  const cx = x, cz = z + hz - 0.6, chest = box(0.8, 0.5, 0.5, WOOD); chest.position.set(cx, top + 0.29, cz); object.add(chest);
  const lid = box(0.84, 0.1, 0.54, WOOD); lid.position.set(cx, top + 0.59, cz); object.add(lid);
  const colliders: Colliders = [BoxCollider.fromData({ kind: 'box', x, y: base + h / 2, z, hx, hy: h / 2, hz, yaw: -0, surface: 'stone' }).toColliderData()];
  return { object, colliders, cache: [x, top, z] };
}

/** The lift's deck, baked where the mover rests: planks over two runners, with a hand rail on its south side. */
export function liftDeck(heightAt: (x: number, z: number) => number): Group {
  const { at } = liftRest(heightAt), deck = new Group(), w = DECK_HALF * 2;
  const floor = box(w, DECK_HALF_THICK * 2, w, WOOD); floor.position.set(at.x, at.y, at.z); deck.add(floor);
  for (const dx of [-0.8, 0.8]) { const rail = box(0.12, 0.1, w, WOOD); rail.position.set(at.x + dx, at.y - DECK_HALF_THICK - 0.05, at.z); deck.add(rail); }
  for (const dx of [-DECK_HALF + 0.05, DECK_HALF - 0.05]) { const post = box(0.1, 0.9, 0.1, WOOD); post.position.set(at.x + dx, at.y + 0.45, at.z - DECK_HALF + 0.05); deck.add(post); }
  const bar = box(w, 0.08, 0.08, WOOD); bar.position.set(at.x, at.y + 0.9, at.z - DECK_HALF + 0.05); deck.add(bar);
  return deck;
}

/** The lift's mover row: its deck box about its origin and the always-running ping-pong clip. */
export function liftMover(heightAt: (x: number, z: number) => number): ReturnType<typeof parseMovers>[number] {
  const { at, rise } = liftRest(heightAt), rest = { at, euler: { x: 0, y: 0, z: 0 } };
  const bottom: [number, number, number] = [at.x, at.y, at.z], top: [number, number, number] = [at.x, at.y + rise, at.z];
  const duration = DWELL + RISE + DWELL;
  const motion: MoverMotion = { driver: { kind: 'track' }, trigger: { kind: 'always' },
    track: { clip: 'lift', duration, loop: 'pingpong', speed: 1, times: [0, DWELL, DWELL + RISE, duration], position: [bottom, bottom, top, top] } };
  const [row] = parseMovers([{ id: LIFT_ID, entity: LIFT_ENTITY, kind: 'platform', ...rest, enabled: true,
    boxes: [{ x: 0, y: 0, z: 0, hx: DECK_HALF, hy: DECK_HALF_THICK, hz: DECK_HALF, rot: { x: 0, y: 0, z: 0, w: 1 } }],
    ...lowerMoverMotion(motion, rest), ...motion, execution: 'native' }]);
  if (row === undefined) throw new Error('Missing lift mover');
  return row;
}
