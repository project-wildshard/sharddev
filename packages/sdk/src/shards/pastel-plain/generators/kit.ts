import { Group, Mesh, MeshStandardMaterial } from 'three';
import { measureBox, type PastelWorldPorts } from './world';

// The authored part types this generator emits, through world.ts ports.
type Piece = Parameters<PastelWorldPorts['piece']>[0];
/** one declared collider shape, as a registry piece carries it */
export type ColliderDesc = NonNullable<Piece['colliders']>[number];
/** SF56's measure role: 1 structure (orange in the dev-map look), 2 trim (grey) */
export type MeasureRole = Parameters<typeof measureBox>[3];
type Surface = 'stone' | 'metal' | 'wood';
/** which way a ramp climbs (world axes; north is +z) */
export type Climb = '+x' | '-x' | '+z' | '-z';

/**
 * Build-time only (SHARD-PLATFORM SF52, G220): a collider-bearing set of dev-map boxes, built as one registry piece. Every
 * box is a `measureBox` (the G163 dev-map look reads its measure UVs), standing on the flattened cell ground.
 */
export class Kit {
  readonly root: Group = new Group();
  readonly colliders: ColliderDesc[] = [];
  /** every buffer and material the kit made, for the caller's scope */
  readonly owned: { dispose: () => void }[] = [];
  /** while set, boxes are named `detail`: drawn near, left out of the coarse tiles and the far proxy (`cellCoarse`) */
  detail = false;
  private mesh(w: number, h: number, d: number, role: MeasureRole): Mesh {
    const geometry = measureBox(w, h, d, role), material = new MeshStandardMaterial({ color: 0x888888, flatShading: true }), mesh = new Mesh(geometry, material);
    this.owned.push(geometry, material);
    if (this.detail) mesh.name = 'detail';
    this.root.add(mesh);
    return mesh;
  }
  /** a w (x) × h × d (z) box standing on `y0` at (x, z); `solid` adds its box collider */
  box(x: number, y0: number, z: number, w: number, h: number, d: number, role: MeasureRole, solid: boolean, surface: Surface = 'stone'): void {
    this.mesh(w, h, d, role).position.set(x, y0 + h / 2, z);
    if (solid) this.colliders.push({ kind: 'box', x, y: y0 + h / 2, z, hx: w / 2, hy: h / 2, hz: d / 2, surface });
  }
  /**
   * A rideable slab `w` wide climbing `rise` over a `run` (metres along `climb`) from `y0` at its low end, whose low end
   * starts at (x, z): a 0.3 m sloped deck with its rotated collider (the hoverboard rides up it).
   */
  ramp(x: number, y0: number, z: number, w: number, run: number, rise: number, climb: Climb, role: MeasureRole = 2, surface: Surface = 'stone'): void {
    const t = 0.3, length = Math.hypot(run, rise), angle = Math.atan2(rise, run), along = climb === '+x' || climb === '+z' ? 1 : -1, alongX = climb === '+x' || climb === '-x';
    const cx = alongX ? x + along * run / 2 : x, cz = alongX ? z : z + along * run / 2, cy = y0 + rise / 2 - (t / 2) * Math.cos(angle);
    const mesh = this.mesh(alongX ? length : w, t, alongX ? w : length, role); mesh.position.set(cx, cy, cz);
    // about z, +angle lifts the +x end; about x, +angle drops the +z end
    let q: { x: number; y: number; z: number; w: number };
    if (alongX) { const a = along * angle; mesh.rotation.z = a; q = { x: 0, y: 0, z: Math.sin(a / 2), w: Math.cos(a / 2) }; }
    else { const a = -along * angle; mesh.rotation.x = a; q = { x: Math.sin(a / 2), y: 0, z: 0, w: Math.cos(a / 2) }; }
    this.colliders.push({ kind: 'box', x: cx, y: cy, z: cz, hx: (alongX ? length : w) / 2, hy: t / 2, hz: (alongX ? w : length) / 2, rot: q, surface });
  }
}

/** an entry's edge (north is +z) */
export type Edge = 'north' | 'south' | 'east' | 'west';
/**
 * One entry's local frame: `across` is metres to the right of the road as you drive in, `inward` metres in from the edge,
 * `w` across and `d` along.
 */
export function framed(kit: Kit, edge: Edge): (across: number, y0: number, inward: number, w: number, h: number, d: number, role: MeasureRole, solid: boolean, surface?: Surface) => void {
  return (across, y0, inward, w, h, d, role, solid, surface) => {
    switch (edge) {
      case 'north': kit.box(-across, y0, 250 - inward, w, h, d, role, solid, surface); return;
      case 'south': kit.box(across, y0, -250 + inward, w, h, d, role, solid, surface); return;
      case 'east': kit.box(250 - inward, y0, across, d, h, w, role, solid, surface); return;
      case 'west': kit.box(-250 + inward, y0, -across, d, h, w, role, solid, surface); return;
      default: throw new Error('cell: unknown edge');
    }
  };
}
