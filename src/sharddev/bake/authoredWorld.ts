import { Box3, DoubleSide, Float32BufferAttribute, Mesh, MeshStandardMaterial, Raycaster, Vector3, type BufferGeometry } from 'three';
import * as v from 'valibot';
import { isJsonData } from '@wildshard/format/json';
import { FAMILY_IDS, PbrMaterialSchema } from '@wildshard/format/materialFamilies';
import { MaterialsSchema, materialGraphIr } from '@wildshard/format/materials';
import { parseShardfile, type Shardfile } from '@wildshard/format/shardSchema';
import { normalizeWorldGlb, type NormalizedWorld, type WorldPrimitive } from './world';
import { parseWorldSource } from '../worldSource';
import { bakeWorldTexture } from './textureWasm';
import { StaticMaterialCatalogue } from './staticMaterials';
import { compactTileGeometry, modelGrid, tileGrid, tileGridTransform, worldGeometry, mergeWorldGeometry } from './worldGeometry';
import { compressGlb } from './glbCompression';
import { staticGlb, type GlbPrimitive } from './glb';
import { simplifyWorldPrimitive } from './worldLod';
import { bakeWorldCollision } from './worldCollision';
import { WorldBakeRows } from './worldRows';
import { coarseNearView } from './placeholders';
import { completeL0Tiles } from './tileGrid';
import { gridPositionError } from './geometryError';

/** In-memory authored-world result; the project loader reads source bytes and the build writes only the product. */
export interface AuthoredWorldProduct { shard: Shardfile; assets: Map<string, Uint8Array> }
function record(input: unknown): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input) || !isJsonData(input)) throw new Error('Authored world config needs plain JSON data');
  return input as Record<string, unknown>;
}

/** Sample the real authored ground boundary with Three's offline raycaster, never a synthetic flat edge.
 * Missing boundary ground refuses. ws_terrain selects the sampling surface when present; all collision stays WMC1. */
function edges(world: NormalizedWorld): Shardfile['edge'] {
  const material = new MeshStandardMaterial({ side: DoubleSide }), terrain = [...world.static, ...world.undrawn].filter(row => row.terrain);
  const primitives = terrain.length === 0 ? world.collision : terrain, meshes = primitives.map(row => new Mesh(worldGeometry(row), material));
  meshes.forEach(mesh => mesh.updateMatrixWorld(true));
  const ray = new Raycaster(new Vector3(), new Vector3(0, -1, 0), 0, 501);
  try {
    const side = (name: 'north' | 'south' | 'east' | 'west'): Shardfile['edge']['north'] => {
      const heights: number[] = [], colours: [number, number, number][] = [];
      for (let at = 0; at < 257; at++) {
        const coordinate = -250 + at * 500 / 256;
        ray.ray.origin.set(name === 'east' ? 250 : name === 'west' ? -250 : coordinate, 250, name === 'north' ? 250 : name === 'south' ? -250 : coordinate);
        const hit = ray.intersectObjects(meshes, false)[0];
        if (hit === undefined) throw new Error(`World GLB ${name} boundary sample ${at} has no permanent ground`);
        const primitive = primitives.find((_row, index) => meshes[index] === hit.object), surface = primitive === undefined ? undefined : world.materials[primitive.material];
        heights.push(Math.fround(hit.point.y)); colours.push([surface?.colour[0] ?? 0.5, surface?.colour[1] ?? 0.5, surface?.colour[2] ?? 0.5]);
      }
      return { heights, colours, roadHeight: 0 };
    };
    return { north: side('north'), east: side('east'), south: side('south'), west: side('west') };
  } finally { meshes.forEach(mesh => mesh.geometry.dispose()); material.dispose(); }
}

/** The far proxy's source rows: every static, undrawn and far-only node (the default), or the far-only nodes alone (`replace`, NM0);
 *  never an additive light surface (`light`: material indices). */
export function farSources(world: Pick<NormalizedWorld, 'static' | 'undrawn' | 'far'>, light: ReadonlySet<number>, mode?: 'replace'): WorldPrimitive[] {
  return (mode === 'replace' ? world.far : [...world.static, ...world.undrawn, ...world.far]).filter(row => !light.has(row.material));
}

/** Build a static authored GLB through the pinned texture/LOD tools and the normal render/collision row packers.
 * The default config is a compiled declaration plus `world`; this build-only key is removed before format parsing.
 * Existing compiled world sections refuse rather than being silently replaced.
 * Vacant L0 squares have zero-cost metadata without fabricated GLBs or model rows.
 * No repository bake script is needed. */
export async function bakeAuthoredWorld(input: unknown, bytes: Uint8Array, graphFiles: (hash: string) => Uint8Array | undefined = () => undefined): Promise<AuthoredWorldProduct> {
  const source = record(input), { world: declaration, ...data } = source, authored = parseWorldSource(declaration);
  for (const key of ['terrain', 'meshCollision', 'props', 'far', 'runtime']) if (data[key] !== undefined && data[key] !== null) throw new Error(`Authored world cannot replace compiled ${key}`);
  if (Array.isArray(data['tiles']) && data['tiles'].length > 0) throw new Error('Authored world cannot replace compiled tiles');
  const look = record(data['look']), materials = { ...v.parse(MaterialsSchema, look['materials'] ?? {}) };
  // D74: a graph entry's IR from its graph file (`graphFiles`: the build's lowered graph bytes)
  const graphs = new Map(Object.entries(materials).flatMap(([id, entry]) => entry.family === 'graph' && !('preset' in entry) ? [[id, materialGraphIr(entry, graphFiles)] as const] : []));
  const world = await normalizeWorldGlb(bytes, authored, [...Object.keys(materials), ...FAMILY_IDS]);
  // Platform defaults are made explicit for the named transport catalogue.
  for (const row of world.materials) if (materials[row.id] === undefined) {
    if (row.id !== 'pbr') throw new Error(`World GLB material ${row.name} needs an explicit ${row.id} look entry`);
    materials[row.id] = v.parse(PbrMaterialSchema, { family: 'pbr' });
  }
  const encoded = new Map<string, Uint8Array>();
  for (const material of world.materials) for (const [slot, map] of Object.entries(material.maps)) {
    if (map === null) continue;
    const role = slot === 'colour' || slot === 'emissive' ? 'srgb' : 'linear', key = `${map.image}/${role}`;
    if (encoded.has(key)) continue;
    const image = world.images.find(row => row.hash === map.image); if (image === undefined) throw new Error('World GLB missing embedded texture');
    encoded.set(key, await bakeWorldTexture(image.bytes, role));
  }
  const catalogue = new StaticMaterialCatalogue(world.materials, materials, graphs, (map, role) => {
    const texture = encoded.get(`${map.image}/${role}`); if (texture === undefined) throw new Error('World GLB missing encoded texture'); return texture;
  });
  const pack = new WorldBakeRows(), geometry: BufferGeometry[] = [], library: string[] = [];
  try {
    const bindings = catalogue.snapshot();
    for (const texture of bindings.textures.values()) pack.asset(texture, 'ktx2');
    // RM8.2: detail rows draw only at L0; the coarse rows stand in for them at L1, as they are
    const detail = new Set(world.detail), coarse = await Promise.all(world.static.filter(row => !detail.has(row)).map(row => simplifyWorldPrimitive(row, 0.5, 0.25)));
    const sourceErrors = new Map(coarse.map(row => [row.primitive, row.errorMetres]));
    const emit = (rows: readonly WorldPrimitive[], bounds?: readonly [number, number, number, number], transform?: readonly number[], castShadow = true): { bytes: Uint8Array; dependencies: string[]; box: Box3; storageError: number; sourceError: number } => {
      const groups = new Map<string, BufferGeometry[]>(), box = new Box3(), transient: BufferGeometry[] = [];
      let storageError = 0, sourceError = 0;
      try {
      for (const row of rows) {
        const name = world.materials[row.material]?.name; if (name === undefined) throw new Error('World GLB missing material slot');
        const part = worldGeometry(row, bounds, transform, metres => { storageError = Math.max(storageError, metres); }); transient.push(part);
        if (part.getAttribute('position').count === 0) continue;
        sourceError = Math.max(sourceError, sourceErrors.get(row) ?? 0);
        part.computeBoundingBox(); if (part.boundingBox !== null) box.union(part.boundingBox);
        const list = groups.get(name) ?? []; list.push(part); groups.set(name, list);
      }
      const primitives: GlbPrimitive[] = [];
      // RM8.1: a tile's positions are Int16 on the shared grid, dequantized by its node, and the tile is meshopt-packed
      const grid = bounds === undefined || box.isEmpty() ? undefined : tileGrid(box);
      const floatError = storageError;
      for (const [name, parts] of groups) {
        const merged = mergeWorldGeometry(parts); transient.push(merged);
        // RM8.1a: welded, 16-bit indexed, Int8 normals and Uint16 colours (KHR_mesh_quantization) on the wire
        // RM8.1e: a model-space graph (the open plots' turning hologram) gets a grid pinned at its model origin: on the tile's
        // grid its positions were grid units about the tile centre, and its turn about the origin swung 512x (cyan sheets)
        const own = grid === undefined ? undefined : catalogue.modelSpace(name) ? modelGrid(modelBox(merged)) : grid;
        if (own !== undefined) storageError = Math.max(storageError, floatError + gridPositionError(merged, own));
        const primitive = catalogue.primitive(name, merged, { castShadow }), compact = compactTileGeometry(primitive.geometry, own); transient.push(compact);
        primitives.push({ ...primitive, geometry: compact, quantizedChannels: true, compactIndex: true,
          ...(own === undefined ? {} : { meshoptReady: true, transform: tileGridTransform(own) }) });
      }
      const glb = primitives.length === 0 ? new Uint8Array() : staticGlb(primitives);
      return { bytes: grid === undefined || glb.length === 0 ? glb : compressGlb(glb), dependencies: catalogue.dependencies([...groups.keys()]), box, storageError, sourceError };
      } finally { transient.forEach(part => part.dispose()); }
    };
    for (const lod of [0, 1] as const) {
      const size = lod === 0 ? 62.5 : 125, count = 500 / size, rows = lod === 0 ? world.static : [...coarse.map(row => row.primitive), ...world.coarse];
      for (let z = 0; z < count; z++) for (let x = 0; x < count; x++) {
        const cell = [-250 + x * size, -250 + (x + 1) * size, -250 + z * size, -250 + (z + 1) * size] as const, output = emit(rows, cell, undefined, lod === 0);
        if (output.bytes.length === 0) continue;
        // a tile spans its whole cell; its content sets only its height (an `undrawn` ground leaves cells partly empty)
        pack.tile({ lod, x, z, bytes: output.bytes, dependencies: output.dependencies, bounds: { min: [cell[0], output.box.min.y, cell[2]], max: [cell[1], output.box.max.y, cell[3]] }, geometricError: output.storageError + output.sourceError });
      }
    }
    const panels = world.panels.map(panel => {
      const output = emit(panel.primitives, undefined, panel.transform), file = pack.asset(output.bytes, 'glb', output.dependencies);
      library.push(file.hash); return { id: panel.id, file: file.hash, visible: true };
    });
    // The far proxy is an independently measured vertex-colour approximation, one draw and no interactive panels.
    // additive graph surfaces (a hologram) are light without a far silhouette; the world's far-only nodes (its source's
    // `far` prefix) stand in for them here (G608)
    const light = new Set(world.materials.flatMap((row, index) => { const entry = materials[row.id];
      return graphs.get(row.id)?.effectState?.blend === 'additive' || (entry?.family === 'emissive' && entry.blend === 'additive') ? [index] : []; }));
    const farRows = await Promise.all(farSources(world, light, authored.farMode).map(row => simplifyWorldPrimitive(row, 0.1, 2)));
    const farParts = farRows.map(row => {
      const part = worldGeometry(row.primitive), colour = world.materials[row.primitive.material]?.colour ?? [1, 1, 1];
      const n = part.getAttribute('position').count, values: number[] = [], original = part.hasAttribute('color') ? part.getAttribute('color') : null;
      for (let at = 0; at < n; at++) for (let c = 0; c < 3; c++) values.push((original?.getComponent(at, c) ?? 1) * (colour[c] ?? 1));
      part.setAttribute('color', new Float32BufferAttribute(values, 3)); part.deleteAttribute('uv'); part.deleteAttribute('tangent'); geometry.push(part); return part;
    });
    const farGeometry = mergeWorldGeometry(farParts); geometry.push(farGeometry); farGeometry.computeBoundingBox();
    const farBox = farGeometry.boundingBox; if (farBox === null) throw new Error('World GLB far proxy has no bounds');
    const farMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 1 }); farMaterial.name = 'ws.far';
    let farFile: Shardfile['files'][number];
    try { farFile = pack.asset(staticGlb([{ geometry: farGeometry, material: farMaterial, castShadow: false }]), 'glb'); }
    finally { farMaterial.dispose(); }
    materials['ws.far'] = v.parse(PbrMaterialSchema, { family: 'pbr', vertexColours: true });
    bindings.materials['ws.far'] = { id: 'ws.far', colour: null, normal: null, metallicRoughness: null, occlusion: null, emissive: null };
    const collision = bakeWorldCollision(world);
    for (const payload of collision.assets.values()) pack.asset(payload, 'binary', [], true);
    const baked = pack.finish(world.materials[0]?.id ?? 'pbr', { materials: bindings.materials });
    const panelCollision = collision.panels.map(row => ({ id: row.colliderId, panel: row.id, file: row.file, initialActive: true }));
    const oldFiles = v.parse(v.array(v.unknown()), data['files'] ?? []);
    const oldLibrary = v.parse(v.array(v.string()), data['library'] ?? []), oldCritical = v.parse(v.array(v.string()), data['critical'] ?? []);
    const budgets = record(data['budgets']), previous = record(budgets['library']), simBudget = record(budgets['sim']), closure = new Set<string>(), pending = [...library];
    let resident = 0, compressed = 0;
    while (pending.length > 0) {
      const hash = pending.pop(); if (hash === undefined || closure.has(hash)) continue;
      const file = baked.files.find(row => row.hash === hash); if (file === undefined) throw new Error('World panel dependency missing');
      closure.add(hash); pending.push(...file.dependencies); resident += file.decoded + file.gpu; compressed += file.compressed;
    }
    const criticalFiles = baked.files.filter(row => row.critical), criticalResident = criticalFiles.reduce((sum, row) => sum + row.decoded + row.gpu, 0);
    const server = record(data['serverBudget']);
    const shard = parseShardfile({ ...data, look: { ...look, materials }, files: [...oldFiles, ...baked.files], tiles: completeL0Tiles(baked.tiles),
      budgets: { ...budgets, library: { resident: v.parse(v.number(), previous['resident']) + resident, compressed: v.parse(v.number(), previous['compressed']) + compressed },
        sim: { resident: v.parse(v.number(), simBudget['resident']) + criticalResident,
          compressed: v.parse(v.number(), simBudget['compressed']) + criticalFiles.reduce((sum, row) => sum + row.compressed, 0) } },
      serverBudget: { ...server, memory: v.parse(v.number(), server['memory']) + criticalResident },
      props: { ...baked.props, panels, far: farFile.hash }, library: [...new Set([...oldLibrary, ...library])], critical: [...new Set([...oldCritical, ...baked.critical])],
      meshCollision: { version: 1, tiles: collision.tiles.map(({ x, z, file }) => ({ x, z, file })), panels: panelCollision },
      far: { bounds: { min: farBox.min.toArray(), max: farBox.max.toArray() }, files: [farFile.hash], compressed: farFile.compressed, decoded: farFile.decoded, gpu: farFile.gpu, triangles: farFile.triangles, draws: farFile.draws }, edge: edges(world) });
    // NM5: its own near view from its coarse tiles (a first-party product builds with no placeholders)
    // its light (additive pools, unlit or emissive glows) has no lit vertex-colour form: the near view draws it in its own
    // additive light layer (NM13, `coarseNearView`)
    const lightNames = new Set(world.materials.flatMap((row, index) => { const entry = materials[row.id];
      return light.has(index) || entry?.family === 'emissive' || graphs.get(row.id)?.model === 'unlit' ? [row.name, row.id] : []; }));
    const colourNames = new Set(world.materials.flatMap(row => { const graph = graphs.get(row.id);
      return graph?.model === 'unlit'
        && Object.values(graph.nodes).some(node => node.op === 'meshMap' && node.name === 'colourOrVertex') ? [row.name, row.id] : []; }));
    // the near view reads its graph surfaces from their files
    for (const entry of Object.values(materials)) if (entry.family === 'graph' && 'file' in entry) { const file = graphFiles(entry.file); if (file !== undefined) baked.assets.set(entry.file, file); }
    if (authored.near === 'coarse') return { shard: await coarseNearView(shard, baked.assets, name => lightNames.has(name), name => colourNames.has(name)), assets: baked.assets };
    return { shard, assets: baked.assets };
  } finally { catalogue.dispose(); geometry.forEach(part => part.dispose()); }
}

/** A primitive's own bounding box (its positions, in its model space). */
function modelBox(geometry: BufferGeometry): Box3 {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox; if (box === null) throw new Error('World primitive has no positions');
  return box.clone();
}
