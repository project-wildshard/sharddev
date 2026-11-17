// Build-only rest assembly of admitted model, private-scene and frozen-weld data.
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { readBakedGeometry } from '../src/sharddev/kit/bakedGeometry.ts';
import { _applyChunkConstants } from '@wildshard/engine/core/config';
import { configureLevel } from '@wildshard/engine/level/selection';
import { placeForest } from '@wildshard/engine/world/forest/placement';

import { BufferGeometry, Euler, Float32BufferAttribute, Matrix4, Quaternion, Vector3 } from 'three';
import { MapRaster } from '../src/sharddev/bake/mapRaster.ts';
import { readMapGeometry } from '@wildshard/engine/scripts/map-painter.mjs';
import { mapModel, readMapJson } from './map-geometry.mjs';

export const mapPose = pose => pose.matrix === undefined ? new Matrix4().compose(new Vector3(pose.x, pose.y, pose.z),
  new Quaternion().setFromEuler(new Euler(pose.yxz.pitch ?? 0, pose.yxz.yawAtan2 === undefined ? pose.yxz.yaw : Math.atan2(...pose.yxz.yawAtan2), pose.yxz.roll ?? 0, 'YXZ')),
  new Vector3().setScalar(pose.yxz.scale)) : new Matrix4().fromArray(pose.matrix);
const words = (values, wide = false) => wide ? new Float64Array(Uint32Array.from(values).buffer) : new Float32Array(Uint32Array.from(values).buffer);
const localMatrix = node => node.transformBits !== undefined && node.matrixAutoUpdate !== false ? (() => {
  const f = words(node.transformBits, true);
  return new Matrix4().compose(new Vector3().fromArray(f), new Quaternion().fromArray(f, 3), new Vector3().fromArray(f, 7));
})() : node.matrixBits === undefined ? new Matrix4() : new Matrix4().fromArray(words(node.matrixBits, true));

export class MapWorld {
  constructor(assembly, base, section, catalogue, blobs) {
    this.assembly = assembly; this.base = base; this.section = section; this.catalogue = catalogue;
    this.files = new Map(blobs.map(row => row.file === undefined ? [row.name, resolve(base, row.source)] : [row.file.name, (row.file.kind ?? 'json') === 'json' ? JSON.parse(new TextDecoder().decode(row.bytes)) : row.bytes]));
    this.geometry = new Map(); this.frames = new Map();
  }
  json(file) { const source = this.files.get(file); if (source === undefined || source instanceof Uint8Array) throw new Error(`Missing map world JSON ${file}`); return typeof source === 'string' ? readMapJson(source) : source; }
  /** A scene part's instance matrices: an instanceMatrix row (inline or a float32 product packet), else the recipe's. */
  matrices(step, id, node) {
    const row = (step.instanceAttributes ?? []).find(entry => entry.part === id && entry.target === 'instanceMatrix');
    if (row === undefined) return node.matrices; if (row.values !== undefined) return row.values;
    const bytes = this.files.get(row.packet.file); if (!(bytes instanceof Uint8Array)) throw new Error(`Missing map world packet ${row.packet.file}`);
    return new Float32Array(bytes.buffer.slice(bytes.byteOffset + row.packet.byteOffset, bytes.byteOffset + row.packet.byteOffset + row.packet.count * 64));
  }
  async shape(ref) {
    const key = `${ref.library}/${ref.model}`;
    let geometry = this.geometry.get(key);
    if (geometry !== undefined) return geometry.clone();
    const library = this.section.libraries.find(row => row.id === ref.library);
    const model = library?.models.find(row => row.id === ref.model), file = this.files.get(typeof model?.file === 'string' ? model.file : model?.file?.desktop);
    if (typeof file !== 'string' && !(file instanceof Uint8Array)) throw new Error(`Missing map world geometry ${key}`);
    geometry = await mapModel(file); this.geometry.set(key, geometry); return geometry.clone();
  }
  ghost(id, locals = []) {
    if (id === '$shadow') return true;
    const material = locals.find(row => row.id === id) ?? this.section.materials.find(row => row.id === id);
    return material?.properties?.depthWrite === false || material?.properties?.colorWrite === false;
  }
  async placement(row) {
    if (row.drawnInto !== undefined) return;
    const model = this.catalogue.models.find(entry => entry.key === row.model);
    if (model === undefined) throw new Error(`Missing map world model ${row.model}`);
    const groups = new Map();
    for (const pose of row.poses) {
      const variant = (model.variants ?? []).find(entry => entry.id === pose.variant);
      const params = { ...model.defaults, ...variant?.params, ...pose.params };
      const choice = model.choices.find(entry => Object.entries(entry.params).every(([key, value]) => JSON.stringify(params[key]) === JSON.stringify(value)));
      if (choice === undefined) throw new Error(`Missing map choice ${row.id}`);
      if (choice.scene !== undefined) throw new Error(`Placed frozen scene needs an explicit map rest graph: ${row.id}`);
      const matrices = groups.get(choice) ?? []; matrices.push(mapPose(pose)); groups.set(choice, matrices);
    }
    for (const [choice, matrices] of groups) for (const draw of choice.draws) {
      if (draw.depthOnly === true || this.ghost(draw.material)) continue;
      this.assembly.add(`place:${row.id}:${draw.id}`, await this.shape(draw), matrices);
    }
  }
  async batch(row) {
    for (const [i, copy] of row.fixed.entries()) this.assembly.add(`batch:${row.id}:${i}`, await this.shape(row.geometry[copy.lod0]), [new Matrix4().fromArray(copy.matrix)]);
  }
  async weld(graph) {
    const frames = new Map([[graph.root, this.frames.get(graph.root) ?? new Matrix4()]]), visible = new Map([[graph.root, true]]);
    for (const node of graph.nodes) {
      const parent = frames.get(node.parent) ?? this.frames.get(node.parent);
      if (parent === undefined) throw new Error(`Missing map weld parent ${node.parent}`);
      const matrix = new Matrix4().multiplyMatrices(parent, localMatrix(node)); frames.set(node.id, matrix); this.frames.set(node.id, matrix);
      const live = (visible.get(node.parent) ?? true) && node.visible !== false; visible.set(node.id, live);
      // Views partition a batch's bounds; the batch already contains all draws.
      if (!live || !['mesh', 'batch', 'instances'].includes(node.kind) || this.ghost(node.material, graph.materials)) continue;
      const matrices = node.kind === 'instances' ? Array.from({ length: node.count }, (_, i) => matrix.clone().multiply(new Matrix4().fromArray(words(node.matrixWords), i * 16))) : [matrix];
      this.assembly.add(`weld:${graph.id}:${node.id}`, await this.shape(node.geometry), matrices);
    }
  }
  async recipe(step, root = new Matrix4(), omitted = []) {
    const recipe = this.json(step.scene), scene = recipe.scene ?? recipe;
    if ((recipe.imports ?? []).length > 0) throw new Error(`Map world recipe imports need explicit rest data: ${step.id}`);
    const nodes = new Map(scene.nodes.map(row => [row.id, row]));
    const walk = async (id, parent, visible) => {
      const node = nodes.get(id); if (node === undefined) throw new Error(`Missing map recipe node ${id}`);
      const local = node.matrix === undefined ? new Matrix4().compose(new Vector3(...node.position ?? [0, 0, 0]), node.quaternion === undefined ? new Quaternion().setFromEuler(new Euler(...node.rotation ?? [0, 0, 0], node.order ?? 'XYZ')) : new Quaternion(...node.quaternion), new Vector3(...node.scale ?? [1, 1, 1])) : new Matrix4().fromArray(node.matrix);
      const matrix = parent.clone().multiply(local), live = visible && node.visible !== false;
      if (node.kind === 'mesh' && live && !omitted.includes(id) && !this.ghost(step.materials[node.material])) {
        const ref = step.geometry[node.geometry]; if (ref === undefined) throw new Error(`Missing map recipe geometry ${node.geometry}`);
        const instanced = this.matrices(step, id, node);
        this.assembly.add(`scene:${step.id}:${id}`, await this.shape(ref), instanced === undefined ? [matrix] : Array.from({ length: node.instances }, (_, i) => matrix.clone().multiply(new Matrix4().fromArray(instanced, i * 16))));
      } else if (!['mesh', 'group', 'anchor', 'light'].includes(node.kind)) throw new Error(`Unsupported map recipe ${node.kind}`);
      for (const child of node.children ?? []) await walk(child, matrix, live);
    };
    await walk(scene.root, root, true);
  }
  dispose() { for (const geometry of this.geometry.values()) geometry.dispose(); }
}

/** Retain the renderer's original grid and float32 coordinates. Colour is a
 * map palette only; the underlying triangle positions are never re-sampled. */
export function mapGround(source, resolution, size, palette, hole) {
  // Same rotated PlaneGeometry lattice as Terrain. Plane's -Z row order matters.
  const geometry = new BufferGeometry(), points = [], colours = [], indices = [];
  for (let z = 0; z < resolution; z++) for (let x = 0; x < resolution; x++) {
    const px = Math.fround(x * size / (resolution - 1) - size / 2), pz = Math.fround(z * size / (resolution - 1) - size / 2);
    points.push(px, Math.fround(source.heightAt(px, pz)), pz);
    const splat = source.splatAt(px, pz), rgb = [0, 0, 0];
    for (let i = 0; i < 4; i++) for (let c = 0; c < 3; c++) rgb[c] += splat[i] * palette[i][c];
    colours.push(...rgb);
  }
  for (let z = 0; z < resolution - 1; z++) for (let x = 0; x < resolution - 1; x++) {
    const a = z * resolution + x;
    for (const ids of [[a, a + resolution, a + 1], [a + resolution + 1, a + 1, a + resolution]]) if (hole === undefined || !hole(ids.map(i => points.slice(i * 3, i * 3 + 3)))) indices.push(...ids);
  }
  geometry.setAttribute('position', new Float32BufferAttribute(points, 3)); geometry.setAttribute('color', new Float32BufferAttribute(colours, 3)); geometry.setIndex(indices); return geometry;
}

/** Decode all local templates once; node transforms belong to their declared
 * world placements, while raw imported scenes explicitly request world=true. */
export async function mapPool(file, world = false) {
  const doc = await new MapRaster(1, {}, readMapGeometry).document(file), result = new Map();
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh(); if (mesh === null) continue;
    if (mesh.listPrimitives().length !== 1) throw new Error(`Map pool requires one primitive ${file}`);
    const primitive = mesh.listPrimitives()[0], geometry = new BufferGeometry();
    for (const [semantic, name] of [['POSITION', 'position'], ['COLOR_0', 'color']]) {
      const attribute = primitive.getAttribute(semantic); if (attribute === null) continue;
      const data = []; for (let i = 0; i < attribute.getCount(); i++) data.push(...attribute.getElement(i, []).slice(0, 3));
      geometry.setAttribute(name, new Float32BufferAttribute(data, 3));
    }
    const indices = primitive.getIndices(); if (indices !== null) geometry.setIndex(Array.from(indices.getArray()));
    if (world) geometry.applyMatrix4(new Matrix4().fromArray(node.getWorldMatrix()));
    const id = node.getName() === '' ? mesh.getName() : node.getName(); if (result.has(id)) throw new Error(`Duplicate map pool geometry ${id}`); result.set(id, geometry);
  }
  return result;
}

export function mapForest(constants, field, forest, variants) {
  _applyChunkConstants(constants);
  configureLevel({ id: constants.slug, ground: { terrain: field }, forest });
  return placeForest(variants).trees;
}

export function mapBinary(file, shuffled = false) {
  const bytes = new Uint8Array(inflateSync(readFileSync(file)));
  if (!shuffled) return bytes;
  const out = new Uint8Array(bytes.length), n = bytes.length / 4;
  for (let b = 0; b < 4; b++) for (let i = 0; i < n; i++) out[i * 4 + b] = bytes[b * n + i];
  return out;
}
export function mapGeometry(bytes, offset, row) {
  const geometry = readBakedGeometry(bytes, offset, row);
  if (!row.expand || geometry.index === null) return geometry;
  const expanded = geometry.toNonIndexed(); geometry.dispose(); return expanded;
}
