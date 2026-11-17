import { WebIO, type Document, type Node } from '@gltf-transform/core';
import { ALL_EXTENSIONS, type InstancedMesh } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { Matrix4, Quaternion, Vector3, type BufferGeometry } from 'three';
import type { TerrainTileData } from '@wildshard/format/terrainTileBytes';
import type { MapPaletteRow } from '@wildshard/format/minimap';

/** Complete source-owned paint bands and ordered overlays before runtime map installation. */
export type AuthorMapPalette = MapPaletteRow;

const identity = new Matrix4();
const byte = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));
const srgb = (value: number): number => byte(255 * (value <= .0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - .055));
function at<T>(values: ArrayLike<T>, index: number): T {
  const value = values[index]; if (value === undefined) throw new Error('Incomplete map geometry'); return value;
}
type Pair = readonly [number, number];
type Triple = readonly [number, number, number];
const triple = (values: ArrayLike<number>): Triple => [at(values, 0), at(values, 1), at(values, 2)];

class ByteMapIO extends WebIO {
  protected override readURI(uri: string, _type: 'view' | 'text'): Promise<never> {
    return Promise.reject(new Error(`Map geometry must be self-contained: ${uri}`));
  }
}
/** The same 500 m frame as the runtime map: +Z north, -X east. */
export function mapPixel(x: number, z: number, size = 1000): Pair { return [(250 - x) * size / 500, (250 - z) * size / 500]; }
/** Explicit byte resolution for retained file adapters; owned inputs need no reader. */
export type MapGeometryReader = (file: string) => Uint8Array;
/** Build-only projection of actual terrain, geometry and self-contained GLBs.
 * No filesystem is reachable here; optional file identities resolve only through the caller's explicit reader. */
export class MapRaster {
  readonly height: Int32Array;
  readonly colour: Uint8Array;
  triangles = 0;
  private readonly documents = new Map<string | Uint8Array, Document>();
  readonly size: number;
  readonly clip: { clipBelow?: number; clipAbove?: number };
  private readonly read: MapGeometryReader | undefined;
  constructor(size = 1000, clip: { clipBelow?: number; clipAbove?: number } = {}, read?: MapGeometryReader) {
    this.size = size; this.clip = clip; this.read = read;
    this.height = new Int32Array(size * size).fill(-2147483648);
    this.colour = new Uint8Array(size * size * 3);
  }
  /** Integer subpixel inclusion and post-interpolation height/colour quantization retain the original raster. */
  triangle(points: readonly (readonly number[])[], colours: readonly (readonly number[])[]): void {
    this.projectedTriangle(points, colours, false);
  }
  /** Projection depends only on the transformed vertex, so indexed faces share it. */
  private project(x: number, y: number, z: number): Triple {
    return [Math.round(((250 - x) * this.size / 500) * 1024), y,
      Math.round(((250 - z) * this.size / 500) * 1024)];
  }
  private projectedTriangle(points: readonly (readonly number[])[], colours: readonly (readonly number[])[], projected = true): void {
    this.triangles++;
    const p0 = at(points, 0), p1 = at(points, 1), p2 = at(points, 2);
    const x0 = projected ? at(p0, 0) : Math.round(((250 - at(p0, 0)) * this.size / 500) * 1024);
    const y0 = projected ? at(p0, 2) : Math.round(((250 - at(p0, 2)) * this.size / 500) * 1024);
    const x1 = projected ? at(p1, 0) : Math.round(((250 - at(p1, 0)) * this.size / 500) * 1024);
    const y1 = projected ? at(p1, 2) : Math.round(((250 - at(p1, 2)) * this.size / 500) * 1024);
    const x2 = projected ? at(p2, 0) : Math.round(((250 - at(p2, 0)) * this.size / 500) * 1024);
    const y2 = projected ? at(p2, 2) : Math.round(((250 - at(p2, 2)) * this.size / 500) * 1024);
    const area = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
    if (area === 0) return;
    const lowX = Math.min(x0, x1, x2), highX = Math.max(x0, x1, x2);
    const lowY = Math.min(y0, y1, y2), highY = Math.max(y0, y1, y2);
    // Internal projections are integer subpixels. In this bounded range all
    // edge products are exact integers, and the retained 1e-12 edge allowance
    // spans less than one subpixel. A centre outside this box cannot pass.
    // Public triangle inputs and wider projections keep the original range.
    const bounded = projected && lowX >= -1048576 && highX <= 1048576
      && lowY >= -1048576 && highY <= 1048576;
    const minX = Math.max(0, bounded ? Math.ceil((lowX - 512) / 1024) : Math.floor(lowX / 1024));
    const maxX = Math.min(this.size - 1, bounded ? Math.floor((highX - 512) / 1024) : Math.ceil(highX / 1024));
    const minY = Math.max(0, bounded ? Math.ceil((lowY - 512) / 1024) : Math.floor(lowY / 1024));
    const maxY = Math.min(this.size - 1, bounded ? Math.floor((highY - 512) / 1024) : Math.ceil(highY / 1024));
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const sx = x * 1024 + 512, sy = y * 1024 + 512;
      const a = ((x2 - x1) * (sy - y1) - (y2 - y1) * (sx - x1)) / area,
        b = ((x0 - x2) * (sy - y2) - (y0 - y2) * (sx - x2)) / area, c = 1 - a - b;
      if (a < 0 || b < 0 || c < -1e-12) continue;
      const h = a * at(p0, 1) + b * at(p1, 1) + c * at(p2, 1);
      if (h < (this.clip.clipBelow ?? -Infinity) || h > (this.clip.clipAbove ?? Infinity)) continue;
      const offset = y * this.size + x, fixed = Math.round(h * 65536);
      if (fixed <= at(this.height, offset)) continue;
      this.height[offset] = fixed;
      for (let k = 0; k < 3; k++) this.colour[offset * 3 + k] = byte(a * at(at(colours, 0), k) + b * at(at(colours, 1), k) + c * at(at(colours, 2), k));
    }
  }
  /** Original row-major rendered lattice, including vertex ground colours. */
  terrain(tile: TerrainTileData): void {
    const r = tile.resolution, offset = (x: number, z: number): number => z * r + x;
    const point = (x: number, z: number): Triple => [tile.x + x * tile.size / (r - 1), at(tile.heights, offset(x, z)), tile.z + z * tile.size / (r - 1)];
    const colour = (x: number, z: number): Triple => triple([0, 1, 2].map(k => srgb(tile.colours?.[offset(x, z) * 3 + k] ?? .5)));
    for (let z = 0; z < r - 1; z++) for (let x = 0; x < r - 1; x++) {
      for (const indices of [[[x, z], [x, z + 1], [x + 1, z]], [[x + 1, z + 1], [x + 1, z], [x, z + 1]]] as const)
        this.triangle(indices.map(q => point(...q)), indices.map(q => colour(...q)));
    }
  }
  /** Decode once per input identity; string identities cannot acquire implicit file access. */
  async document(file: string | Uint8Array): Promise<Document> {
    await MeshoptDecoder.ready;
    const io = new ByteMapIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
    let doc = this.documents.get(file);
    if (doc === undefined) {
      const bytes = file instanceof Uint8Array ? file : this.read?.(file);
      if (bytes === undefined) throw new Error('Map geometry needs an explicit byte reader');
      doc = await io.readBinary(bytes); this.documents.set(file, doc);
    }
    return doc;
  }
  /** Project exact source vertices and indices without resampling the geometry. */
  geometry(geometry: BufferGeometry, matrix: Matrix4 = identity): void {
    const position = geometry.getAttribute('position'), colour = geometry.getAttribute('color'), indices = geometry.getIndex();
    if (position === undefined) throw new Error('Map geometry needs positions');
    const points: Triple[] = [], colours: number[][] = [];
    for (let i = 0; i < position.count; i++) {
      const point = new Vector3().fromBufferAttribute(position, i).applyMatrix4(matrix);
      points.push(this.project(point.x, point.y, point.z));
      colours.push(colour === undefined ? [180, 180, 180] : [colour.getX(i), colour.getY(i), colour.getZ(i)].map(srgb));
    }
    const facePoints: (readonly number[])[] = [[], [], []], faceColours: number[][] = [[], [], []];
    for (let i = 0; i < (indices?.count ?? position.count); i += 3) {
      const a = indices?.getX(i) ?? i, b = indices?.getX(i + 1) ?? i + 1, c = indices?.getX(i + 2) ?? i + 2;
      facePoints[0] = at(points, a); facePoints[1] = at(points, b); facePoints[2] = at(points, c);
      faceColours[0] = at(colours, a); faceColours[1] = at(colours, b); faceColours[2] = at(colours, c);
      this.projectedTriangle(facePoints, faceColours);
    }
  }
  /** Keep native mesh order, selectors, local/world transforms and instanced placements. */
  async glb(file: string | Uint8Array, placement?: Matrix4, select?: (node: Node, index: number) => boolean, options: { local?: boolean } = {}): Promise<void> {
    const doc = await this.document(file);
    let selected = 0, meshIndex = 0;
    for (const node of doc.getRoot().listNodes()) {
      const mesh = node.getMesh(); if (mesh === null) continue;
      const index = meshIndex++; if (select !== undefined && !select(node, index)) continue;
      selected++;
      const world = new Matrix4().multiplyMatrices(placement ?? identity, options.local === true ? identity : new Matrix4().fromArray(node.getWorldMatrix()));
      const instances = options.local === true ? null : node.getExtension<InstancedMesh>('EXT_mesh_gpu_instancing');
      const translation = instances?.getAttribute('TRANSLATION'), rotation = instances?.getAttribute('ROTATION'), scale = instances?.getAttribute('SCALE');
      const count = instances === null ? 1 : instances.listAttributes()[0]?.getCount() ?? 0;
      for (let copy = 0; copy < count; copy++) {
        const matrix = world.clone();
        if (instances !== null) matrix.multiply(new Matrix4().compose(
          new Vector3().fromArray(translation?.getElement(copy, []) ?? [0, 0, 0]),
          new Quaternion().fromArray(rotation?.getElement(copy, []) ?? [0, 0, 0, 1]),
          new Vector3().fromArray(scale?.getElement(copy, []) ?? [1, 1, 1])));
        for (const primitive of mesh.listPrimitives()) {
          if (primitive.getMode() !== 4) throw new Error(`${String(file)}: map requires triangles`);
          const position = primitive.getAttribute('POSITION'), colour = primitive.getAttribute('COLOR_0'), indices = primitive.getIndices();
          if (position === null) throw new Error(`${String(file)}: missing positions`);
          const base = primitive.getMaterial()?.getBaseColorFactor() ?? [1, 1, 1, 1];
          if (base[3] === 0) continue;
          const points: Triple[] = [], colours: number[][] = [];
          for (let i = 0; i < position.getCount(); i++) {
            const point = new Vector3().fromArray(position.getElement(i, [])).applyMatrix4(matrix);
            points.push(this.project(point.x, point.y, point.z));
            const c = colour?.getElement(i, []) ?? [1, 1, 1];
            colours.push([0, 1, 2].map(k => srgb(at(base, k) * at(c, k))));
          }
          const facePoints: (readonly number[])[] = [[], [], []], faceColours: number[][] = [[], [], []];
          for (let i = 0; i < (indices?.getCount() ?? position.getCount()); i += 3) {
            const a = indices?.getScalar(i) ?? i, b = indices?.getScalar(i + 1) ?? i + 1, c = indices?.getScalar(i + 2) ?? i + 2;
            facePoints[0] = at(points, a); facePoints[1] = at(points, b); facePoints[2] = at(points, c);
            faceColours[0] = at(colours, a); faceColours[1] = at(colours, b); faceColours[2] = at(colours, c);
            this.projectedTriangle(facePoints, faceColours);
          }
        }
      }
    }
    if (selected === 0 && select !== undefined) throw new Error(`${String(file)}: missing map geometry part`);
  }
}
