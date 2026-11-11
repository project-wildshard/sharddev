import { expect, test } from 'vitest';
import { BufferAttribute, BufferGeometry, Float16BufferAttribute, Float32BufferAttribute, Group, Matrix4, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { nativeWholeGeometry } from '@wildshard/engine/models/nativeGeometry';
import { parseWorldSceneWeld, type WorldSceneWeld } from '@wildshard/format/worldSceneWeld';
import { parseWorldScenes } from '@wildshard/format/worldScenes';
import { WorldSceneSlabsSchema } from '@wildshard/format/worldSceneSlabs';
import { joinWholePieceSteps } from './wholePieceJoin';
import { wholeGeometryPieces } from '@wildshard/engine/game/shardfile/wholeGeometryPieces';
import { bakeProps } from './props';
import { readSourceModel } from './skinned';
import { partitionSlabGeometry, RESIDENT_SLAB_GROUND, RESIDENT_SLAB_MIN_BYTES, slabGeometryBytes } from './slabChunks';
import { bakeWholeSlabs, readSlabLibrary, residentBanks } from './slabs';
import * as v from 'valibot';

function triangle(x: number, y: number, z: number, height = 1): BufferGeometry {
  return new BufferGeometry().setAttribute('position', new Float32BufferAttribute([x, y, z, x + 1, y, z, x, y + height, z + 1], 3))
    .setAttribute('normal', new BufferAttribute(new Int8Array([0, 127, 0, 0, 127, 0, 0, 127, 0]), 3, true))
    .setAttribute('color', new BufferAttribute(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]), 3, true))
    .setAttribute('aFace', new Float16BufferAttribute(new Uint16Array([0x8000, 0x3c00, 0x3800]), 1))
    .setAttribute('aOff', new BufferAttribute(new Float32Array([-0, 0.5, 1]), 1)).setIndex([0, 1, 2]);
}
function fixture(shaderNormal = false, acrossTiles = false, large?: BufferGeometry) {
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  const shapes = large === undefined ? [triangle(3, 10, 3), triangle(5, 75, 5), triangle(acrossTiles ? -220 : 40, 20, 40)] : [large];
  if (shaderNormal) for (const shape of shapes) shape.setAttribute('normal', new Float32BufferAttribute([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 4));
  const baked = bakeProps({ static: new Group(), whole: shapes.map((geometry, index) => ({ id: `part${index}`, mesh: new Mesh(geometry, material),
    transform: new Matrix4(), partition: 'runs', nativeAttributes: true, compact: true })) });
  const files = baked.tiles.filter(row => row.lod === 0).flatMap(row => row.files);
  const library = { id: 'fine', kind: 'whole' as const, load: 'refine' as const,
    models: shapes.map((_geometry, index) => ({ id: `model${index}`, part: `part${index}`, files })) };
  const weld = parseWorldSceneWeld({ id: 'fabric', root: 'root', nodes: [{ id: 'group', parent: 'root', kind: 'group' }, ...shapes.map((_shape, index) => ({
    id: `draw${index}`, parent: 'group', kind: 'mesh', material: 'stone', geometry: { library: library.id, model: `model${index}` }, sphere: [20, 40, 20, 100],
  }))] });
  for (const shape of shapes) shape.dispose(); material.dispose();
  return { id: 'fine-slabs', library, weld, shardfile: { tiles: baked.tiles, files: baked.files }, assets: baked.assets };
}
function triangles(geometry: BufferGeometry): string[] {
  const keys = Object.keys(geometry.attributes).sort(), count = geometry.index?.count ?? geometry.getAttribute('position').count, result: string[] = [];
  for (let corner = 0; corner < count; corner += 3) {
    const values: unknown[] = [];
    for (let local = 0; local < 3; local++) {
      const vertex = geometry.index?.getX(corner + local) ?? corner + local;
      for (const key of keys) {
        const attribute = geometry.getAttribute(key); if (!(attribute instanceof BufferAttribute)) throw new Error('Expected plain oracle channel');
        const width = attribute.itemSize * attribute.array.BYTES_PER_ELEMENT;
        const storage = new Uint8Array(attribute.array.buffer, attribute.array.byteOffset + vertex * width, width);
        values.push([key, attribute.array.constructor.name, attribute instanceof Float16BufferAttribute ? 'half' : 'plain', attribute.normalized, attribute.gpuType, Array.from(storage)]);
      }
    }
    result.push(JSON.stringify(values));
  }
  return result.sort();
}
function isMesh(node: unknown): node is Mesh { return node instanceof Mesh; }
async function meshes(bytes: Uint8Array): Promise<Mesh[]> {
  const { gltf } = await readSourceModel(bytes), result: Mesh[] = []; gltf.scene.traverse(node => { if (isMesh(node)) result.push(node); }); return result;
}
function release(decodedMeshes: readonly Mesh[]): void { for (const mesh of decodedMeshes) { mesh.geometry.dispose(); for (const material of [mesh.material].flat()) material.dispose(); } }

test.each([false, true])('slabs retain every native triangle and channel bit, shader-normal=%s', async shaderNormal => {
  const input = fixture(shaderNormal), result = await bakeWholeSlabs(input), expected: string[] = [], actual: string[] = [];
  expect(result.library.keys).toHaveLength(1); expect(result.library.keys[0]?.sources).toEqual(input.library.models.map(row => row.id));
  for (const hash of input.shardfile.tiles.flatMap(row => row.files)) {
    const source = input.assets.get(hash); if (source === undefined) throw new Error('Missing source');
    const original = await meshes(source), pieces = wholeGeometryPieces(original);
    try {
      for (const model of input.library.models) {
        const steps = joinWholePieceSteps(pieces.filter(piece => piece.part === model.part));
        for (;;) { const next = steps.next(); if (!next.done) continue; if (next.value === undefined) throw new Error('No oracle');
          expected.push(...triangles(next.value)); next.value.dispose(); break; }
      }
    } finally { for (const piece of pieces) piece.geometry.dispose(); release(original); }
  }
  for (const tile of result.library.tiles) for (const file of tile.files) {
    const source = result.assets.get(file.file); if (source === undefined) throw new Error('Missing slab');
    const decoded = await meshes(source);
    try {
      expect(decoded).toHaveLength(file.chunks.length);
      for (const [index, mesh] of decoded.entries()) {
        const row = file.chunks[index]; if (row === undefined) throw new Error('Missing chunk');
        expect(mesh.userData['slab']).toEqual({ key: row.key, tile: tile.tile, chunk: index });
        expect(mesh.userData['wholePartition']).toBeUndefined();
        const geometry = nativeWholeGeometry(mesh);
        try {
          expect(slabGeometryBytes(geometry)).toBe(row.bytes); expect(row.bytes).toBeLessThanOrEqual(4_000_000);
          actual.push(...triangles(geometry));
          const position = geometry.getAttribute('position'), point = new Vector3();
          for (let vertex = 0; vertex < position.count; vertex++) {
            point.fromBufferAttribute(position, vertex);
            expect(point.x).toBeGreaterThanOrEqual(row.box[0]); expect(point.y).toBeGreaterThanOrEqual(row.box[1]); expect(point.z).toBeGreaterThanOrEqual(row.box[2]);
            expect(point.x).toBeLessThanOrEqual(row.box[3]); expect(point.y).toBeLessThanOrEqual(row.box[4]); expect(point.z).toBeLessThanOrEqual(row.box[5]);
            expect(point.distanceTo(new Vector3(...row.sphere.slice(0, 3)))).toBeLessThanOrEqual(row.sphere[3]);
          }
        } finally { geometry.dispose(); }
      }
    } finally { release(decoded); }
  }
  expect(actual.sort()).toEqual(expected.sort());
  expect(result.report.every(row => row.triangles === row.sourceTriangles)).toBe(true);
  const again = await bakeWholeSlabs(input); expect([...again.assets]).toEqual([...result.assets]); expect(again.library).toEqual(result.library);
});

test.each(['material', 'castShadow', 'receiveShadow', 'castFrom', 'until', 'renderOrder', 'layers', 'frustumCulled', 'visible', 'pose'] as const)('draw key retains independent %s ownership', async field => {
  const input = fixture(), node = input.weld.nodes.find(row => row.id === 'draw1'); if (node?.kind !== 'mesh') throw new Error('No second draw');
  const base = { ...node }, changed = field === 'pose' ? { ...base, transformBits: Array.from(new Uint32Array(new Float64Array([1, 0, 0, 0, 0, 0, 1, 1, 1, 1]).buffer)) }
    : field === 'material' ? { ...base, material: 'other' } : field === 'castFrom' ? { ...base, castFrom: { knob: 'tier.shadow', multiply: 1, add: 0 } }
    : field === 'until' ? { ...base, until: { knob: 'tier.detail', multiply: 1, add: 0 } }
    : field === 'renderOrder' ? { ...base, renderOrder: 4 } : field === 'layers' ? { ...base, layers: 2 }
    : { ...base, [field]: !base[field] };
  const weld: WorldSceneWeld = { ...input.weld, nodes: input.weld.nodes.map(row => row === node ? changed : row) };
  const result = await bakeWholeSlabs({ ...input, weld }); expect(result.library.keys).toHaveLength(2);
});

test.each(['cull-origin', 'parent-visibility'] as const)('equal poses retain independent %s owners', async owner => {
  const input = fixture(), nodes = input.weld.nodes.map(node => node.id === 'draw1' ? { ...node, ...(owner === 'cull-origin' ? { until: 100 } : { parent: 'hidden-group' }) }
    : node.id === 'draw0' && owner === 'cull-origin' ? { ...node, until: 100 } : node);
  const weld = parseWorldSceneWeld({ ...input.weld, nodes: owner === 'parent-visibility' ? [...nodes, { id: 'hidden-group', parent: 'root', kind: 'group', visible: false }] : nodes,
    culls: owner === 'cull-origin' ? [{ roots: ['draw0', 'draw1'], origins: [0, 0, 0, 100, 0, 0], units: [], details: [], hosted: [] }] : [] });
  const result = await bakeWholeSlabs({ ...input, weld });
  const first = result.library.keys.find(key => key.sources.includes('model0')), second = result.library.keys.find(key => key.sources.includes('model1'));
  expect(first).toBeDefined(); expect(second).toBeDefined(); expect(first?.id).not.toBe(second?.id);
  expect(first?.node).toBe('draw0'); expect(second?.node).toBe('draw1');
});

test('partition uses bounded upload owners and preserves tall original triangles', () => {
  const geometry = triangle(5, 0, 5, 170), chunks = partitionSlabGeometry(geometry, 36, new Matrix4(), 1000);
  try { expect(chunks).toHaveLength(1); expect(chunks[0]?.worldHeight).toBe(170); expect(chunks[0]?.maxTriangleHeight).toBe(170);
    expect(chunks.flatMap(row => row.triangles)).toEqual([0]); expect(triangles(chunks[0]?.geometry ?? new BufferGeometry())).toEqual(triangles(geometry)); }
  finally { geometry.dispose(); for (const chunk of chunks) chunk.geometry.dispose(); }
});

test('schema preserves strict bounds, source references and unique tile ownership', async () => {
  const input = fixture(), result = await bakeWholeSlabs(input), tile = result.library.tiles[0]; if (tile === undefined) throw new Error('No tile');
  expect(() => v.parse(WorldSceneSlabsSchema, { ...result.library, tiles: [tile, tile] })).toThrow();
  expect(() => v.parse(WorldSceneSlabsSchema, { ...result.library, extra: true })).toThrow();
  const source = { version: 1, libraries: [input.library, result.library], materials: [], steps: [] };
  expect(parseWorldScenes(source).libraries).toHaveLength(2);
  expect(readSlabLibrary(new TextEncoder().encode(JSON.stringify(result.library)))).toEqual(result.library);
  expect(() => readSlabLibrary(new TextEncoder().encode('{}'))).toThrow();
  expect(() => readSlabLibrary(new Uint8Array([255]))).toThrow();
  expect(() => parseWorldScenes({ ...source, libraries: [result.library] })).toThrow('declared fine');
  const bad = structuredClone(result.library), firstChunk = bad.tiles[0]?.files[0]?.chunks[0];
  if (firstChunk === undefined) throw new Error('Missing admitted fixture chunk');
  firstChunk.bytes = 4_000_001;
  expect(() => v.parse(WorldSceneSlabsSchema, bad)).toThrow();
});

test('missing or changed source bytes refuse before publishing a partial slab', async () => {
  const input = fixture(), missing = new Map(input.assets), hash = input.library.models[0]?.files[0]; if (hash === undefined) throw new Error('No source hash');
  missing.delete(hash); await expect(bakeWholeSlabs({ ...input, assets: missing })).rejects.toThrow('source bytes');
  const wrong = new Map(input.assets), original = wrong.get(hash); if (original === undefined) throw new Error('No source');
  const changed = original.slice(); changed[changed.length - 1] = (changed[changed.length - 1] ?? 0) ^ 1; wrong.set(hash, changed);
  await expect(bakeWholeSlabs({ ...input, assets: wrong })).rejects.toThrow('source bytes');
});

test('upload partition splits before the byte cap without dropping or repeating a triangle', () => {
  const positions: number[] = [];
  for (let i = 0; i < 20; i++) positions.push(5 + i / 100, 1, 5, 6 + i / 100, 1, 5, 5 + i / 100, 2, 6);
  const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(positions, 3));
  const chunks = partitionSlabGeometry(geometry, 36, new Matrix4(), 200);
  try {
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every(chunk => chunk.bytes <= 200)).toBe(true);
    expect(chunks.flatMap(chunk => chunk.triangles).sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(chunks.flatMap(chunk => triangles(chunk.geometry)).sort()).toEqual(triangles(geometry));
    expect(() => partitionSlabGeometry(geometry, 36, new Matrix4(), 10)).toThrow('budget');
  } finally { geometry.dispose(); for (const chunk of chunks) chunk.geometry.dispose(); }
});

test('slab error retains source uncertainty through both model and anchor scale', async () => {
  const input = fixture(); for (const tile of input.shardfile.tiles) tile.geometricError = 0.25;
  const library = { ...input.library, models: input.library.models.map((model, index) => index === 0 ? { ...model, matrix: new Matrix4().makeScale(2, 2, 2).elements } : model) };
  const weld = parseWorldSceneWeld({ ...input.weld, nodes: input.weld.nodes.map(node => node.id === 'draw0'
    ? { ...node, transformBits: Array.from(new Uint32Array(new Float64Array([0, 0, 0, 0, 0, 0, 1, 3, 3, 3]).buffer)) } : node) });
  const result = await bakeWholeSlabs({ ...input, library, weld }), key = result.library.keys.find(row => row.sources.includes('model0'));
  if (key === undefined) throw new Error('Missing scaled key');
  expect(result.library.tiles.flatMap(tile => tile.files).flatMap(file => file.chunks).filter(chunk => chunk.key === key.id).every(chunk => chunk.geometricError >= 0.25 * 2 * 3)).toBe(true);
});


test('height bands split oversized quarters, while a small tile stays one draw', () => {
  const positions = [5, 0, 5, 6, 0, 5, 5, 1, 6, 5, 140, 5, 6, 140, 5, 5, 141, 6,
    7, 0, 5, 8, 0, 5, 7, 1, 6, 7, 140, 5, 8, 140, 5, 7, 141, 6];
  const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(positions, 3));
  const small = partitionSlabGeometry(geometry, 36, new Matrix4(), 200), split = partitionSlabGeometry(geometry, 36, new Matrix4(), 100);
  try {
    expect(small).toHaveLength(1); expect(small[0]?.worldHeight).toBe(141);
    expect(split.length).toBeGreaterThan(1); expect(split.every(chunk => chunk.worldHeight <= 1 && chunk.bytes <= 100)).toBe(true);
    expect(split.flatMap(chunk => triangles(chunk.geometry)).sort()).toEqual(triangles(geometry));
  } finally { geometry.dispose(); for (const chunk of [...small, ...split]) chunk.geometry.dispose(); }
});


test('only a resident cell groups compatible keys across tiles; rings retain independent owners', async () => {
  const input = fixture(false, true);
  const parts = new Map<string, Set<string>>();
  for (const [hash, bytes] of input.assets) {
    const decoded = await meshes(bytes), pieces = wholeGeometryPieces(decoded);
    try { parts.set(hash, new Set(pieces.map(piece => piece.part))); }
    finally { for (const piece of pieces) piece.geometry.dispose(); release(decoded); }
  }
  for (const model of input.library.models) model.files = model.files.filter(hash => parts.get(hash)?.has(model.part));
  const occupied = input.shardfile.tiles[0]; if (occupied === undefined) throw new Error('Missing occupied source tile');
  input.shardfile.tiles.push({ ...occupied, x: 0, z: 0, files: [], triangles: 0, draws: 0, compressed: 0, decoded: 0, gpu: 0 });
  const ring = await bakeWholeSlabs(input);
  const cell = await bakeWholeSlabs({ ...input, shardfile: { ...input.shardfile, ring: 'cell' } });
  expect(ring.library.tiles.length).toBeGreaterThan(1);
  expect(cell.library.tiles).toHaveLength(1);
  expect(cell.library.tiles[0]?.tile).toBe(Math.min(...ring.library.tiles.map(tile => tile.tile)));
  expect(cell.report.reduce((sum, tile) => sum + tile.triangles, 0)).toBe(ring.report.reduce((sum, tile) => sum + tile.triangles, 0));
  const words = async (result: Awaited<ReturnType<typeof bakeWholeSlabs>>): Promise<string[]> => {
    const out: string[] = [];
    for (const bytes of result.assets.values()) {
      const decoded = await meshes(bytes);
      try { for (const mesh of decoded) { const geometry = nativeWholeGeometry(mesh);
        try { out.push(...triangles(geometry)); } finally { geometry.dispose(); } } }
      finally { release(decoded); }
    }
    return out.sort();
  };
  expect(await words(cell)).toEqual(await words(ring));
  expect(cell.library.tiles.flatMap(tile => tile.files.flatMap(file => file.chunks))).toHaveLength(1);
});

const ascending = (values: readonly number[]): boolean => values.every((value, at) => at === 0 || (values[at - 1] ?? Infinity) < value);

test('resident-cell byte splits keep every triangle once, each chunk in source order', () => {
  const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute([
    5, 140, 5, 6, 140, 5, 5, 141, 6, 40, 0, 40, 41, 0, 40, 40, 1, 41,
    -220, 70, -220, -219, 70, -220, -220, 71, -219, 5, 0, 5, 6, 0, 5, 5, 1, 6,
  ], 3));
  const chunks = partitionSlabGeometry(geometry, 0, new Matrix4(), 100, true);
  try {
    expect(chunks).toHaveLength(2);
    expect(chunks.flatMap(chunk => chunk.triangles).sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
    expect(chunks.every(chunk => ascending(chunk.triangles) && chunk.bytes <= 100)).toBe(true);
    expect(chunks.flatMap(chunk => triangles(chunk.geometry)).sort()).toEqual(triangles(geometry));
  } finally { geometry.dispose(); for (const chunk of chunks) chunk.geometry.dispose(); }
});

test('a resident cell splits a spread key into ground-compact chunks, each in source order (NB9)', () => {
  // four clumps 300 m apart, interleaved in source order; each clump alone is under the split floor
  const corners = [[-150, -150], [150, -150], [-150, 150], [150, 150]] as const, perClump = Math.ceil(RESIDENT_SLAB_MIN_BYTES / 42) + 8, positions: number[] = [];
  for (let at = 0; at < perClump * 4; at++) {
    const [x, z] = corners[at % 4] ?? [0, 0], dx = at % 7 * 0.1, y = at % 11;
    positions.push(x + dx, y, z, x + dx + 1, y, z, x + dx, y + 1, z + 1);
  }
  const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(positions, 3));
  const chunks = partitionSlabGeometry(geometry, 0, new Matrix4(), 4_000_000, true);
  try {
    expect(chunks).toHaveLength(4);
    for (const chunk of chunks) {
      const box = chunk.geometry.boundingBox; if (box === null) throw new Error('Missing chunk bounds');
      expect(Math.max(box.max.x - box.min.x, box.max.z - box.min.z)).toBeLessThanOrEqual(RESIDENT_SLAB_GROUND);
      expect(ascending(chunk.triangles)).toBe(true);
      expect(new Set(chunk.triangles.map(ordinal => ordinal % 4)).size).toBe(1);
    }
    expect(chunks.flatMap(chunk => chunk.triangles).sort((a, b) => a - b)).toEqual(Array.from({ length: perClump * 4 }, (_, at) => at));
    // a ring tile's quadrant split is unchanged: the same key stays one chunk under its byte cap
    const ring = partitionSlabGeometry(geometry, 0, new Matrix4(), 4_000_000);
    try { expect(ring).toHaveLength(1); } finally { for (const chunk of ring) chunk.geometry.dispose(); }
  } finally { geometry.dispose(); for (const chunk of chunks) chunk.geometry.dispose(); }
});

test('resident chunks past one bank bank under the fine tile they stand on, else the nearest (NB9)', () => {
  const at = (x: number, z: number, frame = new Matrix4()) => {
    const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute([x - 1, 0, z - 1, x + 1, 0, z - 1, x, 2, z + 1], 3));
    geometry.computeBoundingBox(); return { part: { geometry }, frame };
  };
  // tile (x, z) spans [-250 + 62.5 x, -250 + 62.5 (x + 1)); the cell holds tiles 27 (3, 3) and 36 (4, 4)
  const rows = [at(-40, -40), at(10, 10), at(-60, -50), at(-200, 200), at(-40, -40, new Matrix4().makeTranslation(60, 0, 60))];
  try {
    const banks = residentBanks(rows, [{ x: 3, z: 3 }, { x: 4, z: 4 }]);
    expect([...banks.keys()]).toEqual([27, 36]);
    expect(banks.get(27)).toEqual([rows[0], rows[2], rows[3]]);
    expect(banks.get(36)).toEqual([rows[1], rows[4]]);
  } finally { for (const row of rows) row.part.geometry.dispose(); }
});

test('a near-cap slab leaves upload room for its native instance matrix and colour', async () => {
  const count = 47_619, vertices = count * 3;
  const positions = new Float32Array(vertices * 3), normals = new Int8Array(vertices * 3), colours = new Uint8Array(vertices * 3);
  const faces = new Uint16Array(vertices), offsets = new Float32Array(vertices);
  for (let vertex = 0; vertex < vertices; vertex++) {
    const corner = vertex % 3, x = 3 + Math.floor(vertex / 3) / count;
    positions.set([x + (corner === 1 ? 0.00001 : 0), 10 + (corner === 2 ? 1 : 0), 3 + (corner === 2 ? 1 : 0)], vertex * 3);
    normals.set([0, 127, 0], vertex * 3); colours.set([1, 2, 3], vertex * 3); faces[vertex] = 0x3c00; offsets[vertex] = vertex;
  }
  const geometry = new BufferGeometry().setAttribute('position', new BufferAttribute(positions, 3))
    .setAttribute('normal', new BufferAttribute(normals, 3, true)).setAttribute('color', new BufferAttribute(colours, 3, true))
    .setAttribute('aFace', new Float16BufferAttribute(faces, 1)).setAttribute('aOff', new BufferAttribute(offsets, 1))
    .setIndex(new BufferAttribute(Uint32Array.from({ length: vertices }, (_value, index) => index), 1));
  // The former geometry-only cap accepts this exact native layout as one
  // chunk, but that chunk's real instance attributes cross the upload cap.
  const geometryOnly = partitionSlabGeometry(geometry, 36, new Matrix4());
  try {
    expect(geometryOnly).toHaveLength(1);
    expect((geometryOnly[0]?.bytes ?? 0) + (16 + 3) * Float32Array.BYTES_PER_ELEMENT).toBeGreaterThan(4_000_000);
  } finally { for (const chunk of geometryOnly) chunk.geometry.dispose(); }
  const result = await bakeWholeSlabs(fixture(false, false, geometry));
  const chunks = result.library.tiles.flatMap(tile => tile.files.flatMap(file => file.chunks));
  expect(chunks.length).toBeGreaterThan(1);
  expect(Math.max(...chunks.map(chunk => chunk.bytes))).toBeGreaterThan(3_900_000);
  for (const chunk of chunks) expect(chunk.bytes + (16 + 3) * Float32Array.BYTES_PER_ELEMENT).toBeLessThanOrEqual(4_000_000);
  expect(result.report.reduce((sum, row) => sum + row.triangles, 0)).toBe(count);
});


test('slab raw-copy verification preserves Float64 payloads and shared source bytes', () => {
  for (const shared of [false, true]) {
    const geometry = triangle(5, 0, 5);
    const payload = new Uint32Array([0, 0x80000000, 0x12345678, 0x7ff80001, 1, 0]);
    geometry.setAttribute('raw64', new BufferAttribute(new Float64Array(payload.buffer), 1));
    if (shared) {
      const position = geometry.getAttribute('position');
      const values = new Float32Array(new SharedArrayBuffer(position.array.byteLength));
      values.set(position.array);
      geometry.setAttribute('position', new BufferAttribute(values, 3));
    }
    const chunks = partitionSlabGeometry(geometry, 36, new Matrix4(), 1000);
    try {
      expect(chunks).toHaveLength(1);
      const actual = chunks[0]?.geometry.getAttribute('raw64').array;
      if (actual === undefined) throw new Error('Missing raw slab payload');
      expect(new Uint8Array(actual.buffer, actual.byteOffset, actual.byteLength))
        .toEqual(new Uint8Array(payload.buffer));
    } finally { geometry.dispose(); for (const chunk of chunks) chunk.geometry.dispose(); }
  }
});

test.each([0, 1, 2, 3])('slab verification still refuses corruption in aligned word byte %s', byte => {
  class CorruptFloat32Array extends Float32Array {
    override set(input: ArrayLike<number>, offset = 0): void {
      super.set(input, offset);
      const bytes = new Uint8Array(this.buffer, this.byteOffset, this.byteLength);
      bytes[byte] = (bytes[byte] ?? 0) ^ 1;
    }
  }
  const geometry = triangle(5, 0, 5), position = geometry.getAttribute('position');
  geometry.setAttribute('position', new BufferAttribute(new CorruptFloat32Array(position.array), 3));
  try { expect(() => partitionSlabGeometry(geometry, 36, new Matrix4(), 1000)).toThrow('Slab channel copy differs'); }
  finally { geometry.dispose(); }
});
