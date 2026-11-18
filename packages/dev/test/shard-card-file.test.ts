import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { manifestFolders, outputManifest, shardCardFile, singleShardFolder } from '@wildshard/build/scripts/shard-outputs.mjs';
import { shardCardFile as uploadCardFile, shardFolderName } from '@wildshard/upload/sharddev/shardSource';

// ONE-FORMAT OF6a: a product is named by its card. `data/card.json` is the card's one home; a legacy `manifest.json`
// still wins while a shard keeps one, so every reader (the product list, the build's intake, the hero) agrees.
const scratch = resolve(import.meta.dirname, '../tmp');
mkdirSync(scratch, { recursive: true });
const base = mkdtempSync(join(scratch, 'shard-card-file-'));
afterAll(() => { rmSync(base, { recursive: true, force: true }); });

function shard(root: string, folder: string, files: Record<string, unknown>): string {
  const dir = join(root, folder);
  mkdirSync(dir, { recursive: true });
  for (const [name, value] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), typeof value === 'string' ? value : JSON.stringify(value));
  }
  return dir;
}

describe('shardCardFile (OF6a)', () => {
  it('reads data/card.json when no manifest.json is left, and manifest.json while one is', () => {
    const root = join(base, 'multi');
    const carded = shard(root, 'src/shards/carded', { 'shard.config.ts': '', 'data/card.json': { slug: 'carded', name: 'Carded' } });
    const legacy = shard(root, 'src/shards/legacy', { 'shard.config.ts': '', 'manifest.json': { slug: 'legacy' }, 'data/card.json': { slug: 'other' } });
    const proof = shard(root, 'src/shards/proof', { 'shard.config.ts': '' });
    expect(shardCardFile(carded)).toBe(join(carded, 'data/card.json'));
    expect(shardCardFile(legacy)).toBe(join(legacy, 'manifest.json'));
    expect(shardCardFile(proof)).toBeNull();
    expect(uploadCardFile(carded)).toBe(join(carded, 'data/card.json'));
    expect(uploadCardFile(legacy)).toBe(join(legacy, 'manifest.json'));
    expect(uploadCardFile(proof)).toBeUndefined();
    // a card-only folder is a product; a folder with neither is a source proof
    expect(manifestFolders(root)).toEqual(['carded', 'legacy']);
  });

  it('composes an output over the card and names a src/ shard by its card slug', () => {
    const root = join(base, 'single');
    const src = shard(root, 'src', { 'shard.config.ts': '', 'data/card.json': { slug: 'isle', name: 'Isle', card: { thumb: 'a' } } });
    expect(singleShardFolder(root)).toBe('isle');
    expect(shardFolderName(src)).toBe('isle');
    expect(outputManifest(root, 'isle', { slug: 'isle-two', manifest: { name: 'Two' } })).toMatchObject({ slug: 'isle-two', name: 'Two', card: { thumb: 'a' } });
  });
});
