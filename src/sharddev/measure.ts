import { measureUv as packMeasureUv, type MeasureRole as FormatMeasureRole } from '@wildshard/format/materialFamilies';

/**
 * `@wildshard/sharddev/measure` (SF56): the measure layer's first-UV packing for authored grey-box geometry. A generator
 * writes these UVs onto a mesh so the dev-map look draws its grid and size labels; the plain look never reads them.
 */

/** The measure layer's surface roles: 1 = structure (orange in the dev-map look), 2 = trim (grey). */
export type MeasureRole = FormatMeasureRole;

/**
 * The first-UV pair a measure-layer surface carries at one vertex: `role`, the vertex's metres across (`u`) and up
 * (`up`) its face from the face's bottom-left corner as seen from outside, and the face's size `w` × `h` (m). A face may
 * span at most 62 m; a whole or half metre size up to 31.5 m is labelled, any other size is gridded only.
 */
export function measureUv(role: MeasureRole, u: number, up: number, w: number, h: number): [number, number] {
  return packMeasureUv(role, u, up, w, h);
}
