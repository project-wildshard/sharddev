// oxlint-disable-next-line import/no-nodejs-modules -- Verify the retained lossless KTX2 payload before browser decoding.
import { zstdDecompressSync, zstdCompressSync } from 'node:zlib';
import { expect, test } from 'vitest';
import * as v from 'valibot';
import { BufferAttribute } from 'three';
import { createModelLibrary } from '../../src/client/game/plugin/geometry';
import { readSourceModel } from '../../src/sharddev/bake/skinned';
import { parseKtx2 } from '@wildshard/format/ktx2Cost';
import { textureMipBytes } from '@wildshard/format/contentBounds';
import { rawKtx2, bakeSignalSand } from '../../src/shards/sunscar-dunes/generators/sand';
import { signAtlasBlobs } from '../../src/shards/nine-dragon-stack/generators/signAtlasOutput';
import { parseNativeSignAtlas } from '../../src/shards/nine-dragon-stack/generators/sections';
import { nineSignBlobs } from '../fixtures/nine-sign-blobs';
import { nativeSignAtlas } from '../fixtures/nine-native-atlas';
import { nativeGlyphs } from '../fixtures/nine-native-glyphs';

const atlas = nativeSignAtlas.atlas, glyphs = nativeGlyphs.glyphs;

const read = (file: string): Uint8Array => {
  const bytes = nativeSignAtlas.files.get(file) ?? nativeGlyphs.files.get(file);
  if (bytes === undefined) throw new Error(`Missing native sign fixture ${file}`); return bytes;
};
const blobs = await nineSignBlobs();
const slice = (bytes: Uint8Array, row: { byteOffset: number; byteLength: number }): Uint8Array => bytes.slice(row.byteOffset, row.byteOffset + row.byteLength);

test('native metadata refuses missing tiers, invalid ranges and non-finite light rows', () => {
  expect(() => parseNativeSignAtlas({ phone: atlas.phone })).toThrow();
  expect(() => parseNativeSignAtlas({ ...atlas, phone: { ...atlas.phone, geometries: { invalid: { attributes: {}, index: { byteOffset: -1, byteLength: 4 }, sphere: null } } } })).toThrow();
  expect(() => parseNativeSignAtlas({ ...atlas, desktop: { ...atlas.desktop, lights: [{ at: [0, 0, 0], color: [1, 1, 1], w: 1, h: 1, power: Number.NaN, spill: 0 }] } })).toThrow();
});

test('portable sign assembly reads every supplied native input and keeps the original product', () => {
  const alias = (file: string): string => `provided/${file}`;
  const tier = (key: 'phone' | 'desktop') => ({ ...atlas[key], buffer: alias(atlas[key].buffer),
    mono: { ...atlas[key].mono, packed: alias(atlas[key].mono.packed) },
    colour: { ...atlas[key].colour, packed: alias(atlas[key].colour.packed) } });
  const field = (key: 'phone' | 'desktop') => ({ ...glyphs[key], packed: glyphs[key].packed.map(alias) });
  const reads: string[] = [];
  const supplied = signAtlasBlobs(file => {
    expect(file.startsWith('provided/')).toBe(true); reads.push(file);
    return read(file.slice('provided/'.length));
  }, { atlas: { phone: tier('phone'), desktop: tier('desktop') }, glyphs: { phone: field('phone'), desktop: field('desktop') } });
  expect(new Set(reads).size).toBe(11);
  expect(supplied.map(row => row.file)).toStrictEqual(signAtlasBlobs(read, { atlas, glyphs }).map(row => row.file));
});

test.each(['phone', 'desktop'] as const)('%s decodes native texture storage and charges complete mip residency', tier => {
  const row = atlas[tier];
  for (const name of ['mono', 'colour'] as const) {
    const bytes = read(row[name].packed), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const offset = Number(view.getBigUint64(80, true)), size = Number(view.getBigUint64(88, true));
    const pixels = zstdDecompressSync(bytes.subarray(offset, offset + size));
    expect(view.getUint32(12, true)).toBe(name === 'mono' ? 9 : 43);
    expect(pixels.length).toBe(row[name].bytes);
    expect(parseKtx2(bytes).gpu).toBe(row[name].bytes);
    const admitted = blobs.find(blob => blob.file.name === `signs/atlas-${tier}-${name}.ktx2`);
    const width = view.getUint32(20, true), height = view.getUint32(24, true);
    const levels = 1 + Math.floor(Math.log2(Math.max(width, height)));
    expect(admitted?.file.gpu).toBe(textureMipBytes(width, height, levels, false) / (name === 'mono' ? 4 : 1));
  }

});

test.each(['phone', 'desktop'] as const)('%s restores supplied native buffers through the existing pool host', async tier => {
  const rows = atlas[tier], binary = read(rows.buffer);
  const metadata = blobs.find(blob => blob.file.name === `signs/atlas-${tier}.json`);
  if (metadata === undefined) throw new Error('Missing sign metadata');
  const { pools, channels } = v.parse(v.object({ pools: v.array(v.object({ name: v.string() })),
    channels: v.array(v.object({ name: v.string(), source: v.string(), width: v.number(), parts: v.optional(v.array(v.string())) })) }), JSON.parse(new TextDecoder().decode(metadata.bytes)));
  const source = Object.entries(rows.geometries);
  for (let start = 0; start < source.length; start += 100) {
    const parts = source.slice(start, start + 100), blob = blobs.find(b => b.file.name === pools[start / 100]?.name);
    if (blob === undefined) throw new Error('Missing baked sign pool');
    const names = parts.map(([name]) => name), localChannels = channels.flatMap(({ parts: channelParts, ...row }) => {
      const scopedParts = channelParts?.filter(part => names.includes(part));
      return scopedParts?.length === 0 ? [] : [{ ...row, ...(scopedParts === undefined ? {} : { parts: scopedParts }) }];
    });
    const library = createModelLibrary<never, never>({ meshes: [], meshUrls: {}, hd: [], hdUrls: {}, hdLooks: {}, aoFloor: 1,
      geometryPools: [{ url: 'sign-pool', parts: names, channels: localChannels }] }, 'Nine sign test', {},
    async () => (await readSourceModel(blob.bytes)).gltf);
    await library.preload();
    for (const [name, original] of parts) {
      const geometry = library.geometry(name, { borrow: true });
      if (geometry === null) throw new Error(`Missing restored sign ${name}`);
      expect(Object.keys(geometry.attributes).sort()).toEqual(Object.keys(original.attributes).sort());
      for (const [channel, attribute] of Object.entries(original.attributes)) {
        const actual = geometry.getAttribute(channel);
        if (!(actual instanceof BufferAttribute)) throw new Error('Unexpected sign storage');
        expect(actual.array).toBeInstanceOf(Float32Array); expect(actual.itemSize).toBe(attribute.width); expect(actual.normalized).toBe(false);
        expect(new Uint8Array(actual.array.buffer, actual.array.byteOffset, actual.array.byteLength)).toEqual(slice(binary, attribute.data));
      }
      const index = geometry.index;
      if (index === null) throw new Error('Missing sign index');
      expect(index.array).toBeInstanceOf(Uint32Array);
      expect(new Uint8Array(index.array.buffer, index.array.byteOffset, index.array.byteLength)).toEqual(slice(binary, original.index));
      expect(geometry.boundingBox).toBeNull();
      expect(geometry.boundingSphere === null ? null : [...geometry.boundingSphere.center, geometry.boundingSphere.radius]).toEqual(original.sphere);
    }
  }
}, 30_000);

test('existing Signal sand R8 maps use the same raw texture residency law', () => {
  const sand = bakeSignalSand();
  for (const data of [sand.trail, sand.shadow]) {
    const size = Math.sqrt(data.length), bytes = rawKtx2(size, 1, data, zstdCompressSync);
    expect(parseKtx2(bytes).gpu).toBe(data.length);
  }
});
