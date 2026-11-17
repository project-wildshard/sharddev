import { BufferGeometry, Float32BufferAttribute, Matrix4, MeshBasicMaterial } from 'three';
import { WebIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { GeometryPackWriter } from '../kit/geometryPack';

class MapModelIO extends WebIO {
  protected override readURI(uri: string, _type: 'view' | 'text'): Promise<never> {
    return Promise.reject(new Error(`Map model must be self-contained: ${uri}`));
  }
}

/** Decode one prepared mesh from owned GLB bytes, keeping its local pose unless world is explicit.
 * External resources refuse; this build-only operation has no filesystem or URL authority. */
export async function mapModelBytes(bytes: Uint8Array, slot = 0, world = false): Promise<BufferGeometry> {
  await MeshoptDecoder.ready;
  const io = new MapModelIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.readBinary(bytes);
  const node = doc.getRoot().listNodes().filter(row => row.getMesh() !== null).at(slot), mesh = node?.getMesh();
  if (mesh?.listPrimitives().length !== 1) throw new Error(`Map model needs one primitive: ${slot}`);
  const primitive = mesh.listPrimitives()[0];
  if (primitive === undefined) throw new Error(`Missing map primitive: ${slot}`);
  const geometry = new BufferGeometry();
  for (const [semantic, name] of [['POSITION', 'position'], ['COLOR_0', 'color']] as const) {
    const source = primitive.getAttribute(semantic); if (source === null) continue;
    const values: number[] = [];
    for (let i = 0; i < source.getCount(); i++) values.push(...source.getElement(i, []).slice(0, 3));
    geometry.setAttribute(name, new Float32BufferAttribute(values, 3));
  }
  const index = primitive.getIndices(); if (index !== null) {
    const values = index.getArray(); if (values === null) throw new Error('Missing map primitive indices');
    geometry.setIndex(Array.from(values));
  }
  if (world) {
    if (node === undefined) throw new Error(`Missing map model node: ${slot}`);
    geometry.applyMatrix4(new Matrix4().fromArray(node.getWorldMatrix()));
  }
  return geometry;
}

interface MapShape { name: string; geometry: BufferGeometry; material: MeshBasicMaterial }
interface MapNode {
  id: string; kind: 'mesh'; name: string; geometry: string; material: string;
  instances: number; matrices: number[];
}

/** Build-only ordered geometry and float32 placements for the existing private map scene.
 * Geometry is borrowed until the caller disposes it; packing installs no reader or publisher. */
export class MapAssembly {
  readonly shapes: MapShape[] = [];
  readonly nodes: MapNode[] = [];
  readonly inventory: Record<string, number> = {};

  /** Append one source shape and its exact rendered instance matrices, retaining insertion order. */
  add(name: string, geometry: BufferGeometry, matrices: readonly Matrix4[] = [new Matrix4()]): void {
    if (matrices.length === 0 || geometry.getAttribute('position').count === 0) return;
    const id = `part-${this.shapes.length}`;
    const material = new MeshBasicMaterial({ vertexColors: geometry.hasAttribute('color') });
    this.shapes.push({ name: id, geometry, material });
    // InstancedMesh stores float32 matrices in play; retain that same rounding.
    this.nodes.push({ id, kind: 'mesh', name, geometry: id, material: 'map', instances: matrices.length,
      matrices: matrices.flatMap(matrix => Array.from(Float32Array.from(matrix.elements))) });
    this.inventory[name] = (this.inventory[name] ?? 0) + matrices.length;
  }

  /** Return independently owned canonical scene JSON and raw packed geometry.
   * Compression and file/image publication belong to the caller's explicit adapter. */
  pack(): { json: Uint8Array; binary: Uint8Array } {
    const pack = new GeometryPackWriter('map-assembly');
    for (const shape of this.shapes) {
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', shape.geometry.getAttribute('position'));
      const source = shape.geometry.getAttribute('color'), colour = shape.material.color.toArray();
      const count = geometry.getAttribute('position').count, values = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) for (let c = 0; c < 3; c++) values[i * 3 + c] = (source?.getComponent(i, c) ?? .45) * (colour[c] ?? Number.NaN);
      geometry.setAttribute('color', new Float32BufferAttribute(values, 3)); geometry.setIndex(shape.geometry.getIndex());
      pack.add(geometry); geometry.dispose();
    }
    const binary = pack.bytes();
    const scene = { version: 1, root: 'root', nodes: [{ kind: 'group', id: 'root', children: this.nodes.map(row => row.id) }, ...this.nodes], materials: [{ id: 'map', kind: 'port', source: 'map' }] };
    const json = new TextEncoder().encode(`${JSON.stringify({ version: 1, inventory: this.inventory, pack: { ...pack.rows(), names: this.shapes.map(row => row.name) }, scene })}\n`);
    return { json, binary };
  }
}
