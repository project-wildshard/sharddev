// MOSSGATE-ZONE MZ16 (J452): the Hollow's twelve places (layout.ts `PLACES`) and the roads between them. Every place is a
// region trigger raising `mossgate.place.<id>`: the region files raise their own (meadow.ts, thicket.ts, bog.ts, quarry.ts,
// ridge.ts, downs.ts); this file raises the yard's two (the Downs' are downs.ts's since MZ17). Each road (layout.ts
// `PATHS`) has a fingerpost a few metres in from either end, its arm pointing up the road and painted with the name of the
// place at the far end; each entry road has one pointing to the Hollow. The places go on the full map as the markers of
// "The lay of the Hollow" (quests.ts).
import * as THREE from 'three';
import { solid, type ShardWorld } from '@wildshard/sdk/scene/author';
import { paintCanvas } from '@wildshard/sdk/scene/canvas';
import { ENTRIES, PATHS, PLACES, type Place } from './layout';
import { groundHeight } from './world';

/** The flag a place's region trigger raises. */
export const placeFlag = (id: string): string => `mossgate.place.${id}`;
/** Every place's flag, in layout order. */
export const PLACE_FLAGS: readonly string[] = PLACES.map((p) => placeFlag(p.id));

/** The places no region file holds yet, and each trigger's radius. */
const HERE: readonly (readonly [string, number])[] = [['hollow.yard', 14], ['hollow.pond', 8]];
/** How far in from a place's centre its fingerposts stand: clear of what stands there (the den's mound, the mere's water). */
const CLEAR: Readonly<Record<string, number>> = {
  'meadow.den': 14, 'meadow.stones': 12, 'thicket.clearing': 20, 'thicket.wallow': 14, 'downs.barrow': 18, 'downs.cairn': 9,
  'bog.shrine': 14, 'bog.mere': 30, 'quarry.pit': 30, 'ridge.lookout': 14,
};
/** A path that starts at the yard starts at its edge, not its centre: a post stands this far out from that point. */
const EDGE = 4;
/** How far in from its gate an entry road's post stands (the grid's entry lane is the first 50 m). */
const ENTRY_IN = 64;
/** How far beside the road a post stands (to the right, walking away from the place it stands at). */
const ASIDE = 3;

const placeOf = (id: string): Place => {
  const found = PLACES.find((p) => p.id === id);
  if (found === undefined) throw new Error(`mossgate: no place ${id}`);
  return found;
};

/** An arm: the way it points (a yaw, 0 = +z) and the name on it. */
export interface Arm { readonly yaw: number; readonly name: string }
/** A fingerpost: where it stands and its arms, top first (roads that leave a place the same way share one post). */
export interface Fingerpost { readonly x: number; readonly z: number; readonly arms: readonly Arm[] }

/** One arm's post at `at`, `along` metres up the road toward `toward`, set aside to the right, pointing up the road. */
function post(at: readonly [number, number], toward: readonly [number, number], along: number, name: string): { x: number; z: number } & Arm {
  const dx = toward[0] - at[0], dz = toward[1] - at[1], len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len;
  // right of the way walked (north is -z, so walking +z the right hand is -x)
  return { x: at[0] + ux * along - uz * ASIDE, z: at[1] + uz * along + ux * ASIDE, yaw: Math.atan2(ux, uz), name };
}

/** Every road's two fingerposts, and one on each entry road pointing to the Hollow; arms within 1.5 m of each other share a
 *  post (MZ17: three roads leave the barrow ring by its arch), one arm per name. */
export function fingerposts(): Fingerpost[] {
  const out: ({ x: number; z: number } & Arm)[] = [];
  for (const path of PATHS) {
    const pts = path.points, first = pts[0], second = pts[1], last = pts.at(-1), before = pts.at(-2);
    if (first === undefined || second === undefined || last === undefined || before === undefined) continue;
    const fromCentre = Math.hypot(first[0] - placeOf(path.from).x, first[1] - placeOf(path.from).z) > 1;
    out.push(post(first, second, fromCentre ? EDGE : (CLEAR[path.from] ?? 10), placeOf(path.to).name));
    out.push(post(last, before, CLEAR[path.to] ?? 10, placeOf(path.from).name));
  }
  // an entry road's post stands past the grid's flat entry lane, its arm pointing on toward the yard
  for (const entry of ENTRIES) out.push(post(entry.gate, entry.to, ENTRY_IN, placeOf('hollow.yard').name));
  const posts: { x: number; z: number; arms: Arm[] }[] = [];
  for (const arm of out) {
    const near = posts.find((p) => Math.hypot(p.x - arm.x, p.z - arm.z) < 1.5);
    if (near === undefined) posts.push({ x: arm.x, z: arm.z, arms: [{ yaw: arm.yaw, name: arm.name }] });
    else if (!near.arms.some((a) => a.name === arm.name)) near.arms.push({ yaw: arm.yaw, name: arm.name });
  }
  return posts;
}

/** The painted names, one row each: cream capitals on a weathered board, one texture every arm shares. */
const ROW = 36, WIDE = 512, FONT = 26, ADVANCE = (FONT * 0.7) / 7 * 6;
/** Metres per texel along an arm, so the letters keep their shape whatever the name's length. */
const PER_METRE = ROW / 0.26;
const NAMES = [...new Set(PLACES.map((p) => p.name))];
function boards(): THREE.DataTexture {
  return paintCanvas(WIDE, ROW * NAMES.length, (ctx) => {
    NAMES.forEach((name, row) => {
      ctx.fillStyle = row % 2 === 0 ? '#5d4630' : '#594330'; ctx.fillRect(0, row * ROW, WIDE, ROW);
      ctx.fillStyle = 'rgba(232,222,198,0.95)'; ctx.font = `bold ${FONT}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(name.toUpperCase(), WIDE / 2, row * ROW + ROW / 2 + 1);
    });
  });
}

/** An arm's face: a plane whose uvs take the name's row, as wide as its letters (plus a margin). */
function face(name: string, material: THREE.Material): { mesh: THREE.Mesh; length: number } {
  const row = NAMES.indexOf(name), px = name.length * ADVANCE + 18, length = px / PER_METRE;
  const geometry = new THREE.PlaneGeometry(length, 0.26), uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  const u0 = 0.5 - px / WIDE / 2, u1 = 0.5 + px / WIDE / 2, h = ROW * NAMES.length, v0 = 1 - ((row + 1) * ROW) / h, v1 = 1 - (row * ROW) / h;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  return { mesh: new THREE.Mesh(geometry, material), length };
}

const woodM = new THREE.MeshStandardMaterial({ name: 'fingerpost-wood', color: '#6e5438', roughness: 0.9 });

/** One fingerpost: a post with a cap, and its arms out the ways they point, one under another, each name on both faces. */
function build(part: THREE.Group, f: Fingerpost, names: THREE.Material): void {
  const gy = groundHeight(f.x, f.z), top = 1.95 + Math.max(0, f.arms.length - 2) * 0.36;
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.16, top + 0.35, 0.16), woodM); pole.position.set(f.x, gy + (top + 0.35) / 2, f.z); pole.castShadow = true; part.add(pole);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.18, 4), woodM); cap.position.set(f.x, gy + top + 0.44, f.z); cap.rotation.y = Math.PI / 4; part.add(cap);
  f.arms.forEach((arm, i) => {
    // the arm runs along +z (up the road) from the post, its faces looking left and right of the road
    const y = top - i * 0.36, group = new THREE.Group(); group.position.set(f.x, gy, f.z); group.rotation.y = arm.yaw; part.add(group);
    const front = face(arm.name, names), back = face(arm.name, names), length = front.length;
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, length + 0.12), woodM); board.position.set(0, y, length / 2 + 0.02); board.castShadow = true; group.add(board);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0, 0.15, 0.26, 3), woodM); tip.rotation.set(Math.PI / 2, 0, Math.PI / 2); tip.scale.set(1, 1, 0.4); tip.position.set(0, y, length + 0.2); group.add(tip);
    front.mesh.position.set(0.035, y, length / 2 + 0.02); front.mesh.rotation.y = Math.PI / 2; group.add(front.mesh);
    back.mesh.position.set(-0.035, y, length / 2 + 0.02); back.mesh.rotation.y = -Math.PI / 2; group.add(back.mesh);
  });
  const stop = solid(new THREE.Mesh(new THREE.BoxGeometry(0.2, 2, 0.2), woodM)); stop.position.set(f.x, gy + 1, f.z); stop.visible = false; part.add(stop);
}

/** The places' remaining region triggers and every road's fingerposts. */
export function buildPlaces(world: ShardWorld): void {
  world.part('places', (part) => {
    for (const [id, radius] of HERE) {
      const p = placeOf(id), at = new THREE.Object3D(); at.position.set(p.x, groundHeight(p.x, p.z), p.z); part.add(at);
      world.trigger(placeFlag(id), at, { radius });
    }
    const names = new THREE.MeshStandardMaterial({ name: 'fingerpost-names', map: boards(), roughness: 0.85 });
    for (const f of fingerposts()) build(part, f, names);
  });
}
