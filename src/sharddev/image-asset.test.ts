// oxlint-disable-next-line import/no-nodejs-modules -- Qualification reads the actual authored texture-strip bytes.
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parseImageAsset, parseStillImage } from '@wildshard/format/stillImage';
import { assetCost } from '@wildshard/format/product';
import { validateShardfileAssets } from '@wildshard/format/assetAdmission';
import { emptyShardfile } from '@wildshard/engine/host/author';
import { hashImmutableBytes } from '@wildshard/engine/host/immutable';
import { nameBlob } from '@wildshard/sharddev/blobs';

// A bounded VP8L envelope suffices to exercise rejection before any image decoder.
function envelope(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(26), view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('RIFF'), 0); view.setUint32(4, 18, true);
  bytes.set(new TextEncoder().encode('WEBPVP8L'), 8); view.setUint32(16, 5, true);
  bytes[20] = 0x2f; view.setUint32(21, width - 1 | (height - 1) << 14, true);
  return bytes;
}
it('admits the original 6144x704 horizon as an image blob without changing title limits or bytes', () => {
  const bytes = Uint8Array.from(readFileSync('public/assets/horizon/pine-hollow-day.webp'));
  const image = parseImageAsset(bytes);
  expect(image).toMatchObject({ width: 6144, height: 704, mime: 'image/webp', gpu: 6144 * 704 * 4 });
  expect(assetCost('image', bytes)).toEqual({ decoded: image.decoded, gpu: image.gpu, triangles: 0, draws: 0 });
  const blob = nameBlob('look/horizon-day', 'image', bytes);
  expect(blob.file.path).toMatch(/\.webp$/u); expect(blob.bytes).toEqual(bytes);
  expect(() => parseStillImage(bytes)).toThrow('dimensions');
});
it('refuses over-pixel or over-dimension images and retains the wire bound', () => {
  expect(() => parseImageAsset(envelope(8192, 4096))).toThrow('dimensions');
  expect(() => parseImageAsset(envelope(9000, 100))).toThrow('dimensions');
  expect(() => parseImageAsset(new Uint8Array(4_194_305))).toThrow('wire');
});
it('keeps ordinary image envelopes identical for title and asset admission', () => {
  const bytes = Uint8Array.from(readFileSync('test/fixtures/world-source/image.png'));
  expect(parseImageAsset(bytes)).toEqual(parseStillImage(bytes));
});

it('names the exact asset and understated dimensions before admission', () => {
  const bytes = Uint8Array.from(readFileSync('test/fixtures/world-source/image.png'));
  const hash = hashImmutableBytes(bytes), cost = assetCost('image', bytes);
  const shard = emptyShardfile({ slug: 'asset-cost', name: 'Asset cost', author: 'Test', revision: 1, seed: 1 });
  shard.library = [hash];
  shard.budgets.library = { resident: cost.decoded + cost.gpu, compressed: bytes.length };
  shard.files = [{ hash, kind: 'image', compressed: bytes.length, ...cost, decoded: cost.decoded - 1, gpu: cost.gpu - 1, dependencies: [], critical: false }];
  expect(() => validateShardfileAssets(shard, new Map([[hash, bytes]]), hashImmutableBytes)).toThrow(`asset cost declaration understated: ${hash} (image); decoded ${cost.decoded - 1} < ${cost.decoded}, gpu ${cost.gpu - 1} < ${cost.gpu}`);
});
