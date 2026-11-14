import { DataTexture, LinearFilter, LinearMipmapLinearFilter, Mesh, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, ShapeGeometry, LinearSRGBColorSpace, type ColorRepresentation, type Group, type Object3D, type Scene, type Shape } from 'three';
import type { Rgb, ScenePost } from './description';

/**
 * AUTHORING-PARITY AP1: what an author's scene module calls besides three.js itself. Everything here runs at compile time
 * only (on the author's machine or CI), never in a player's page or on the server.
 */

/** The world a `defineShard` build function receives. `scene` is a plain three.js `Scene`: add to it as in a cleanroom. */
export interface ShardWorld {
  readonly scene: Scene;
  /** A named piece of the world, the unit `watch` swaps. Objects added to `scene` outside a part belong to part `scene`. */
  part: (name: string, build: (part: Group) => void) => Group;
  /** The ground: its height everywhere in the 500 m cell, and optionally its colour (linear RGB). */
  ground: (heightAt: (x: number, z: number) => number, options?: { colourAt?: (x: number, z: number) => Rgb }) => void;
  /** The cleanroom's composer, as numbers. */
  post: (settings: Partial<Omit<ScenePost, 'bloom'>> & { bloom?: ScenePost['bloom'] }) => void;
  /** Where a player enters. */
  spawn: (x: number, y: number, z: number, yaw?: number) => void;
}

/** Painted pixels by texture source: `clone()` shares the source, so a clone with its own `repeat` still lowers. */
/** as a canvas `ImageData` stores a value: clamped to 0..255 and rounded */
export const byte = (value: number): number => Math.min(255, Math.max(0, Math.round(value)));
const PAINTED = new WeakMap<object, { width: number; height: number; rgba: Uint8Array }>();
export const paintedPixels = (source: object): { width: number; height: number; rgba: Uint8Array } | undefined => PAINTED.get(source);

/**
 * `paint(w, h, fn)`: a texture painted per pixel, the cleanroom's `paint` without a canvas. `fn(u, v, x, y)` returns
 * `[r, g, b, a?]` in 0..255 with row 0 at the top, as a canvas draws; the texture samples as a `CanvasTexture` would
 * (sRGB, repeat, mipmapped). This is J338's procedural path: the shardfile ships the pixels, no image file is authored.
 */
export function paint(width: number, height: number, fn: (u: number, v: number, x: number, y: number) => readonly number[], options: { colourSpace?: 'srgb' | 'linear' } = {}): DataTexture {
  checkSize(width, height);
  const top = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const [r = 0, g = 0, b = 0, a = 255] = fn(x / width, y / height, x, y), i = (y * width + x) * 4;
    top[i] = byte(r); top[i + 1] = byte(g); top[i + 2] = byte(b); top[i + 3] = byte(a);
  }
  return paintedTexture(width, height, top, options);
}

/** A texture size from 1 to 4096 a side, or a refusal. */
export function checkSize(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 4096 || height > 4096) throw new Error(`paint: ${width}x${height} is not a texture size from 1 to 4096`);
}

/** RGBA8 rows top first (as a canvas holds them) as the texture a `CanvasTexture` of that canvas would be. */
export function paintedTexture(width: number, height: number, top: Uint8Array, options: { colourSpace?: 'srgb' | 'linear' } = {}): DataTexture {
  // canvas row y (top = 0) is texture row height-1-y: a CanvasTexture flips Y on upload, a DataTexture does not
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) rgba.set(top.subarray(y * width * 4, (y + 1) * width * 4), (height - 1 - y) * width * 4);
  const texture = new DataTexture(rgba, width, height);
  texture.colorSpace = options.colourSpace === 'linear' ? LinearSRGBColorSpace : SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter; texture.minFilter = LinearMipmapLinearFilter; texture.generateMipmaps = true;
  texture.needsUpdate = true;
  PAINTED.set(texture.source, { width, height, rgba });
  return texture;
}

const SOLID = new WeakSet<Object3D>();
/** `solid(mesh)`: the mesh is also a collider, its own box in its own frame. Said once, beside the mesh. */
export function solid<T extends Object3D>(object: T): T { SOLID.add(object); return object; }
export const isSolid = (object: Object3D): boolean => SOLID.has(object);

/** A water surface: an outline in the XZ plane (as `ShapeGeometry` makes it, then laid flat), a tint, a reflection. */
export class Water extends Mesh<ShapeGeometry, MeshStandardMaterial> {
  readonly tint: ColorRepresentation;
  readonly reflect: 'planar' | 'sky';
  readonly shape: Shape;
  constructor(shape: Shape, options: { tint?: ColorRepresentation; reflect?: 'planar' | 'sky'; segments?: number } = {}) {
    const material = new MeshStandardMaterial({ color: options.tint ?? '#3a3458', roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.86 });
    super(new ShapeGeometry(shape, options.segments ?? 24), material);
    this.shape = shape; this.tint = options.tint ?? '#3a3458'; this.reflect = options.reflect ?? 'planar';
    this.rotation.x = -Math.PI / 2;
    this.name = 'water';
  }
}
