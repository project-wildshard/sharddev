// oxlint-disable-next-line import/no-nodejs-modules -- Exercise actual authored source and output folders.
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Test output stays in owned repository scratch.
import { resolve } from 'node:path';
import { afterAll, expect, test } from 'vitest';
import { JournalRowSchema } from '@wildshard/format/compendiumRows';
import { parse } from 'valibot';
import { parseImageAsset } from '@wildshard/format/stillImage';
import { emptyShardfile } from './author';
import { expandJournalIconSource } from './journalIconSource';
import { mergeProjectBlobs } from './projectOutput';
import { buildProject } from './project';
import { validateOutputProduct, writeOutputProduct } from './outputProduct';
import { settleHandwrittenCreatureLayers } from './handwrittenCreatureLayers';
import { closeFixtures, fixtureRoot } from './test/ownedScratch';

afterAll(closeFixtures);
const names = ['antlers', 'ghost', 'ironhide', 'deer', 'boar', 'elk', 'bear'];
const own = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><circle cx="4" cy="4" r="3"/></svg>')}`;
function fixture() {
  const source = emptyShardfile({ slug: 'journal-source', name: 'Journal', author: 'Test', revision: 1, seed: 17 });
  source.rows.compendiums = [parse(JournalRowSchema, { kind: 'journal', id: 'journal.fixture', chunkId: 'journal-source', className: 'journal', title: 'Icons',
    tabs: [{ id: 'beasts', label: 'Beasts' }], stamp: { place: 'Seen', default: 'Taken' }, stats: { place: [], default: [] }, entries: [],
    icons: [...names, 'boar'].map(icon => ({ entryKind: 'species', matchKind: `own.${icon}`, icon })) })];
  const row = source.rows.compendiums[0]; if (row === undefined || !('kind' in row) || row.kind !== 'journal') throw new Error('Missing fixture journal');
  row.icons.push({ image: own });
  source.budgets.library.resident = 512;
  return source;
}
test('all seven copied icons become distinct charged named images while selectors and explicit images remain exact', () => {
  const source = fixture(), original = JSON.stringify(source), expanded = expandJournalIconSource(source);
  const merged = mergeProjectBlobs(expanded.shard, new Map(), expanded.blobs);
  const row = merged.shard.rows.compendiums[0]; if (row === undefined || !('kind' in row) || row.kind !== 'journal') throw new Error('Missing compiled journal');
  expect(expanded.blobs).toHaveLength(7); expect(merged.namedFiles).toHaveLength(7);
  expect(merged.shard.library).toHaveLength(7); expect(new Set(row.icons.slice(0, 7).map(icon => 'image' in icon ? icon.image : '')).size).toBe(7);
  expect(row.icons[7]).toEqual(row.icons[4]); expect(row.icons[8]).toEqual({ image: own });
  for (const [index, blob] of expanded.blobs.entries()) {
    expect(row.icons[index]).toEqual({ entryKind: 'species', matchKind: `own.${names[index] ?? ''}`, image: blob.file.hash, tint: 'currentColor' });
    expect(parseImageAsset(blob.bytes)).toMatchObject({ width: 128, height: 128 });
  }
  expect(expandJournalIconSource(merged.shard)).toEqual({ shard: merged.shard, blobs: [] });
  expect(JSON.stringify(source)).toBe(original);
});
test('normal SDK build and handwritten settlement emit the same admitted named icon bytes', async () => {
  const root = fixtureRoot('journal-icons-');
  try {
    const source = fixture(), text = JSON.stringify(source);
    writeFileSync(resolve(root, 'data.json'), text);
    writeFileSync(resolve(root, 'shard.config.ts'), "import input from './data.json' with { type: 'json' };\nexport default input;\n");
    await buildProject(root, resolve(root, 'built'), { client: null });
    const built = validateOutputProduct(resolve(root, 'built'));
    writeOutputProduct(source, new Map(), resolve(root, 'handwritten'));
    const settled = settleHandwrittenCreatureLayers(resolve(root, 'handwritten'), resolve(root, 'settled'));
    expect(settled.shard.rows.compendiums).toEqual(built.shard.rows.compendiums);
    expect(settled.shard.library).toEqual(built.shard.library);
    for (const file of built.index.files.filter(row => row.kind === 'image')) {
      expect(settled.index.files.find(row => row.hash === file.hash)?.name).toBe(file.name);
      expect(settled.assets.get(file.hash)).toEqual(built.assets.get(file.hash));
    }
    expect(readFileSync(resolve(root, 'data.json'), 'utf8')).toBe(text);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
