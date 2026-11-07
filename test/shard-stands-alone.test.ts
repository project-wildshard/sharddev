// oxlint-disable-next-line import/no-nodejs-modules -- This test reads real products and runs the cook in a folder of its own.
import {spawnSync} from 'node:child_process';
// oxlint-disable-next-line import/no-nodejs-modules -- This test reads real products and runs the cook in a folder of its own.
import {createHash} from 'node:crypto';
// oxlint-disable-next-line import/no-nodejs-modules -- This test reads real products and runs the cook in a folder of its own.
import {existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- This test reads real products and runs the cook in a folder of its own.
import {tmpdir} from 'node:os';
// oxlint-disable-next-line import/no-nodejs-modules -- This test reads real products and runs the cook in a folder of its own.
import {dirname, join, resolve} from 'node:path';
import {describe, expect, it} from 'vitest';
import {prepareAssetDecoders} from '@wildshard/format/product';
import {validateShardfileProduct} from '@wildshard/format/productValidation';
import {readTar} from '@wildshard/format/tar';
import {productTarball} from '../src/cook/game/productTarball';
import {openShardfile} from '../src/cook/game/shardCook';
import {shardFromDiscovery} from '../src/client/game/shard/discovery';
import {loadHeadlessProduct} from '@wildshard/engine/host/headlessProduct';

/** C0 (J137): a shardfile stands alone. Each real product packs to a tarball the format's own validator takes; everything
 *  its sections name by a public URL it either carries or leaves to the engine, because other shards read it too; and
 *  `cook` runs on the tarball from an empty folder, so no bundle, `src/shards` or `public/` can be doing the work. */
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const products = readdirSync('out', {withFileTypes: true}).filter(row => row.isDirectory() && existsSync(join('out', row.name, 'shard.json'))).map(row => row.name);
const everyMount = (): Map<string, Set<string>> => {
  const users = new Map<string, Set<string>>();
  for (const name of readdirSync('src/shards')) {
    const file = join('src/shards', name, 'mounts.json');
    if (!existsSync(file)) continue;
    const {outputs} = JSON.parse(readFileSync(file, 'utf8')) as {outputs: Record<string, string[]>};
    for (const url of Object.values(outputs).flat()) { const set = users.get(url) ?? new Set(); set.add(name); users.set(url, set); }
  }
  return users;
};

describe('a shardfile stands alone', () => {
  it('names no public file twice across shard folders', () => {
    expect([...everyMount()].filter(([, users]) => users.size > 1)).toEqual([]);
  });

  // C3: an output has no level manifest, so a product is the only place a page can learn it exists (359a83994c, 47dc16b45c).
  it.each(products)('%s carries a discovery document that revives to itself', slug => {
    const {mounts} = JSON.parse(readFileSync(join('out', slug, 'cook.json'), 'utf8')) as {mounts: {url: string; path: string}[]};
    const document = mounts.find(row => row.url === `/shardfiles/${slug}/discovery.json`);
    if (document === undefined) throw new Error(`${slug} has no discovery document`);
    const body: unknown = JSON.parse(readFileSync(join('out', slug, document.path), 'utf8'));
    expect(shardFromDiscovery(body).slug).toBe(slug);
  });

  it.each(products)('%s validates as a tarball and carries its own files', async slug => {
    await prepareAssetDecoders();
    const tarball = productTarball(join('out', slug)), files = readTar(tarball);
    const product = validateShardfileProduct({read: (path, max) => {
      const bytes = files.get(path); if (bytes === undefined || bytes.length > max) throw new Error(`No ${path}`); return bytes;
    }, paths: () => files.keys()}, {hash: sha256});
    expect(product.index.identity.slug).toBe(slug === '_template' ? 'template' : slug);
    const shard = openShardfile(tarball), mounted = new Set(shard.cook?.mounts.map(row => row.url));
    // A discovery document is written with its product (C3), so only an `/assets` mount has a public twin to match.
    for (const row of shard.cook?.mounts ?? []) if (row.url.startsWith('/assets/')) expect(sha256(readFileSync(join('public', row.url.slice(1))))).toBe(row.hash);
    const engine = everyMount();
    const named = [...JSON.stringify([...shard.sections.values()]).matchAll(/"(\/assets\/[^"]+\.[a-z0-9]+)"/gu)].map(match => match[1] ?? '');
    const missing = named.filter(url => !mounted.has(url) && existsSync(join('public', url.slice(1))) && !engine.has(url));
    // A file no mounts.json lists is either the engine's (read by two shard folders) or this list is stale.
    const cooked = standIns(slug), carried = (url: string): boolean => (cooked.get(url)?.length ?? 0) === 2 && (cooked.get(url) ?? []).every(form => mounted.has(form));
    expect(missing.filter(url => !carried(url) && readers(url) < 2)).toEqual([]);
  }, 60_000);

  it.each(['driftwood-isle', 'nalati-grasslands', 'pine-hollow'])('%s loads headless from its unpacked tarball', async slug => {
    const scratch = mkdtempSync(join(tmpdir(), 'stands-alone-'));
    try {
      for (const [path, bytes] of readTar(productTarball(join('out', slug)))) {
        mkdirSync(dirname(join(scratch, path)), {recursive: true}); writeFileSync(join(scratch, path), bytes);
      }
      const product = await loadHeadlessProduct(scratch);
      expect(product.shardfile.identity.slug).toBe(slug);
    } finally { rmSync(scratch, {recursive: true, force: true}); }
  }, 60_000);

  it('cooks from a tarball in an empty folder', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'cook-')), root = resolve('.');
    try {
      const tar = join(scratch, 'shard.tar'), slug = products.includes('pastel-plain') ? 'pastel-plain' : '_template';
      writeFileSync(tar, productTarball(join('out', slug)));
      // A cold part cache starts the encoder's workers, which a warm one never does, and the cook must still exit. `spawnSync` blocks
      // this worker, so only its own timeout can end a cook that doesn't.
      const run = spawnSync(process.execPath, ['--import', join(root, 'scripts/bake-loader.mjs'), join(root, 'scripts/cook.mjs'), tar, join(scratch, 'packs')],
        {cwd: scratch, encoding: 'utf8', timeout: 100_000, env: {...process.env, WILDSHARD_SPAWN_PART_CACHE: join(scratch, 'parts')}});
      expect(run.status, run.stderr).toBe(0);
      const report = JSON.parse(run.stdout.trim().split('\n').at(-1) ?? '{}') as {slug: string; manifests: unknown[]; parts: {count: number}};
      expect(report.slug).toBe(slug);
      expect(report.manifests).toHaveLength(4);
      expect(readdirSync(join(scratch, 'packs/assets/spawn/parts')).length).toBe(report.parts.count);
    } finally { rmSync(scratch, {recursive: true, force: true}); }
  }, 120_000);
});

/** 4194450b25: a source with a cooked form on both tiers stays out of a shardfile, which carries those forms instead. Its
 *  sections still name the source, as `scripts/record-shard-mounts.mjs` reads them. */
function standIns(slug: string): ReadonlyMap<string, readonly string[]> {
  const file = join('src/shards', slug, 'ktx2.generated.ts'), forms = new Map<string, string[]>();
  if (!existsSync(file)) return forms;
  for (const [, url = '', form = ''] of readFileSync(file, 'utf8').matchAll(/"(\/assets\/[^"]+)": "(\/assets\/[^"]+)"/gu)) forms.set(url, [...forms.get(url) ?? [], form]);
  return forms;
}
let sectionReaders: ReadonlyMap<string, ReadonlySet<string>> | undefined;
/** How many shard folders' sections name a URL. One read of every section: a walk per URL is synchronous, so no test timeout
 *  can fire, and on the full product set it outlived its CI job. */
function readers(url: string): number { return (sectionReaders ??= readSectionReaders()).get(url)?.size ?? 0; }
function readSectionReaders(): ReadonlyMap<string, ReadonlySet<string>> {
  const index = new Map<string, Set<string>>();
  for (const slug of products) {
    const folder = slug.startsWith('open-plot-') ? 'open-plots' : slug, section = join('out', slug, 'sections');
    for (const row of readdirSync(section, {recursive: true, withFileTypes: true})) {
      if (!row.isFile()) continue;
      for (const [, url = ''] of readFileSync(join(row.parentPath, row.name), 'utf8').matchAll(/"(\/assets\/[^"]+)"/gu)) index.set(url, (index.get(url) ?? new Set<string>()).add(folder));
    }
  }
  return index;
}
