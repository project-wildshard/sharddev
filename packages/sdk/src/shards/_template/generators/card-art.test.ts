// oxlint-disable-next-line import/no-nodejs-modules -- Read the template's card files from disk.
import { existsSync, readFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Read the template's card files from disk.
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import manifest from '../manifest.json' with { type: 'json' };
import card from '../data/card.json' with { type: 'json' };

// Jake, 2026-11-12 17:14 Cancún: "you have to update the hero images for the templates". Template rev 2 shipped the grey
// placeholder SVG on Shard select. Its card is its own in-engine hero (card/), never a data: placeholder.
const FOLDER = resolve(import.meta.dirname, '..');
const PREFIX = '/src/shards/_template/';
const SIZE = { thumb: [640, 360], portrait: [804, 1626], landscape: [1600, 900] } as const;

/** A baseline JPEG's pixel size, from its SOF0 or SOF2 frame header. */
function jpegSize(bytes: Uint8Array): readonly [number, number] {
  for (let at = 2; at + 9 < bytes.length;) {
    const marker = bytes[at + 1] ?? 0, length = ((bytes[at + 2] ?? 0) << 8) | (bytes[at + 3] ?? 0);
    if (marker === 0xc0 || marker === 0xc2) return [((bytes[at + 7] ?? 0) << 8) | (bytes[at + 8] ?? 0), ((bytes[at + 5] ?? 0) << 8) | (bytes[at + 6] ?? 0)];
    at += 2 + length;
  }
  throw new Error('No JPEG frame header');
}

test('the Template card is its own captured hero, the same in manifest.json and data/card.json', () => {
  expect(card.card).toEqual(manifest.card);
  for (const [slot, [width, height]] of Object.entries(SIZE)) {
    const url = (manifest.card as Record<string, string>)[slot] ?? '';
    expect(url.startsWith(PREFIX), `${slot}: ${url.slice(0, 40)}`).toBe(true);
    const file = resolve(FOLDER, url.slice(PREFIX.length));
    expect(existsSync(file), file).toBe(true);
    expect(jpegSize(readFileSync(file))).toEqual([width, height]);
  }
});
