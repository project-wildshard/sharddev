import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { exportTierProblems, readExportTiers, renderExportTiers, TIER_PAGE } from '../scripts/export-tiers.mjs';

// SHARD-AUTHORING SA5 (J317): every @wildshard/sdk export is classed contract, rows, scripts, bake kit or internal.
const root = resolve(import.meta.dirname, '..');
const { exports, tiers } = readExportTiers(root);

test('every package export has one known tier, and every tier row names an export', () => {
  expect(exportTierProblems(exports, tiers)).toEqual([]);
});
test('an unclassed export, a stale row and an unknown tier each fail', () => {
  expect(exportTierProblems({ ...exports, './brandNew': './src/sharddev/brandNew.ts' }, tiers)).toEqual([expect.stringContaining('unclassed export ./brandNew')]);
  expect(exportTierProblems(exports, { ...tiers, exports: { ...tiers.exports, './gone': 'rows' } })).toEqual([expect.stringContaining('classes ./gone')]);
  expect(exportTierProblems(exports, { ...tiers, exports: { ...tiers.exports, './rows': 'public' } })).toEqual([expect.stringContaining('./rows has unknown tier "public"')]);
  const { internal: _internal, ...described } = tiers.tiers;
  expect(exportTierProblems(exports, { ...tiers, tiers: described })).toEqual([expect.stringContaining('tier "internal" has no description')]);
});
test('the generated API doc shows each export with its tier and is current', () => {
  const page = renderExportTiers(exports, tiers);
  expect(page).toContain('| `@wildshard/sdk/rows` | rows |');
  expect(page).toContain('| `@wildshard/sdk/bake/glb` | bake kit |');
  expect(readFileSync(resolve(root, TIER_PAGE), 'utf8')).toBe(page);
});
test('no shard source imports an internal export', () => {
  const internal = Object.keys(tiers.exports).filter(subpath => tiers.exports[subpath] === 'internal').map(subpath => `@wildshard/sdk/${subpath.slice(2).replace(/\*$/u, '')}`);
  const shards = resolve(root, 'src/shards');
  const files = readdirSync(shards, { recursive: true, encoding: 'utf8' }).filter(file => /\.m?[jt]s$/u.test(file));
  const hits = files.flatMap(file => [...readFileSync(resolve(shards, file), 'utf8').matchAll(/from '(@wildshard\/sdk\/[^']+)'/gu)]
    .filter(([, specifier]) => internal.some(name => name.endsWith('/') ? specifier!.startsWith(name) : specifier === name)).map(([, specifier]) => `${file}: ${specifier}`));
  expect(hits).toEqual([]);
});
