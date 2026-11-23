// oxlint-disable-next-line import/no-nodejs-modules -- Exercise actual authored source and output folders.
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Test output stays in owned repository scratch.
import { resolve } from 'node:path';
import { afterAll, expect, test } from 'vitest';
import { JournalRowSchema } from '@wildshard/format/compendiumRows';
import { parse } from 'valibot';
import { emptyShardfile } from '@wildshard/sdk/author';
import { buildProject } from './project';
import { validateOutputProduct, writeOutputProduct } from '@wildshard/sdk/outputProduct';
import { settleHandwrittenCreatureLayers } from '@wildshard/sdk/internal/handwrittenCreatureLayers';
import { closeFixtures, fixtureRoot } from '@wildshard/sdk/internal/test/ownedScratch';

afterAll(closeFixtures);
const own = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><circle cx="4" cy="4" r="3"/></svg>')}`;
const image = { entryKind: 'species', matchKind: 'own.boar', image: own, tint: 'currentColor' };
function journal(icons: readonly unknown[]) {
  return { kind: 'journal', id: 'journal.fixture', chunkId: 'journal-source', className: 'journal', title: 'Icons',
    tabs: [{ id: 'beasts', label: 'Beasts' }], stamp: { place: 'Seen', default: 'Taken' }, stats: { place: [], default: [] }, entries: [], icons };
}
// `raw` skips the row parse: format 0.56 refuses a glyph selector itself, so a legacy row can only arrive unparsed.
function fixture(icons: readonly unknown[], raw = false) {
  const source = emptyShardfile({ slug: 'journal-source', name: 'Journal', author: 'Test', saveRevision: 1, seed: 17 });
  source.rows.compendiums = [raw ? journal(icons) as never : parse(JournalRowSchema, journal(icons))];
  source.budgets.library.resident = 512;
  return source;
}
test('normal SDK build and handwritten settlement preserve the authored image selector', async () => {
  const root = fixtureRoot('journal-icons-');
  try {
    const source = fixture([image]), text = JSON.stringify(source);
    writeFileSync(resolve(root, 'data.json'), text);
    writeFileSync(resolve(root, 'shard.config.ts'), "import input from './data.json' with { type: 'json' };\nexport default input;\n");
    await buildProject(root, resolve(root, 'built'), { client: null });
    const built = validateOutputProduct(resolve(root, 'built'));
    writeOutputProduct(source, new Map(), resolve(root, 'handwritten'));
    const settled = settleHandwrittenCreatureLayers(resolve(root, 'handwritten'), resolve(root, 'settled'));
    expect(built.shard.rows.compendiums).toEqual(source.rows.compendiums);
    expect(settled.shard.rows.compendiums).toEqual(source.rows.compendiums);
    expect(readFileSync(resolve(root, 'data.json'), 'utf8')).toBe(text);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the format, new builds and handwritten products refuse a legacy glyph selector', async () => {
  const root = fixtureRoot('journal-glyph-');
  try {
    const legacy = { entryKind: 'species', matchKind: 'own.boar', icon: 'boar' };
    expect(() => parse(JournalRowSchema, journal([legacy]))).toThrow(/image/u);
    const source = fixture([legacy], true);
    writeFileSync(resolve(root, 'data.json'), JSON.stringify(source));
    writeFileSync(resolve(root, 'shard.config.ts'), "import input from './data.json' with { type: 'json' };\nexport default input;\n");
    // a handwritten product can no longer even be written with one, so there is nothing for settlement to refuse
    expect(() => { writeOutputProduct(source, new Map(), resolve(root, 'handwritten')); }).toThrow();
    await expect(buildProject(root, resolve(root, 'built'), { client: null })).rejects.toThrow();
  } finally { rmSync(root, { recursive: true, force: true }); }
});
