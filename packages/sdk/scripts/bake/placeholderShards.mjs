// G348: the shards a placeholder bake serves, found from their own data, never a table here. A shard opts in by declaring
// JSON in `src/shards/<slug>/data/placeholder.json` (schema `@wildshard/format/placeholderSource`): its far look
// (and its grid or model parts when its land is not a height field), its ground source and its tree stand-ins.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Every shard folder with a declared placeholder row, sorted by folder name: `{ slug, dir, source }`. */
export async function placeholderShards(root) {
  const { placeholderSource } = await import('@wildshard/format/placeholderSource');
  const out = [];
  for (const slug of readdirSync(join(root, 'src/shards')).sort()) {
    const file = join(root, 'src/shards', slug, 'data/placeholder.json');
    if (!existsSync(file)) continue;
    const PLACEHOLDER = JSON.parse(readFileSync(file, 'utf8'));
    out.push({ slug, dir: join(root, 'src/shards', slug), source: placeholderSource(slug, PLACEHOLDER) });
  }
  return out;
}

/** One shard's declared placeholder row (`{}` when it declares none). */
export async function placeholderOf(root, slug) {
  const file = join(root, 'src/shards', slug, 'data/placeholder.json');
  const { placeholderSource } = await import('@wildshard/format/placeholderSource');
  return placeholderSource(slug, existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined);
}

/**
 * The height grid a shard's placeholders stand on, when it declares no grid of its own: its baked `terrain.bin`, else its
 * shardfile terrain collider (`data/terrain.json`'s or `data/tiles.json`'s `terrain.collider`, a tile in its `assets/`).
 */
export function placeholderGridBytes(root, dir, slug) {
  const baked = join(root, 'public/assets/baked', slug, 'terrain.bin');
  if (existsSync(baked)) return { kind: 'baked', bytes: readFileSync(baked) };
  // the shardfile's compiled terrain section: a template project's data/terrain.json, a hybrid's data/tiles.json
  const file = ['data/terrain.json', 'data/tiles.json'].map(name => join(dir, name)).find(path => existsSync(path));
  if (file === undefined) throw new Error(`${slug}: no terrain.bin and no shardfile terrain section`);
  const row = JSON.parse(readFileSync(file, 'utf8'));
  const collider = row?.terrain?.collider;
  if (typeof collider !== 'string') throw new Error(`${slug}: no terrain.bin and no shardfile terrain collider`);
  return { kind: 'collider', bytes: readFileSync(join(dir, 'assets', collider)) };
}
