// oxlint-disable-next-line import/no-nodejs-modules -- Verify the process handoff in an owned scratch directory.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Keep test files under the checkout's ignored scratch root.
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { readCoatFiles, writeCoatFiles } from '../scripts/bake/coatFiles.mjs';

test('coat handoffs keep exact binary subviews, order and names outside JSON', () => {
  const root = mkdtempSync(resolve('tmp/coat-files-')), manifest = resolve(root, 'phone.json');
  const buffer = new Uint8Array([99, 0, 128, 255, 17, 100]);
  const coats = [{ url: '/coat-b.webp', png: buffer.subarray(1, 5) }, { url: '/coat-a.webp', png: new Uint8Array([1, 2, 3]) }];
  try {
    writeCoatFiles(manifest, coats);
    expect(JSON.parse(readFileSync(manifest, 'utf8'))).toEqual([
      { url: '/coat-b.webp', png: 'phone.json.pngs/0.png' }, { url: '/coat-a.webp', png: 'phone.json.pngs/1.png' },
    ]);
    const read = readCoatFiles(manifest);
    expect(read.map(row => row.url)).toEqual(coats.map(row => row.url));
    for (const [index, row] of read.entries()) expect(new Uint8Array(row.png)).toEqual(coats[index]?.png);
    expect(buffer).toEqual(new Uint8Array([99, 0, 128, 255, 17, 100]));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('coat manifests refuse encoded fallback, malformed rows and foreign paths', () => {
  const root = mkdtempSync(resolve('tmp/coat-files-')), manifest = resolve(root, 'phone.json');
  const paths = ['data:image/png;base64,AA==', '../other.png', '/other.png', 'phone.json.pngs/1.png', 'phone.json.pngs/../0.png'];
  try {
    expect(() => writeCoatFiles(manifest, [{ url: 'data:image/png;base64,AA==', png: new Uint8Array([0]) }]))
      .toThrow('BINARY-JSON');
    for (const png of paths) {
      writeFileSync(manifest, JSON.stringify([{ url: '/coat.webp', png }]));
      expect(() => readCoatFiles(manifest)).toThrow('Invalid coat file manifest');
    }
    for (const row of [null, [], {}, { url: '/coat.webp', png: 'phone.json.pngs/0.png', bytes: [0, 1] }]) {
      writeFileSync(manifest, JSON.stringify([row]));
      expect(() => readCoatFiles(manifest)).toThrow('Invalid coat file manifest');
    }
    writeFileSync(manifest, '{}');
    expect(() => readCoatFiles(manifest)).toThrow('Invalid coat file manifest');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('coat handoffs refuse missing files and symlinked payloads', () => {
  const root = mkdtempSync(resolve('tmp/coat-files-')), manifest = resolve(root, 'phone.json');
  try {
    writeFileSync(manifest, JSON.stringify([{ url: '/coat.webp', png: 'phone.json.pngs/0.png' }]));
    expect(() => readCoatFiles(manifest)).toThrow('ENOENT');
    mkdirSync(resolve(root, 'phone.json.pngs'));
    writeFileSync(resolve(root, 'foreign.png'), new Uint8Array([0, 128, 255]));
    symlinkSync(resolve(root, 'foreign.png'), resolve(root, 'phone.json.pngs/0.png'));
    expect(() => readCoatFiles(manifest)).toThrow('Coat file escapes its handoff');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
