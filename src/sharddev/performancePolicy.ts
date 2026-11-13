// oxlint-disable-next-line import/no-nodejs-modules -- Only canonical checkout paths can receive the old-six offline warning policy.
import { existsSync, realpathSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Author identities and symlink spellings do not confer checkout provenance.
import { resolve } from 'node:path';
import type { Shardfile } from '@wildshard/engine/host/shardfile';

const legacy = new Set(['driftwood-isle', 'pine-hollow', 'nalati-grasslands', 'far-reach', 'sunscar-dunes', 'nine-dragon-stack']);
/** Offline policy is selected by trusted checkout provenance, never by author slug or a product flag. */
export function projectPerformancePolicy(project: string | undefined, source: Pick<Shardfile,'identity'>): 'warn' | 'refuse' {
  if (project === undefined || !legacy.has(source.identity.slug)) return 'refuse';
  const root = process.cwd(); // P4: a first-party shard repo is the checkout, and it holds the shard at this path.
  if (!existsSync(resolve(root, 'AGENTS.md'))) return 'refuse';
  // SA16 (J317): a single-shard repo holds it at src/ (SA24 moves the six there), a multi-shard repo at src/shards/<slug>/.
  const canonical = existsSync(resolve(root, 'src/shard.config.ts')) ? resolve(root, 'src') : resolve(root, 'src/shards', source.identity.slug);
  if (!existsSync(project) || !existsSync(canonical)) return 'refuse';
  const actual = realpathSync(project), products = [resolve(root, 'public/shardfiles', source.identity.slug),resolve(root,'out',source.identity.slug)];
  return actual === realpathSync(canonical) || products.some(product => existsSync(product) && actual === realpathSync(product)) ? 'warn' : 'refuse';
}
