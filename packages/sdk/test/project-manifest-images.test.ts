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

// SF4: a zone names a mounted sky set by its stem URL; only an image URL is packed as the painted sky.
test("a sky stem under the zone's folder is not packed as an image", () => {
  const base = { ...metadata, minimap: {}, card: { thumb: image, portrait: image, landscape: image },
    explore: { art: { world: image, models: image, sets: image, practice: image } } };
  const stem = '/assets/pastel-plain/hdri/kloofendal_48d_partly_cloudy_puresky';
  const input = { ...base, sky: { ...(base as { sky?: object }).sky, hdri: stem } };
  expect(manifestImages(parseManifestMetadata(input, 'pastel-plain')).some(row => row.name === 'sky')).toBe(false);
  expect(packManifestImages('pastel-plain', input, new Map()).manifest.sky?.hdri).toBe(stem);
  const painted = { ...base, sky: { ...(base as { sky?: object }).sky, hdri: '/assets/pastel-plain/sky/pano.webp' } };
  expect(manifestImages(parseManifestMetadata(painted, 'pastel-plain')).some(row => row.name === 'sky')).toBe(true);
});
