import { expect, test } from 'vitest';
import { parseManifestMetadata } from '@wildshard/format/minimap';
import metadata from '../src/shards/pastel-plain/manifest.json' with { type: 'json' };
import { manifestImages, packManifestImages } from '../src/sharddev/projectManifest';

const image = 'data:image/png;base64,AA==';

test('a manifest without a minimap image packs no map blob or invented URL', () => {
  const input = { ...metadata, minimap: {},
    card: { thumb: image, portrait: image, landscape: image },
    explore: { art: { world: image, models: image, sets: image, practice: image } } };
  const parsed = parseManifestMetadata(input, 'pastel-plain');
  expect(manifestImages(parsed).some(row => row.name === 'map')).toBe(false);
  const packed = packManifestImages('pastel-plain', input, new Map());
  expect(packed.manifest.minimap).not.toHaveProperty('image');
  expect(packed.blobs).toEqual([]);
  const withMap = packManifestImages('pastel-plain', { ...input, minimap: { image } }, new Map());
  expect(withMap.manifest.minimap.image).toBe(image);
});
