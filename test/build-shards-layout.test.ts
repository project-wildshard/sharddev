import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, expect, test } from 'vitest';
import { buildShardfiles } from '../scripts/build-shardfiles.mjs';

// SHARD-AUTHORING SA42: `wildshard build-shards` finds a single-shard repo's source at `src/` (SA16's rule, folder
// named by its slug) and a multi-shard repo's at `src/shards/<folder>/`, and hands the builder that source folder.
const scratch = resolve(import.meta.dirname, '../tmp');
mkdirSync(scratch, { recursive: true });
const base = mkdtempSync(join(scratch, 'build-shards-layout-'));
afterAll(() => { rmSync(base, { recursive: true, force: true }); });

function shard(dir: string, slug: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'shard.config.ts'), 'export default {};\n');
  writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify({ slug })}\n`);
}

/** The products built and the source folders the builder was handed (`build <source> <staging> …`); the fake builder
 *  stops each build there, so each product reports a failure. */
async function builtFrom(root: string): Promise<{ products: string[]; sources: string[] }> {
  const sources: string[] = [], products: string[] = [];
  await buildShardfiles(root, {
    strict: false, copyRuntime: false,
    build: (args: readonly string[]) => { sources.push(args[1] ?? ''); throw new Error('stop here'); },
    onFailure: (slug: string) => { products.push(slug); },
  });
  return { products: products.sort(), sources: sources.sort() };
}

test('a single-shard repo builds its src/ as one product named by its slug', async () => {
  const root = join(base, 'single');
  shard(join(root, 'src'), 'lone-isle');
  expect(await builtFrom(root)).toEqual({ products: ['lone-isle'], sources: [join(root, 'src')] });
});

test('a multi-shard repo builds each src/shards/<folder>/', async () => {
  const root = join(base, 'multi');
  shard(join(root, 'src/shards/east-plot'), 'east-plot');
  shard(join(root, 'src/shards/west-plot'), 'west-plot');
  expect(await builtFrom(root)).toEqual({ products: ['east-plot', 'west-plot'], sources: [join(root, 'src/shards/east-plot'), join(root, 'src/shards/west-plot')] });
});
