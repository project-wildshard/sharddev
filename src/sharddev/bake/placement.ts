import { Euler, Matrix4, Quaternion, Vector3, type Color } from 'three';
import { parse } from 'valibot';
import { FigureRowSchema } from '@wildshard/format/figures';

/** Complete author copy pose. Numeric contacts are compiled before any live registration. */
export interface AuthorPlacement<P extends object> {
  readonly x: number; readonly y: number; readonly z: number;
  readonly yaw?: number; readonly leanX?: number; readonly leanZ?: number;
  readonly scale?: number; readonly matrix?: Matrix4;
  readonly params?: Partial<P>; readonly variant?: string;
  readonly color?: number | Color; readonly host?: number;
}

/** Authored uniform-scale model rest pose, including optional local pitch and roll. */
export interface AuthorModelPose {
  readonly x: number; readonly y: number; readonly z: number; readonly yaw: number; readonly scale: number;
  readonly pitch?: number; readonly roll?: number;
}
const modelPosition = new Vector3(), modelRotation = new Euler(), modelOrientation = new Quaternion(), modelSize = new Vector3();
/** Compile an owned YXZ model matrix with native operation and accessor order.
 * Capture all inputs before private scratch; recursive author getters cannot change the outer result. */
export function bakeModelPose(pose: AuthorModelPose): Matrix4 {
  const x = pose.x, y = pose.y, z = pose.z, pitch = pose.pitch ?? 0, yaw = pose.yaw, roll = pose.roll ?? 0,
    sx = pose.scale, sy = pose.scale, sz = pose.scale;
  return new Matrix4().compose(modelPosition.set(x, y, z),
    modelOrientation.setFromEuler(modelRotation.set(pitch, yaw, roll, 'YXZ')), modelSize.set(sx, sy, sz));
}

/** Author contact tags retain the native surface vocabulary. */
export type ContactSurface = 'sand' | 'wetSand' | 'grass' | 'rock' | 'planks' | 'stone' | 'water' |
  'wood' | 'metal' | 'flesh' | 'shell' | 'ground' | 'edge' | 'felt' | 'earth';
interface Vec3 { x: number; y: number; z: number }
interface Quat { x: number; y: number; z: number; w: number }
interface Placed extends Vec3 { yaw?: number; rot?: Quat; surface?: ContactSurface }
/** Native collision description. Typed geometry remains in memory until its binary writer runs. */
export type ColliderDesc =
  | Placed & { kind: 'box'; hx: number; hy: number; hz: number }
  | Placed & { kind: 'capsule'; halfHeight: number; radius: number }
  | Placed & { kind: 'ball'; radius: number }
  | Placed & { kind: 'hull'; points: Float32Array }
  | Placed & { kind: 'trimesh'; vertices: Float32Array; indices: Uint32Array }
  | { kind: 'treads'; from: Vec3; to: Vec3; width: number; count: number; surface?: ContactSurface };
/** Admit a complete authored figure before compiling its native anchor contacts.
 * Preserve box arithmetic, capsule fields and absent-collider behavior without constructing a live figure. */
export function figureColliderRows(input: unknown): readonly ColliderDesc[] {
  const box = parse(FigureRowSchema, input).collider;
  return box === undefined ? [] : box.kind === 'box' ? [{ kind: 'box', x: 0, y: (box.top - box.bottom) / 2,
    z: 0, hx: box.half, hy: (box.top + box.bottom) / 2, hz: box.half }] : [{ ...box, x: 0, z: 0 }];
}
/** A world-space box rotated by negative rot about +Y. */
export interface BoxSpec { x: number; z: number; hw: number; hd: number; rot: number; yTop: number; yBottom: number }
/** Compile the native authored box convention without importing a live registry. */
export function boxDesc(c: BoxSpec, surface?: ContactSurface): Extract<ColliderDesc, { kind: 'box' }> {
  return { kind: 'box', x: c.x, y: (c.yTop + c.yBottom) / 2, z: c.z, hx: c.hw, hy: Math.max(0.005, (c.yTop - c.yBottom) / 2), hz: c.hd, yaw: -c.rot, ...(surface === undefined ? {} : { surface }) };
}
/** Authored placement batching grammar; no renderer is installed. */
export type Draw = 'single' | 'merged' | 'instanced' | 'batched';

/** A ground author frame; local +Z turns about +Y by yaw, with heights owned by the caller. */
export interface YawFrame { readonly x: number; readonly z: number; readonly yaw: number }
/** Map authored local offsets to world coordinates, preserving native operation order. */
export function yawWorld(frame: YawFrame, lx: number, lz: number): [number, number] {
  const c = Math.cos(frame.yaw), s = Math.sin(frame.yaw);
  return [frame.x + lx * c + lz * s, frame.z - lx * s + lz * c];
}

/** Stable specimen identity preserves parameter insertion order and native JSON spelling. */
export function specimenKey(id: string, params: object): string { return `${id} ${JSON.stringify(params)}`; }


/** A horizontal/ramped authored deck, including the native optional tapered profile. */
export interface FloorRect {
  readonly x: number; readonly z: number; readonly hw: number; readonly hd: number; readonly y: number;
  readonly rot?: number; readonly slope?: number; readonly tilt?: number;
  readonly profile?: readonly (readonly [number, number, number])[];
}
/** Place a floor on a site's local +z axis, retaining native signed rotation and optional slope. */
export function siteFloor(rot: number, lz: number, hw: number, hd: number, y: number, slope?: number): FloorRect {
  return { x: lz * Math.sin(rot), z: lz * Math.cos(rot), hw, hd, y, rot, ...(slope === undefined ? {} : { slope }) };
}
