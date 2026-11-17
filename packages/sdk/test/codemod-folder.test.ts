import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, expect, it } from 'vitest';
import codemod, { moveSource } from '../codemods/0.4.0-folder.mjs';

// SHARD-SOURCE SA25b: engine SA25 renamed its `product` modules and names; `update --pins` moves a shard repo's imports.
const scratchRoot = resolve(import.meta.dirname, '../tmp');
mkdirSync(scratchRoot, { recursive: true });
const repo = mkdtempSync(join(scratchRoot, 'codemod-folder-'));
afterAll(() => { rmSync(repo, { recursive: true, force: true }); });

it('moves the engine imports a shard repo has today, and nothing it owns', () => {
  mkdirSync(join(repo, 'test'), { recursive: true });
  mkdirSync(join(repo, 'node_modules/x'), { recursive: true });
  const test = [
    "const { loadHeadlessProduct } = await import('@wildshard/engine/host/headlessProduct');",
    "import { createShardProduct, type ShardProduct } from '@wildshard/engine/game/shardfile/shardProduct';",
    "import { productHeadlessSections } from '@wildshard/engine/host/headlessSections';",
    'const shard: ShardProduct = createShardProduct(loadHeadlessProduct(productHeadlessSections()));',
    "const label = 'shardProducts';", '',
  ].join('\n');
  writeFileSync(join(repo, 'test/a.test.ts'), test);
  const own = "export function createShardProduct(): number { return 1; }\n";
  writeFileSync(join(repo, 'test/own.ts'), own);
  writeFileSync(join(repo, 'node_modules/x/index.js'), "import('@wildshard/engine/host/headlessProduct');\n");
  expect(codemod({ project: repo, from: '0.3.6', to: '0.3.7' })).toEqual(['test/a.test.ts: engine product names are folder names (SA25)']);
  expect(readFileSync(join(repo, 'test/a.test.ts'), 'utf8')).toBe([
    "const { loadHeadlessFolder } = await import('@wildshard/engine/host/headlessFolder');",
    "import { createShardFolder, type ShardFolder } from '@wildshard/engine/game/shardfile/shardFolder';",
    "import { folderHeadlessSections } from '@wildshard/engine/host/headlessSections';",
    'const shard: ShardFolder = createShardFolder(loadHeadlessFolder(folderHeadlessSections()));',
    "const label = 'shardProducts';", '',
  ].join('\n'));
  expect(readFileSync(join(repo, 'test/own.ts'), 'utf8')).toBe(own);
  expect(readFileSync(join(repo, 'node_modules/x/index.js'), 'utf8')).toContain('headlessProduct');
  expect(moveSource(own)).toBe(own);
});
