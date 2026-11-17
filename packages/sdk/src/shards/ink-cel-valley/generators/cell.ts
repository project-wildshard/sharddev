import { Box3, Group, Matrix4, Mesh, MeshStandardMaterial, type Object3D } from 'three';
import { measureBox, type InkWorldPorts } from './world';
import { Kit, framed, type ColliderDesc, type MeasureRole } from './kit';
import { billboardRow, blockDistrict, copyPlots, crateYard, entryExtras, hangars, overpass, scaffoldYard, stripFill, testCourse, ziggurat } from './districts';

type Piece = Parameters<InkWorldPorts['piece']>[0];

/**
 * Build-time only (SHARD-PLATFORM SF52, G220): Template 1 fills its 500 m cell, so arriving from any entry is never a long
 * empty ride to a tiny centre. Four roads run from the entry sockets (the platform's 8 × 15 m asphalt at each edge
 * midpoint) to a square loop road around the original yard (the hub), each entry has its own set piece just inside its
 * socket, and the hub's four corners outside the loop carry a cluster each (the tower landmark, a block, the yard sheds,
 * the market arcade). Everything is dev-map boxes (`measureBox`: structures orange, trim grey) on ground the terrain
 * flattens to y = 0 (`cellGround`), so the hoverboard rides the terrain under the roads and the visual road is a 5 cm
 * slab; the sockets themselves stay clear (validate's SF8c footprint check). Pass 2 (districts.ts) fills the plane between the
 * roads: four corner districts, four side-strip districts, a second set piece at each entry and four copy plots.
 */

/** the loop road's centreline half-size (m): a square around the yard, clear of the hut, the cubes and the pool */
export const LOOP = 60;
/** asphalt width and edge-stripe width (m); the asphalt matches the 8 m entry */
const ASPHALT = 8, STRIPE = 0.5, HALF = ASPHALT / 2 + STRIPE;
/** a road's visual top above the flattened ground (m), and how deep its slab reaches */
const TOP = 0.05, SLAB = 0.3;
/** where a spoke road ends: just short of the 15 m socket */
const SPOKE_END = 234.5;
/** the hub clusters' centres */
const QUADRANTS: readonly (readonly [number, number])[] = [[-88, -88], [88, -88], [88, 88], [-88, 88]];

const smooth = (edge0: number, edge1: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0))); return t * t * (3 - 2 * t); };

/**
 * The terrain finish (generators/terrain.ts and the props bake share it): everything outside the yard (the loop, the
 * roads, the entry plazas, the hub corners and pass 2's districts) is levelled to y = 0, blending back to the authored
 * noise over a few metres just inside the loop. The yard inside the loop is untouched.
 */
export function cellGround(x: number, z: number, h: number): number {
  return h * (1 - smooth(LOOP - HALF - 9, LOOP - HALF - 2, Math.max(Math.abs(x), Math.abs(z))));
}

/** The roads: four spokes from the sockets to the loop and the square loop around the yard (visual slabs, no colliders). */
function roads(): Kit {
  const kit = new Kit(), y0 = TOP - SLAB;
  // a straight run along x (alongX) or z, split into ≤ 30 m pieces so each top face carries its "8×30" label
  const run = (alongX: boolean, fixed: number, from: number, to: number, bands: readonly ('stripe-' | 'asphalt' | 'stripe+')[]): void => {
    for (let a = from; a < to - 1e-6;) {
      const len = Math.min(30, to - a), mid = a + len / 2;
      for (const band of bands) {
        const offset = band === 'asphalt' ? 0 : (band === 'stripe-' ? -1 : 1) * (ASPHALT + STRIPE) / 2, width = band === 'asphalt' ? ASPHALT : STRIPE, role: MeasureRole = band === 'asphalt' ? 2 : 1;
        kit.detail = band !== 'asphalt';
        if (alongX) kit.box(mid, y0, fixed + offset, len, SLAB, width, role, false); else kit.box(fixed + offset, y0, mid, width, SLAB, len, role, false);
      }
      a += len;
    }
  };
  const all = ['stripe-', 'asphalt', 'stripe+'] as const;
  for (const sign of [-1, 1]) {
    // spokes, from the loop's outer edge to the socket
    const lo = LOOP + HALF, hi = SPOKE_END;
    if (sign > 0) { run(false, 0, lo, hi, all); run(true, 0, lo, hi, all); } else { run(false, 0, -hi, -lo, all); run(true, 0, -hi, -lo, all); }
    // the loop's two sides at ±LOOP on each axis; the outer stripe opens where the spoke joins
    for (const alongX of [true, false]) {
      const fixed = sign * LOOP, outer = sign > 0 ? 'stripe+' : 'stripe-', inner = sign > 0 ? 'stripe-' : 'stripe+';
      run(alongX, fixed, -LOOP + HALF, LOOP - HALF, ['asphalt', inner]);
      run(alongX, fixed, -LOOP + HALF, -HALF, [outer]);
      run(alongX, fixed, HALF, LOOP - HALF, [outer]);
      run(alongX, fixed + sign * (ASPHALT + STRIPE) / 2, -HALF, HALF, ['asphalt']);
    }
  }
  // the loop's corners: a full-width square each, trimmed by stripes on its two outer sides
  for (const cx of [-LOOP, LOOP]) for (const cz of [-LOOP, LOOP]) {
    const sx = Math.sign(cx), sz = Math.sign(cz);
    kit.detail = false; kit.box(cx - sx * STRIPE / 2, y0, cz - sz * STRIPE / 2, ASPHALT + STRIPE, SLAB, ASPHALT + STRIPE, 2, false);
    kit.detail = true;
    kit.box(cx + sx * (ASPHALT + STRIPE) / 2, y0, cz, STRIPE, SLAB, 2 * HALF, 1, false);
    kit.box(cx - sx * STRIPE / 2, y0, cz + sz * (ASPHALT + STRIPE) / 2, ASPHALT + STRIPE, SLAB, STRIPE, 1, false);
  }
  return kit;
}

/** North: the gate. A 12 m orange arch over the road with flanking walls and a gatehouse booth. */
function northGate(): Kit {
  const kit = new Kit(), b = framed(kit, 'north');
  for (const side of [-1, 1]) {
    b(side * 7, 0, 22, 3, 12, 3, 1, true);
    b(side * 18.5, 0, 22, 20, 4, 1, 1, true);
    b(side * 18.5, 4, 22, 20, 0.5, 1.5, 2, false);
    b(side * 29, 0, 22, 1.5, 6, 1.5, 2, true);
  }
  b(0, 12, 22, 17, 2.5, 3.5, 1, false);
  b(0, 14.5, 22, 18, 0.5, 4, 2, false);
  // the booth on the right as you arrive, and a low island of barriers before the arch
  b(11, 0, 32, 4, 3, 4, 1, true); b(11, 3, 32, 5, 0.3, 5, 2, false);
  for (const across of [-6.5, 6.5]) for (const inward of [10, 14]) b(across, 0, inward, 1, 1, 2, 2, true);
  return kit;
}

/** South: the container yard. Stacks of containers either side and a gantry crane spanning the road. */
function southYard(): Kit {
  const kit = new Kit(), b = framed(kit, 'south');
  for (const side of [-1, 1]) {
    // the gantry's legs and its beam over the road
    b(side * 9, 0, 28, 1.5, 11, 1.5, 2, true, 'metal'); b(side * 9, 0, 36, 1.5, 11, 1.5, 2, true, 'metal');
    b(side * 9, 11, 32, 1.5, 1.5, 9.5, 2, false);
    // container stacks: rows of 6 m boxes, one, two or three high
    const rows: readonly (readonly [number, number, number])[] = [[16, 10, 2], [16, 18, 3], [16, 26, 1], [24, 12, 1], [24, 20, 2], [24, 40, 2], [16, 44, 1]];
    for (const [across, inward, high] of rows) for (let k = 0; k < high; k++) b(side * across, k * 2.5, inward + (k % 2) * 0.5, 2.5, 2.5, 6, k % 2 === 0 ? 1 : 2, true, 'metal');
  }
  b(0, 12.5, 32, 21, 1.5, 2, 1, false);
  b(0, 9, 32, 3, 3.5, 3, 2, false);
  return kit;
}

/** East: the signal mast. A 30 m lattice-banded mast, its control hut and barrier blocks lining the arrival. */
function eastMast(): Kit {
  const kit = new Kit(), b = framed(kit, 'east');
  b(-16, 0, 30, 6, 1, 6, 2, true);
  b(-16, 1, 30, 3, 29, 3, 1, true);
  for (let k = 0; k < 5; k++) b(-16, 5 + k * 6, 30, 4.5, 0.5, 4.5, 2, false);
  b(-16, 30, 30, 1, 4, 1, 2, false);
  b(14, 0, 34, 8, 5, 10, 1, true); b(14, 5, 34, 9, 0.5, 11, 2, false); b(14, 5.5, 37, 2, 2, 2, 2, false);
  for (const side of [-1, 1]) for (let k = 0; k < 6; k++) b(side * 6, 0, 8 + k * 4, 0.6, 0.9, 2, 2, true);
  b(-16, 0, 16, 10, 0.5, 10, 2, true);
  return kit;
}

/** West: the covered drive. A 27 m roofed colonnade over the road, with a raised walkway either side. */
function westHall(): Kit {
  // nothing overhangs the socket: the roof starts 16 m in (validate refuses anything above the road in the 8 × 15 m)
  const kit = new Kit(), b = framed(kit, 'west');
  for (const side of [-1, 1]) {
    for (let k = 0; k < 6; k++) b(side * 6.5, 0, 17 + k * 5, 1, 7, 1, 1, true);
    b(side * 9.5, 0, 29.5, 4, 0.5, 30, 2, true);
    b(side * 11.5, 0.5, 29.5, 0.5, 1, 30, 2, true);
  }
  b(0, 7, 29.5, 15, 0.5, 27, 2, false);
  for (let k = 0; k < 6; k++) b(0, 7.5, 17 + k * 5, 15, 1, 0.8, 1, false);
  b(0, 8.5, 29.5, 4, 1.5, 4, 1, false);
  return kit;
}

/** The hub's four corners outside the loop: the tower landmark, an office block, the sheds and the market arcade. */
function hub(): Kit {
  const kit = new Kit(), [sw, se, ne, nw] = QUADRANTS;
  if (sw === undefined || se === undefined || ne === undefined || nw === undefined) throw new Error('cell: four hub corners');
  // south-west: the tower, seen from every entry
  kit.box(sw[0], 0, sw[1], 10, 1, 10, 2, true);
  kit.box(sw[0], 1, sw[1], 6, 32, 6, 1, true);
  for (let k = 0; k < 4; k++) kit.box(sw[0], 8 + k * 8, sw[1], 7, 0.6, 7, 2, false);
  kit.box(sw[0], 33, sw[1], 4, 3, 4, 2, false);
  kit.box(sw[0] + 12, 0, sw[1] + 6, 8, 4, 6, 1, true);
  // south-east: the office block and its annex
  kit.box(se[0] - 2, 0, se[1], 14, 12, 10, 1, true); kit.box(se[0] - 2, 12, se[1], 15, 0.5, 11, 2, false);
  kit.box(se[0] + 10, 0, se[1] + 8, 8, 6, 8, 1, true); kit.box(se[0] + 10, 6, se[1] + 8, 9, 0.5, 9, 2, false);
  // north-east: three sheds and a water tank on legs
  for (const [dx, dz] of [[-10, -6], [0, -6], [10, -6]] as const) { kit.box(ne[0] + dx, 0, ne[1] + dz, 7, 4, 9, 1, true); kit.box(ne[0] + dx, 4, ne[1] + dz, 8, 0.5, 10, 2, false); }
  for (const [dx, dz] of [[-2, 8], [2, 8], [-2, 12], [2, 12]] as const) kit.box(ne[0] + dx, 0, ne[1] + dz, 0.5, 8, 0.5, 2, true);
  kit.box(ne[0], 8, ne[1] + 10, 6, 4, 6, 1, false);
  // north-west: the market arcade, a roof on columns over a stall row
  for (let i = 0; i < 4; i++) for (const dz of [-6, 6]) kit.box(nw[0] - 12 + i * 8, 0, nw[1] + dz, 0.8, 5, 0.8, 1, true);
  kit.box(nw[0], 5, nw[1], 26, 0.5, 14, 2, false);
  for (let i = 0; i < 3; i++) kit.box(nw[0] - 8 + i * 8, 0, nw[1], 3, 1.2, 2, 2, true);
  return kit;
}

/** The lamp posts along every spoke, both sides every 20 m: one instanced model, its transforms and its colliders. */
export function cellPosts(): { model: Group; transforms: Matrix4[]; colliders: ColliderDesc[]; owned: { dispose: () => void }[] } {
  const model = new Group(), owned = [measureBox(0.3, 5, 0.3, 2), measureBox(1.5, 0.3, 0.4, 1), new MeshStandardMaterial({ color: 0x888888, flatShading: true })] as const;
  const post = new Mesh(owned[0], owned[2]); post.position.y = 2.5;
  const head = new Mesh(owned[1], owned[2]); head.position.set(-0.6, 5, 0);
  model.add(post, head);
  const transforms: Matrix4[] = [], colliders: ColliderDesc[] = [], offset = HALF + 1.5;
  for (let a = LOOP + 20; a <= 200; a += 20) for (const side of [-1, 1]) for (const [x, z] of [[side * offset, a], [side * offset, -a], [a, side * offset], [-a, side * offset]] as const) {
    // the arm leans over the road: a quarter turn per side
    const yaw = Math.abs(x) < Math.abs(z) ? (x > 0 ? 0 : Math.PI) : (z > 0 ? Math.PI / 2 : -Math.PI / 2);
    transforms.push(new Matrix4().makeRotationY(yaw).setPosition(x, 0, z));
    colliders.push({ kind: 'box', x, y: 2.5, z, hx: 0.15, hy: 2.5, hz: 0.15, surface: 'metal' });
  }
  return { model, transforms, colliders, owned: [...owned] };
}

/** A copy of `object` without its `detail` boxes (the road stripes): the coarse tiles' and the far proxy's version. */
export function cellCoarse(object: Object3D): Object3D {
  const copy = object.clone(), drop: Object3D[] = [];
  copy.traverse((node) => { if (node.name === 'detail') drop.push(node); });
  for (const node of drop) node.removeFromParent();
  return copy;
}

/** G220 pass 2's districts, entry extras and copy plots (districts.ts): id, name, builder */
const DISTRICTS: readonly (readonly [string, string, () => Kit])[] = [
  ['ink.district.course', 'Hover test course', testCourse], ['ink.district.blocks', 'Block district', blockDistrict],
  ['ink.district.ziggurat', 'Ziggurat', ziggurat], ['ink.district.overpass', 'Overpass', overpass],
  ['ink.district.scaffold', 'Scaffold yard', scaffoldYard], ['ink.district.billboards', 'Billboard row', billboardRow],
  ['ink.district.hangars', 'Hangars', hangars], ['ink.district.crates', 'Crate yard', crateYard],
  ['ink.district.strips', 'Strip fill', stripFill], ['ink.district.plots', 'Copy plots', copyPlots],
  ['ink.entry.extras', 'Entry extras', entryExtras],
];
/** every cell-fill piece the bake draws whole near and coarse far (templatePropsSource.ts) */
export const CELL_PIECES: readonly string[] = ['ink.roads', 'ink.hub', 'ink.entry.north', 'ink.entry.south', 'ink.entry.east', 'ink.entry.west', ...DISTRICTS.map(([id]) => id)];

/**
 * The far proxy's version of `object` (8,000 triangles for the whole cell): the coarse copy without the small boxes, so
 * only what reads from the next cell stays (blocks, towers, decks, the big pads; no crates, posts or trim strips).
 */
export function cellFar(object: Object3D): Object3D {
  const copy = cellCoarse(object), drop: Object3D[] = [];
  copy.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    const box = new Box3().setFromObject(node);
    const w = box.max.x - box.min.x, h = box.max.y - box.min.y, d = box.max.z - box.min.z;
    if (Math.max(w, d) < 10 && h < 6) drop.push(node);
  });
  for (const node of drop) node.removeFromParent();
  return copy;
}

/** Register the cell's roads, entry set pieces, hub and posts under `root`, each a registry piece. */
export function buildCellFill(ctx: Pick<InkWorldPorts, 'root' | 'scope' | 'piece'>): { posts: { model: Group; transforms: Matrix4[] } } {
  const file = 'src/shards/ink-cel-valley/generators/cell.ts';
  const add = (id: string, name: string, category: Piece['category'], kit: Kit): void => {
    ctx.root.add(kit.root); for (const resource of kit.owned) ctx.scope.own(resource);
    ctx.piece({ id, name, category, file, object: kit.root, ...(kit.colliders.length === 0 ? {} : { colliders: kit.colliders }), surface: 'stone' });
  };
  add('ink.roads', 'Roads and loop', 'ground', roads());
  add('ink.hub', 'Hub corners', 'buildings', hub());
  add('ink.entry.north', 'North gate', 'buildings', northGate());
  add('ink.entry.south', 'South container yard', 'buildings', southYard());
  add('ink.entry.east', 'East signal mast', 'buildings', eastMast());
  add('ink.entry.west', 'West covered drive', 'buildings', westHall());
  for (const [id, name, kit] of DISTRICTS) add(id, name, 'buildings', kit());
  const posts = cellPosts(), shown = new Group();
  for (const matrix of posts.transforms) { const lamp = posts.model.clone(); lamp.applyMatrix4(matrix); shown.add(lamp); }
  ctx.root.add(shown); for (const resource of posts.owned) ctx.scope.own(resource); ctx.piece({ id: 'ink.posts', name: 'Lamp posts', category: 'props', file, object: shown, colliders: posts.colliders, surface: 'metal' });
  return { posts: { model: posts.model, transforms: posts.transforms } };
}
