// oxlint-disable-next-line import/no-nodejs-modules -- Offline maps decode the existing deflated geometry packs.
import { inflateSync } from 'node:zlib';
import { Box3, Euler, Matrix4, Quaternion, Vector3 } from 'three';
import * as v from 'valibot';
import { GeometryPack, packedRows } from '@wildshard/sdk/kit/geometryPack';
import type { MapRaster } from './mapRaster';
import type { Node } from '@gltf-transform/core';
import { decodeTerrainTile } from '@wildshard/format/terrainTileBytes';

const vector = v.tuple([v.number(), v.number(), v.number()]);
const referenceSchema = v.object({ file: v.string(), path: v.exactOptional(v.array(v.string())) });
const fitSchema = v.object({ size: v.number(), yaw: v.exactOptional(v.number()), floor: v.exactOptional(v.number()), by: v.exactOptional(v.string()) });
const nodeSchema = v.object({ id: v.string(), kind: v.string(), name: v.exactOptional(v.string()),
  children: v.exactOptional(v.array(v.string())), position: v.exactOptional(vector), rotation: v.exactOptional(vector), scale: v.exactOptional(vector),
  quaternion: v.exactOptional(v.tuple([v.number(), v.number(), v.number(), v.number()])), matrix: v.exactOptional(v.array(v.number())),
  order: v.exactOptional(v.picklist(['XYZ', 'YXZ', 'ZXY', 'ZYX', 'YZX', 'XZY'])), visible: v.exactOptional(v.boolean()),
  geometry: v.exactOptional(v.string()), source: v.exactOptional(v.string()), material: v.exactOptional(v.string()),
  instances: v.exactOptional(v.number()), matrices: v.exactOptional(v.array(v.number())) });
const materialSchema = v.object({ kind: v.string(), id: v.string(), source: v.exactOptional(v.string()),
  properties: v.exactOptional(v.object({ transparent: v.exactOptional(v.boolean()), depthWrite: v.exactOptional(v.boolean()) })) });
const sceneSchema = v.object({ root: v.string(), nodes: v.array(nodeSchema), materials: v.optional(v.array(materialSchema), []) });
const imports = v.array(v.object({ id: v.string(), kind: v.string(), model: v.exactOptional(v.string()), fit: v.exactOptional(fitSchema),
  piece: v.exactOptional(v.string()), only: v.exactOptional(v.record(v.string(), v.unknown())) }));
const configuration = v.object({ materials: v.exactOptional(v.array(referenceSchema)), models: v.exactOptional(v.array(referenceSchema)),
  pools: v.exactOptional(v.array(v.union([v.string(), v.object({ file: v.string(), names: v.exactOptional(v.union([v.array(v.string()), referenceSchema])) })]))),
  aliases: v.exactOptional(v.record(v.string(), v.string())),
  packs: v.exactOptional(v.array(v.object({ file: v.string(), rows: referenceSchema, names: v.exactOptional(v.array(v.string())), deflated: v.exactOptional(v.boolean()) }))),
  bakes: v.exactOptional(v.array(v.object({ rows: referenceSchema, directory: v.string(), piece: v.exactOptional(v.unknown()) }))),
  recipes: v.array(v.object({ file: v.string(), path: v.exactOptional(v.array(v.string())), lights: v.exactOptional(v.array(v.string())), rest: v.exactOptional(v.string()) })) });
const visibility = v.object({ keep: v.exactOptional(v.array(v.string())), hide: v.exactOptional(v.array(v.string())),
  heightHide: v.exactOptional(v.array(v.string())), hideStanding: v.exactOptional(v.array(v.string())) });
const surfaceSchema = v.object({ graph: v.exactOptional(v.object({ effectState: v.exactOptional(v.object({ blend: v.exactOptional(v.string()), depthWrite: v.exactOptional(v.boolean()) })) })) });
const packRows = v.object({ bytes: v.number(), geometries: v.array(v.object({ attrs: v.array(v.tuple([v.string(), v.number()])),
  count: v.number(), unique: v.number(), own: v.nullable(v.string()), indexCount: v.number(),
  groups: v.exactOptional(v.array(v.object({ start: v.number(), count: v.number(), materialIndex: v.number() }))) })) });
const pieceRows = v.object({ kinds: v.array(v.record(v.string(), v.unknown())) });
type Pose = v.InferOutput<typeof nodeSchema>;
type Fit = v.InferOutput<typeof fitSchema>;
interface Shape { bounds: Box3; draw: (matrix: Matrix4) => void | Promise<void> }
interface Draw { matrix: Matrix4; draw: Shape['draw']; bounds?: Box3; live?: boolean; standing?: boolean; instanced?: boolean }
interface Model { matrix: Matrix4; model: Fit; file: string }
/** Input authority stays with the caller; a file identity is usable only by an explicitly configured raster reader. */
export interface MapSceneReader {
  input: (file: string) => string | Uint8Array;
  /** Optional URL mapping belongs to the caller; otherwise models use their declared logical identity. */
  model?: (url: string) => string | Uint8Array;
  json: (file: string) => unknown;
  bytes: (file: string) => Uint8Array;
}
function record(value: unknown): Record<string, unknown> { return v.parse(v.record(v.string(), v.unknown()), value); }
function required<T>(value: T | undefined, label: string): T { if (value === undefined) throw new Error(label); return value; }
const matches = (patterns: readonly string[], name: string): boolean => patterns.some(pattern => pattern.endsWith('*') ? name.startsWith(pattern.slice(0, -1)) : name === pattern);
const matrixOf = (row: Pose): Matrix4 => row.matrix === undefined ? new Matrix4().compose(new Vector3(...row.position ?? [0, 0, 0]),
  row.quaternion === undefined ? new Quaternion().setFromEuler(new Euler(...row.rotation ?? [0, 0, 0], row.order ?? 'XYZ')) : new Quaternion(...row.quaternion),
  new Vector3(...row.scale ?? [1, 1, 1])) : new Matrix4().fromArray(row.matrix);

/** A path is a declared JSON address; * expands an existing array in its order. */
export function mapRows(value: unknown, path: readonly string[] = []): unknown[] {
  if (path.length === 0) return [value];
  const [key, ...tail] = path;
  if (key === '*') {
    if (!Array.isArray(value)) throw new Error('Map scene wildcard requires an array');
    const rows: unknown[] = value;
    return rows.flatMap(row => mapRows(row, tail));
  }
  if (key === undefined || value === null || typeof value !== 'object' || !Object.hasOwn(value, key)) throw new Error(`Missing map scene data ${path.join('/')}`);
  return mapRows(Reflect.get(value, key), tail);
}

/** Sources index real local geometry; recipes retain their exact placement
 * doubles. Unknown geometry and imports refuse instead of silently losing it. */
export async function paintMapScenes(raster: MapRaster, input: unknown, style: unknown, data: MapSceneReader): Promise<void> {
  const config = v.parse(configuration, input), settings = v.parse(visibility, style);
  const shapes = new Map<string, Shape>(), bakes = new Map<string, { file: string; kinds: Record<string, unknown>[] }>(),
    models = new Map<string, string>(), materials = new Map<string, unknown>(), records: (Draw | Model)[] = [];
  for (const ref of config.materials ?? []) for (const [id, row] of Object.entries(record(mapRows(data.json(ref.file), ref.path)[0]))) materials.set(id, row);
  for (const row of config.models ?? []) {
    const source = v.parse(v.record(v.string(), v.string()), mapRows(data.json(row.file), row.path)[0]);
    for (const [id, url] of Object.entries(source)) models.set(id, url);
  }
  for (const pool of config.pools ?? []) {
    const file = typeof pool === 'string' ? pool : pool.file;
    const names = typeof pool === 'string' || pool.names === undefined ? undefined : Array.isArray(pool.names) ? pool.names : v.parse(v.array(v.string()), mapRows(data.json(pool.names.file), pool.names.path));
    const path = data.input(file), doc = await raster.document(path);
    let index = 0;
    for (const node of doc.getRoot().listNodes()) {
      const mesh = node.getMesh(); if (mesh === null) continue;
      const id = names?.[index++] ?? (node.getName() === '' ? mesh.getName() : node.getName());
      if (id === '') throw new Error(`${file}: unnamed map pool geometry`);
      if (shapes.has(id)) throw new Error(`Ambiguous map geometry ${id}`);
      const bounds = new Box3();
      for (const primitive of mesh.listPrimitives()) {
        const position = primitive.getAttribute('POSITION'); if (position === null) throw new Error('Map pool needs positions');
        bounds.union(new Box3(new Vector3(...position.getMin([])), new Vector3(...position.getMax([]))));
      }
      shapes.set(id, { bounds, draw: matrix => raster.glb(path, matrix, candidate => candidate === node, { local: true }) });
    }
  }
  for (const [id, source] of Object.entries(config.aliases ?? {})) {
    const shape = shapes.get(source); if (shape === undefined || shapes.has(id)) throw new Error(`Invalid map geometry alias ${id}`);
    shapes.set(id, shape);
  }
  for (const row of config.packs ?? []) {
    const source = mapRows(data.json(row.rows.file), row.rows.path)[0], names = mapRows(source, row.names)[0];
    const metadata = v.parse(packRows, source);
    if (!Array.isArray(names) || names.length !== metadata.geometries.length) throw new Error('Map geometry pack names differ');
    const bytes = data.bytes(row.file);
    const pack = new GeometryPack(row.deflated === true ? inflateSync(bytes) : bytes, packedRows(metadata), 'map');
    for (const [index, id] of v.parse(v.array(v.unknown()), names).entries()) {
      if (typeof id !== 'string' || shapes.has(id)) throw new Error('Map pack needs unique names');
      const geometry = pack.geometry(index); geometry.computeBoundingBox();
      if (geometry.boundingBox === null) throw new Error('Map pack needs bounds');
      shapes.set(id, { bounds: geometry.boundingBox, draw: matrix => raster.geometry(geometry, matrix) });
    }
  }
  for (const row of config.bakes ?? []) {
    const selected = mapRows(data.json(row.rows.file), row.rows.path)[0];
    if (row.piece !== undefined && (typeof row.piece !== 'string' || !/^[a-z][a-z0-9.-]{0,127}$/u.test(row.piece))) throw new Error('Map bake needs a bounded piece identity');
    const source = row.piece === undefined ? selected : { [row.piece]: selected };
    for (const [id, piece] of Object.entries(record(source))) bakes.set(id, { file: `${row.directory}/${id}.glb`, kinds: v.parse(pieceRows, piece).kinds });
  }
  for (const ref of config.recipes) for (const recipe of mapRows(data.json(ref.file), ref.path)) {
    const recipeRecord = record(recipe), recipeScene = v.parse(sceneSchema, recipeRecord['scene'] ?? recipe),
      importedRows = v.parse(imports, recipeRecord['imports'] ?? []), importedById = new Map(importedRows.map(row => [row.id, row]));
    const lights = new Set(ref.lights === undefined ? [] : v.parse(v.array(v.object({ id: v.string() })), mapRows(data.json(ref.file), ref.lights).flat()).map(row => row.id));
    const ghostMaterials = new Set(recipeScene.materials.flatMap(row => {
      const surface = row.kind === 'port' ? materials.get(required(row.source, 'Map material needs a source').split(':')[0] ?? '') : undefined;
      const effect = surface === undefined ? undefined : v.parse(surfaceSchema, surface).graph?.effectState;
      return row.properties?.transparent === true && row.properties.depthWrite === false || effect?.blend === 'alpha' && effect.depthWrite === false ? [row.id] : [];
    }));
    const rest = ref.rest === undefined ? {} : record(record(data.json(ref.rest))['nodes']);
    const nodes = new Map(recipeScene.nodes.map(row => [row.id, v.parse(nodeSchema, { ...row, ...record(rest[row.id] ?? {}) })])), visiting = new Set<string>();
    const walk = (id: string, parent: Matrix4, names: readonly string[], visible: boolean, inheritedStanding = false): void => {
      const node = nodes.get(id);
      if (node === undefined || visiting.has(id)) throw new Error(`Invalid map scene hierarchy ${id}`);
      visiting.add(id);
      const chain = [...names, node.name ?? node.id], kept = chain.some(name => matches(settings.keep ?? [], name));
      const hidden = !kept && matches([...(settings.hide ?? []), ...(settings.heightHide ?? [])], node.name ?? node.id);
      const standing = inheritedStanding || hidden && matches(settings.hideStanding ?? [], node.name ?? node.id);
      const matrix = new Matrix4().multiplyMatrices(parent, matrixOf(node));
      const live = visible && node.visible !== false && !hidden;
      if (node.kind === 'mesh' && node.material !== undefined && ghostMaterials.has(node.material)) {
        // The browser height pass omits transparent, depth-off effects too.
      } else if (node.kind === 'mesh' || node.kind === 'object') {
        const source = (node.kind === 'mesh' ? node.geometry : node.source) ?? '', imported = importedById.get(source);
        const shape = shapes.get(source);
        if (node.kind === 'object' && imported !== undefined) {
          if (imported.kind === 'model') {
            const file = models.get(imported.model ?? ''); if (file === undefined) throw new Error(`Missing declared map model ${String(imported.model)}`);
            if (live) records.push({ matrix, model: required(imported.fit, 'Map model needs a fit'), file });
            for (const child of node.children ?? []) walk(child, matrix, chain, live, standing);
            visiting.delete(id); return;
          }
          const baked = bakes.get(imported.piece ?? ''); if (baked === undefined) throw new Error(`Missing map bake ${String(imported.piece)}`);
          if (live) records.push({ matrix, draw: (pose: Matrix4) => raster.glb(data.input(baked.file), pose,
            (_node, index) => imported.only === undefined || Object.entries(imported.only).every(([key, value]) => baked.kinds[index]?.[key] === value)) });
        } else if (shape === undefined && node.kind === 'object' && lights.has(source)) {
          // A declared point light has no map footprint.
        } else {
          if (shape === undefined) throw new Error(`Missing declared map geometry ${source}`);
          const count = node.instances ?? 1;
          if (count > 1 && node.matrices === undefined) throw new Error(`Missing rest instance matrices ${node.id}`);
          if (node.matrices !== undefined && node.matrices.length !== count * 16) throw new Error('Map instance matrices differ');
          for (let i = 0; i < count; i++) {
            const pose = node.matrices === undefined ? matrix : new Matrix4().multiplyMatrices(matrix, new Matrix4().fromArray(node.matrices, i * 16));
            records.push({ matrix: pose, draw: shape.draw, bounds: shape.bounds, live, standing, instanced: node.instances !== undefined });
          }
        }
      } else if (!['group', 'anchor', 'light'].includes(node.kind)) throw new Error(`Unsupported map scene node ${node.kind}`);
      for (const child of node.children ?? []) walk(child, matrix, chain, live, standing);
      visiting.delete(id);
    };
    walk(recipeScene.root, new Matrix4(), [], true);
  }
  // Preserve bake-maps' hideStanding rule: the same instanced vegetation rooted
  // on a decorative island is omitted with that island, using its actual box.
  const standing = records.filter((row): row is Draw => 'standing' in row && row.standing).map(row => {
    const box = required(row.bounds, 'Standing map geometry needs bounds').clone().applyMatrix4(row.matrix), size = box.getSize(new Vector3());
    return { position: new Vector3().setFromMatrixPosition(row.matrix), radius: 0.4 * Math.min(size.x, size.z) };
  });
  for (const row of records) {
    if ('live' in row && !row.live) continue;
    if ('instanced' in row && row.instanced) {
      const p = new Vector3().setFromMatrixPosition(row.matrix);
      if (standing.some(island => Math.hypot(p.x - island.position.x, p.z - island.position.z) <= island.radius && p.y >= island.position.y - 4 && p.y <= island.position.y + 6)) continue;
    }
    if ('model' in row) {
      const file = (data.model ?? data.input)(row.file), doc = await raster.document(file), fit = row.model;
      const turn = new Matrix4().makeRotationY(fit.yaw ?? 0), bounds = new Box3();
      for (const node of doc.getRoot().listNodes()) for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
        const position = primitive.getAttribute('POSITION'); if (position === null) throw new Error('Map model needs positions');
        const box = new Box3(new Vector3(...position.getMin([])), new Vector3(...position.getMax([])));
        bounds.union(box.applyMatrix4(new Matrix4().multiplyMatrices(turn, new Matrix4().fromArray(node.getWorldMatrix()))));
      }
      const extent = bounds.getSize(new Vector3()), scale = fit.size / Math.max(1e-6, fit.by === 'height' ? extent.y : Math.max(extent.x, extent.z));
      const matrix = row.matrix.clone().multiply(new Matrix4().makeTranslation(0, fit.floor ?? 0, 0)).multiply(new Matrix4().makeScale(scale, scale, scale))
        .multiply(new Matrix4().makeTranslation(-(bounds.min.x + bounds.max.x) / 2, -bounds.min.y, -(bounds.min.z + bounds.max.z) / 2)).multiply(turn);
      await raster.glb(file, matrix);
    } else await row.draw(row.matrix);
  }
}


const geometryDeclaration = v.object({ painter: v.object({ version: v.literal(1), terrain: v.exactOptional(v.array(v.string())),
  props: v.exactOptional(v.array(v.string())), glbs: v.exactOptional(v.array(v.string())), scenes: v.exactOptional(v.unknown()) }),
  outputs: v.exactOptional(v.record(v.string(), v.unknown())) });
const geometryOutput = v.object({ exclude: v.exactOptional(v.union([v.string(), v.array(v.string())])) });
const terrainRows = v.object({ terrain: v.object({ tiles: v.array(v.object({ lod: v.number(), file: v.string() })) }) });
const propsRows = v.object({ props: v.object({ wholeLibrary: v.exactOptional(v.unknown()),
  tiles: v.array(v.object({ lod: v.number(), file: v.string(), additionalFiles: v.exactOptional(v.array(v.string())) })),
  panels: v.array(v.object({ file: v.string(), visible: v.exactOptional(v.boolean()) })) }) });
/** The single declared terrain/props/GLB/private-scene placement loop, shared by source programs and retained file adapters. */
export async function paintMapGeometry(raster: MapRaster, input: unknown, data: MapSceneReader,
  options: { output?: string; glbs?: readonly string[]; label?: string } = {}): Promise<void> {
  const config = v.parse(geometryDeclaration, input), painter = config.painter, label = options.label ?? 'map';
  for (const file of painter.terrain ?? []) {
    const row = v.parse(terrainRows, data.json(file));
    for (const tile of row.terrain.tiles.filter(entry => entry.lod === 0)) raster.terrain(decodeTerrainTile(data.bytes(`assets/${tile.file}`)));
  }
  for (const file of painter.props ?? []) {
    const source = data.json(file), library = v.parse(v.object({ props: v.object({ wholeLibrary: v.exactOptional(v.unknown()) }) }), source);
    if (library.props.wholeLibrary !== undefined) throw new Error(`${label}: whole-library props need an explicit map assembly`);
    const { props } = v.parse(propsRows, source);
    for (const tile of props.tiles.filter(entry => entry.lod === 0)) for (const ref of [tile.file, ...tile.additionalFiles ?? []]) await raster.glb(data.input(`assets/${ref}`));
    for (const panel of props.panels.filter(entry => entry.visible !== false)) await raster.glb(data.input(`assets/${panel.file}`));
  }
  const selected = options.output === undefined ? undefined : config.outputs?.[options.output];
  const own = selected === undefined ? undefined : v.parse(geometryOutput, selected), excluded = own?.exclude;
  const exclude = typeof excluded === 'string' ? [excluded] : excluded ?? [];
  const drawn = exclude.length === 0 ? undefined : (node: Node) => !exclude.some(prefix => node.getName().startsWith(prefix));
  for (const file of options.glbs ?? painter.glbs ?? []) await raster.glb(data.input(file), undefined, drawn);
  if (painter.scenes !== undefined) await paintMapScenes(raster, painter.scenes, input, data);
  if (raster.triangles === 0) throw new Error(`${label}: data map is empty`);
}
