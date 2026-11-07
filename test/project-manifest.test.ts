// oxlint-disable-next-line import/no-nodejs-modules -- The packer consumes actual inert image fixture bytes.
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parseManifestMetadata } from '@wildshard/format/minimap';
import { manifestImages, packManifestImages } from '@wildshard/sharddev/projectManifest';
import { emitNamedBlobs } from '@wildshard/sharddev/blobs';
import metadata from '../src/shards/far-reach/manifest.json';
import template from '../src/shards/_template/data/card.json' with { type: 'json' };

it('packs all level image fields once by content hash with exact admitted bytes', () => {
  const input = parseManifestMetadata(metadata), bytes = Uint8Array.from(readFileSync('test/fixtures/world-source/image.png'));
  const images = new Map(manifestImages(input).map(row => [row.url, bytes]));
  const result = packManifestImages('far-reach', input, images);
  expect(result.blobs).toHaveLength(1);
  const blob = result.blobs[0]; if (blob === undefined) throw new Error('Packed image missing');
  expect(blob.bytes).toEqual(bytes); expect(blob.file.kind).toBe('image');
  expect(result.manifest.card.thumb).toBe(`/shardfiles/far-reach/${blob.file.path}`);
  expect(result.manifest.card.portrait).toBe(result.manifest.card.thumb);
  expect(result.manifest.explore.art.world).toBe(result.manifest.card.thumb);
  expect(result.manifest.minimap.image).toBe(result.manifest.card.thumb);
  expect(emitNamedBlobs(result.blobs).files).toHaveLength(1);
  expect(input.card.thumb).toBe(metadata.card.thumb);
  bytes.fill(0); expect(blob.bytes).not.toEqual(bytes);
});
it('keeps inert inline images and refuses missing bytes or folder escapes', () => {
  const input = parseManifestMetadata(template), bytes = Uint8Array.from(readFileSync('test/fixtures/world-source/image.png'));
  const images = new Map(manifestImages(input).filter(row => !row.url.startsWith('data:image/')).map(row => [row.url, bytes]));
  expect(packManifestImages('_template',input,images).manifest.card).toEqual(input.card);
  expect(() => packManifestImages('_template',input,new Map())).toThrow('missing');
  expect(() => packManifestImages('../escape',input,images)).toThrow('output folder');
});

it('defers only Explorer image hashes with no card, map, sky or horizon alias', () => {
  const input = parseManifestMetadata(metadata), early = Uint8Array.from(readFileSync('test/fixtures/world-source/image.png')),
    late = Uint8Array.from(readFileSync('test/fixtures/world-source/image.webp'));
  input.explore.art.world = '/assets/fixture-explorer.webp';
  const images = new Map(manifestImages(input).map(row => [row.url, row.url === input.explore.art.world ? late : early]));
  const result = packManifestImages('far-reach', input, images), blob = result.blobs.find(row => row.bytes.length === late.length);
  if (blob === undefined) throw new Error('Missing Explorer fixture image');
  expect(result.late).toEqual([{hash:blob.file.hash}]);
  const shared = new Map(manifestImages(input).map(row => [row.url, early]));
  expect(packManifestImages('far-reach', input, shared).late).toEqual([]);
  expect(result.blobs.find(row => row.file.hash === blob.file.hash)?.bytes).toEqual(late);
});
