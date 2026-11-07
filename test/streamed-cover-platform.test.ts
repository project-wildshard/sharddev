import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { BoxGeometry, ClampToEdgeWrapping, Color, Group, InstancedMesh, Matrix4, MeshBasicMaterial, MeshStandardMaterial, Texture, Vector3 } from 'three';
import * as assets from '../src/client/engine/core/assets';
import { Scope } from '../src/shared/engine/app/scope';
import { CellWindow, instanceTier } from '../src/client/engine/render/streamedInstances';
import { setTerrainHeight } from '../src/shared/engine/world/terrainHeight';
import { ToonLook } from '../src/client/engine/render/families/toon';
import { parseStreamedCover } from '@wildshard/format/streamedCover';
import { createStreamedCover } from '../src/client/game/looks/streamedCover';
import { toonLighting } from '../src/client/game/looks/toonLighting';
import { lendLooks } from '../src/client/game/shardfile/lentLooks';
import { SceneHandles } from '../src/client/game/shardfile/sceneHandles';
import authored from '../src/shards/driftwood-isle/data/groundCover.json';
import { createCoverAppearance } from '../src/client/game/looks/coverAppearance';
import { createShardProduct } from '../src/shared/game/shardfile/shardProduct';
import { emptyShardfile } from '../src/sharddev/author';
import appearanceRows from '../src/shards/pine-hollow/data/coverAppearance.json';

// A fictional second shard has different models, graph ids, capacities and bands.
// It drives the actual decoder, instance buffers and graph uniform binding.
const row = {
  cell: 16, refill: 4, cacheMin: 16, growShare: .25, farRefill: 8, farSlack: 4,
  farIn: .5, eyeSlack: 1, uploadBytes: 128, nearLag: 1,
  look: 'marsh-cover', meshPrefix: 'marsh-', lighting: 'marsh-light',
  params: { reach: 'reach', lodReach: 'farReach', mode: 'mode', keep: 'keep', viewer: 'player', slope: 'reachUp', growIn: 'farIn' },
  reachK: { phone: 1, desktop: 1 }, capK: { phone: 1, desktop: 1 }, farBudgetMs: { phone: 10, desktop: 10 },
  slopeReach: { up: 1, lo: .01, hi: .1, fadeFrom: 3, fadeTo: 10 },
  kinds: [{ name: 'reed', geometry: 'reed-model', cap: 10, reach: [4, 12], scale: [1, 2],
    far: { geometry: 'reed-card', reach: [10, 24], cap: 10, keep: 1 } }],
};
let owner = new Scope('streamed-cover-fixture');

test('cell windows borrow authored rows and accept explicit decoded cells', () => {
  const source = [4, 9], cache = new CellWindow(16, [{ cx: -1, cz: 2, value: source }]);
  expect(cache.get(-1, 2)).toBe(source);
  expect(cache.has(-1, 2)).toBe(true);
  expect(cache.get(10, 10)).toBeUndefined();
  const decoded = [7];
  expect(cache.set(10, 10, decoded)).toBe(decoded);
  expect(cache.get(10, 10)).toBe(decoded);
  cache.clear();
  expect(cache.has(-1, 2)).toBe(false);
  expect(cache.get(-1, 2)).toBe(source);
  expect(cache.get(10, 10)).toBeUndefined();
  expect(() => new CellWindow(0)).toThrow('Invalid cell');
  expect(() => new CellWindow(16, [{ cx: 0.5, cz: 0, value: [] }])).toThrow('Invalid cell');
  expect(() => new CellWindow(16, [{ cx: 0, cz: 0, value: [] }, { cx: 0, cz: 0, value: [] }])).toThrow('Duplicate cell');
});

beforeEach(() => { owner = new Scope('streamed-cover-fixture'); });
afterEach(() => { owner.dispose(); setTerrainHeight(() => 0); vi.restoreAllMocks(); });

/** Version-1 cell bytes: two cells, one reed per cell, tint + normal + surface colour. */
function cells(): Uint8Array {
  const bytes = new Uint8Array(40 + 2 * 22), d = new DataView(bytes.buffer);
  [0x43435357, 1, 16, 32768, 32768, 2, 1, 1, 1].forEach((value, i) => d.setUint32(i * 4, value, true));
  d.setUint16(36, 1, true); d.setUint16(38, 1, true);
  for (let i = 0; i < 2; i++) {
    const at = 40 + i * 22;
    d.setUint16(at, Math.round(1.5 / 17 * 65535), true);
    d.setUint16(at + 2, Math.round(.5 / 17 * 65535), true);
    d.setUint16(at + 4, 8192, true); // y ≈ 0
    d.setUint16(at + 6, 60000, true); // yaw selects an edge near the end of the band
    d.setUint8(at + 8, 128); // scale ≈ 1.5
    bytes.fill(128, at + 9, at + 12); bytes.fill(64, at + 14, at + 22);
  }
  return bytes;
}
function fixture() {
  const resources = new SceneHandles({ setupMaterial: () => undefined });
  resources.publish('reed-model', new BoxGeometry()); resources.publish('reed-card', new BoxGeometry());
  const toon = new ToonLook(), params = new Map<string, unknown>();
  const light = toonLighting({ id: row.lighting, initial: { uToonLift: [.1, .2, .3], uToonRim: [.3, .2, .1],
    uCloudShadow: .6, uToonNight: 0, uSeaLevel: 2, uCloudTime: 3 } });
  lendLooks(owner, { toon, materials: new Map(['marsh-cover-reed', 'marsh-cover-reed-far'].map(id => [id, new MeshBasicMaterial()])),
    setParam: (id, key, value) => { params.set(`${id}/${key}`, typeof value === 'number' || typeof value === 'boolean' ? value : value.slice()); }, setTexture: () => undefined, bindMeshMap: () => new MeshBasicMaterial() });
  return { resources, toon, params, light };
}

test('admits shipping rows and rejects executable or invalid stream declarations', () => {
  expect(parseStreamedCover(authored.GROUND_COVER).kinds).toHaveLength(8);
  expect(parseStreamedCover(row).look).toBe('marsh-cover');
  expect(() => parseStreamedCover({ ...row, heightAt: () => 0 })).toThrow('plain JSON');
  expect(() => parseStreamedCover({ ...row, nearLag: 4 })).toThrow();
  expect(() => parseStreamedCover({ ...row, kinds: [...row.kinds, ...row.kinds] })).toThrow();
});

test('streams a fictional marsh with preserved decoded transforms, attributes and far handover', () => {
  const { resources, toon, params, light } = fixture();
  const stream = createStreamedCover(resources, row, cells());
  for (let frame = 0; frame < 10; frame++) stream.update(1 / 60, new Vector3());
  const shown = stream.group.children.filter((mesh): mesh is InstancedMesh => mesh instanceof InstancedMesh && mesh.count > 0);
  expect(shown.map(mesh => [mesh.name, mesh.count])).toEqual([['marsh-reed-far', 1], ['marsh-reed', 1]]);
  const near = shown.find(mesh => mesh.name === 'marsh-reed');
  if (near === undefined) throw new Error('Missing near tier');
  expect(near.instanceMatrix.array[15]).toBe(1);
  expect(near.instanceMatrix.array[12]).toBeCloseTo(1, 3);
  expect(near.geometry.getAttribute('aGround').getX(0)).toBeCloseTo(64 / 255);
  expect(near.instanceColor?.getX(0)).toBeCloseTo(256 / 255);
  expect(params.get('marsh-cover-reed/mode')).toBe(1);
  expect(params.get('marsh-cover-reed-far/mode')).toBe(2);
  expect(toon.uniforms.famToonLift.value).toEqual(light.uToonLift.value);
  expect(stream.stats.nearRefills).toBe(1); expect(stream.stats.farSwaps).toBe(1);
  stream.update(1 / 60, new Vector3(1000, 30, 1000));
  expect(params.get('marsh-cover-reed/player')).toEqual([1000, 30, 1000]);
  expect(params.get('marsh-cover-reed/reachUp')).toBe(0);
  expect(stream.stats.nearRefills).toBe(2);
  for (let frame = 0; frame < 10; frame++) stream.update(1 / 60, new Vector3(1000, 30, 1000));
  expect(stream.group.children.filter((mesh): mesh is InstancedMesh => mesh instanceof InstancedMesh).every(mesh => mesh.count === 0)).toBe(true);
});

test('refuses truncated, oversized or mismatched baked kind inventories', () => {
  const { resources } = fixture();
  expect(() => createStreamedCover(resources, row, cells().subarray(0, 50))).toThrow('corrupt');
  const oversized = cells(); new DataView(oversized.buffer).setUint32(20, 0xffffffff, true);
  expect(() => createStreamedCover(resources, row, oversized)).toThrow('bounds');
  const mismatch = { ...row, kinds: [...row.kinds, { ...row.kinds[0], name: 'rush' }] };
  expect(() => createStreamedCover(resources, mismatch, cells())).toThrow();
});

test('uploads only complete instances within a byte budget and swaps complete twins', () => {
  const parent = new Group(), tier = instanceTier(parent, 'fixture', new BoxGeometry(), new MeshBasicMaterial(), 4, [{ name: 'aTint', size: 3 }]);
  tier.begin(); tier.n = 3;
  expect(tier.upload(tier.bytesPer - 1)).toBe(0);
  expect(tier.upload(tier.bytesPer * 2)).toBe(tier.bytesPer * 2);
  expect(tier.uploaded).toBe(false); expect(tier.shown.count).toBe(0);
  expect(tier.upload(tier.bytesPer)).toBe(tier.bytesPer);
  expect(tier.uploaded).toBe(true); tier.swap(); expect(tier.shown.count).toBe(3);
  tier.begin(); tier.n = 1; tier.upload(Infinity); tier.swap();
  expect(tier.shown.count).toBe(1); expect(tier.back.count).toBe(0);
});

test('binds fixed and streamed appearances through the same data-only host', () => {
  const { params } = fixture();
  const fixed = createCoverAppearance({ kinds: [{ id: 'tuft', graph: 'marsh-cover-reed', attributes: { aWind: .35 },
    name: 'fern', properties: { alphaTest: .5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 } }],
    params: { viewer: 'eye', shift: 'origin', sunTint: 'sun' } });
  const geometry = new BoxGeometry(), material = fixed.material('tuft');
  expect(fixed.geometry('tuft', geometry)).toBe(geometry);
  expect(Array.from(geometry.getAttribute('aWind').array).every(value => Math.abs(value - .35) < 1e-7)).toBe(true);
  expect(material.name).toBe('fern'); expect(material.alphaTest).toBe(.5);
  expect(material.polygonOffset).toBe(true); expect(material.polygonOffsetFactor).toBe(-2);
  fixed.update(new Vector3(1, 2, 3), new Matrix4().makeTranslation(10, 20, 30), new Color(.2, .3, .4));
  expect(params.get('marsh-cover-reed/eye')).toEqual([11, 22, 33]);
  expect(params.get('marsh-cover-reed/origin')).toEqual([10, 20, 30]);
  expect(params.get('marsh-cover-reed/sun')).toEqual([.2, .3, .4]);
  const stream = createCoverAppearance({ kinds: [{ id: 'reed', graph: 'marsh-cover-reed-far' }], params: { viewer: 'eye' } });
  stream.update(new Vector3(7, 8, 9));
  expect(params.get('marsh-cover-reed-far/eye')).toEqual([7, 8, 9]);
  expect(() => createCoverAppearance({ ...appearanceRows, textures: {} })).toThrow('declared');
  expect(() => createCoverAppearance({ kinds: [{ id: 'bad', graph: 'x', onBuild: () => 0 }] })).toThrow('plain JSON');
  expect(() => fixed.material('missing')).toThrow('Missing cover kind');
  geometry.dispose(); material.dispose();
});

test('preserves painted texture sampling, shares acquisition and retries retired resources', async () => {
  lendLooks(owner, { materials: new Map([['painted-leaf', owner.own(new MeshStandardMaterial())]]), setParam: () => undefined, setTexture: () => undefined,
    bindMeshMap: (_id, source) => { if (!(source instanceof Texture)) throw new Error('Leaf needs a texture'); return owner.own(new MeshStandardMaterial({ map: source })); } });
  const field = createCoverAppearance({ textures: { leaf: { url: 'textures/leaf.webp', srgb: true, repeat: false } }, kinds: [{ id: 'leaf', graph: 'painted-leaf', texture: 'leaf' }] });
  const product = createShardProduct({ slug: 'marsh', revision: 1, shardfile: emptyShardfile({ slug: 'marsh', name: 'Marsh', author: 'fixture', revision: 1, seed: 1 }),
    sections: new Map(), files: new Map([['textures/leaf.webp', { hash: 'leaf', url: 'https://cover.invalid/textures/leaf.webp' }]]), read: () => Promise.resolve(new Uint8Array()) });
  const loader = vi.spyOn(assets, 'loadTexture').mockImplementation((_url, _srgb, _repeat, _size, configure) => {
    const texture = new Texture(); configure?.(texture); return Promise.resolve(texture);
  });
  const first = field.texture(product, 'leaf'), concurrent = field.texture(product, 'leaf');
  expect(concurrent).toBe(first);
  const texture = await first;
  expect(texture.wrapS).toBe(ClampToEdgeWrapping); expect(texture.wrapT).toBe(ClampToEdgeWrapping);
  expect(loader.mock.calls[0]?.slice(0, 4)).toEqual(['https://cover.invalid/textures/leaf.webp', true, 1, undefined]);
  await field.prepare(product); const originalMaterial = field.mapped('leaf');
  expect(originalMaterial.map).toBe(texture);
  texture.dispose();
  loader.mockRejectedValueOnce(new Error('offline'));
  await expect(field.texture(product, 'leaf')).rejects.toThrow('offline');
  const replacement = await field.texture(product, 'leaf');
  expect(replacement).not.toBe(texture); expect(loader).toHaveBeenCalledTimes(3);
  await field.prepare(product);
  expect(field.mapped('leaf')).not.toBe(originalMaterial); expect(field.mapped('leaf').map).toBe(replacement);
  replacement.dispose();
});
