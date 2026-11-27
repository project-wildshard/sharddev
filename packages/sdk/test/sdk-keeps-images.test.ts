// SF18 (meta standalone shardfiles, J525): a shardfile carries images only and the cook makes every KTX2, so the SDK's
// build keeps each texture it bakes as a PNG or JPEG. Guard: an authored world GLB's embedded images, a prop's colour
// texture and a scene's painted map all reach the product as `image` files, and no file or GLB carries a KTX2.
import { BoxGeometry, DataTexture, Group, Matrix4, Mesh, MeshStandardMaterial } from 'three';
import { NodeIO } from '@gltf-transform/core';
import sharp from 'sharp';
import { expect, test } from 'vitest';
import { emptyShardfile } from '@wildshard/engine/host/author';
import type { Shardfile } from '@wildshard/format/shardSchema';
import { bakeAuthoredWorld } from '../src/sharddev/bake/authoredWorld';
import { bakeProps } from '../src/sharddev/bake/props';
import { staticGlb } from '../src/sharddev/bake/glb';
import { pngFromPixels, textureKind } from '../src/sharddev/bake/imageBlob';
import { readImagePixels } from '../src/sharddev/bake/image';
import { lowerShard } from '../src/sharddev/scene/lower';
import { sceneShardfile } from '../src/sharddev/scene/shardfile';

const KTX2_MAGIC = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb];
const isKtx2 = (bytes: Uint8Array): boolean => KTX2_MAGIC.every((value, at) => bytes[at] === value);
const glbJson = (bytes: Uint8Array): string => new TextDecoder().decode(bytes.subarray(20, 20 + new DataView(bytes.buffer, bytes.byteOffset).getUint32(12, true)));

/** Nothing in the product is a KTX2: no `ktx2` row, no KTX2 bytes, no GLB naming `image/ktx2` or `KHR_texture_basisu`. */
function expectImagesOnly(files: Shardfile['files'], assets: ReadonlyMap<string, Uint8Array>): void {
  expect(files.filter(row => row.kind === 'ktx2')).toEqual([]);
  for (const [hash, bytes] of assets) {
    expect(isKtx2(bytes), hash).toBe(false);
    if (files.find(row => row.hash === hash)?.kind === 'glb') expect(glbJson(bytes)).not.toMatch(/image\/ktx2|KHR_texture_basisu/u);
  }
}

const pixels = new Uint8ClampedArray([200, 40, 30, 255, 30, 200, 40, 255, 40, 30, 200, 255, 250, 250, 250, 255]);

test('the lossless PNG writer keeps every texel, deterministically', async () => {
  const png = pngFromPixels({ width: 2, height: 2, pixels });
  expect(textureKind(png)).toBe('image');
  expect(pngFromPixels({ width: 2, height: 2, pixels })).toEqual(png);
  expect((await readImagePixels(png)).pixels).toEqual(pixels);
  expect(textureKind(Uint8Array.from(KTX2_MAGIC))).toBe('ktx2');
});

test('an authored world GLB keeps its PNG as itself and its WebP as a lossless PNG; no KTX2', async () => {
  const floor = new BoxGeometry(500, 1, 500), material = new MeshStandardMaterial(), box = new BoxGeometry(2, 2, 2), lampMaterial = new MeshStandardMaterial(), postMaterial = new MeshStandardMaterial();
  material.name = 'Ground'; lampMaterial.name = 'Lamp'; postMaterial.name = 'Post';
  try {
    const plain = staticGlb([{ geometry: floor, material, name: 'collide_floor', transform: new Matrix4().makeTranslation(0, -0.5, 0) },
      { geometry: box, material: lampMaterial, name: 'lamp', transform: new Matrix4().makeTranslation(-220, 1, -220) },
      { geometry: box, material: postMaterial, name: 'post', transform: new Matrix4().makeTranslation(100, 1, 100) }]);
    const png = pngFromPixels({ width: 2, height: 2, pixels });
    const webp = new Uint8Array(await sharp(Buffer.from(pixels), { raw: { width: 2, height: 2, channels: 4 } }).webp({ lossless: true }).toBuffer());
    const io = new NodeIO(), doc = await io.readBinary(plain), root = doc.getRoot();
    const light = root.listMaterials().find(row => row.getName() === 'Lamp'), post = root.listMaterials().find(row => row.getName() === 'Post');
    if (light === undefined || post === undefined) throw new Error('fixture materials missing');
    light.setBaseColorTexture(doc.createTexture('lamp').setImage(png).setMimeType('image/png'));
    post.setBaseColorTexture(doc.createTexture('post').setImage(webp).setMimeType('image/webp'));
    doc.createExtension((await import('@gltf-transform/extensions')).EXTTextureWebP).setRequired(true);
    const bytes = await io.writeBinary(doc);
    const source = { ...emptyShardfile({ slug: 'kept-images', name: 'Kept images', author: 'Test', seed: 1, revision: 1 }),
      world: { glb: 'world.glb', colliders: 'nodes:collide_', materials: { Ground: 'pbr', Lamp: 'pbr', Post: 'pbr' } } };
    const { shard, assets } = await bakeAuthoredWorld(source, bytes);
    expectImagesOnly(shard.files, assets);
    const images = shard.files.filter(row => row.kind === 'image');
    expect(images).toHaveLength(2);
    const kept = images.map(row => assets.get(row.hash)).filter(value => value !== undefined);
    expect(kept.some(value => Buffer.from(value).equals(Buffer.from(png)))).toBe(true);
    for (const value of kept) expect((await readImagePixels(value)).pixels).toEqual(pixels);
    // each binding names an image file the tiles depend on
    const bound = Object.values(shard.props?.materials ?? {}).flatMap(row => row.colour === null ? [] : [row.colour.file]);
    expect(bound.toSorted()).toEqual(images.map(row => row.hash).toSorted());
  } finally { floor.dispose(); material.dispose(); box.dispose(); lampMaterial.dispose(); postMaterial.dispose(); }
});

test('a prop colour texture is carried as its PNG; no KTX2', () => {
  const scene = new Group(), geometry = new BoxGeometry(2, 2, 2), material = new MeshStandardMaterial(), box = new Mesh(geometry, material);
  box.position.set(-220, 1, -220); scene.add(box); scene.updateMatrixWorld(true);
  try {
    const png = pngFromPixels({ width: 2, height: 2, pixels }), baked = bakeProps({ static: scene, colourTexture: png });
    expectImagesOnly(baked.files, baked.assets);
    const colour = baked.props.textures[0]?.colour;
    expect(baked.files.find(row => row.hash === colour)?.kind).toBe('image');
    expect(baked.assets.get(colour ?? '')).toEqual(png);
  } finally { geometry.dispose(); material.dispose(); }
});

test('a scene\'s painted map is a lossless PNG image; no KTX2', async () => {
  const map = new DataTexture(new Uint8Array(pixels), 2, 2); map.needsUpdate = true;
  const { shard, assets } = sceneShardfile(lowerShard({ slug: 'painted', name: 'Painted' }, world => {
    world.part('crate', part => { const crate = new Mesh(new BoxGeometry(2, 2, 2), new MeshStandardMaterial({ map })); crate.position.set(10, 1, 10); part.add(crate); });
  }));
  expectImagesOnly(shard.files, assets);
  const images = shard.files.filter(row => row.kind === 'image');
  expect(images).toHaveLength(1);
  const png = assets.get(images[0]?.hash ?? '');
  expect(png === undefined ? undefined : (await readImagePixels(png)).pixels).toEqual(pixels);
});
