// oxlint-disable-next-line import/no-nodejs-modules -- Only canonical checkout paths can receive the old-six offline warning policy.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Author identities and symlink spellings do not confer checkout provenance.
import { resolve } from 'node:path';
import type { Shardfile } from '@wildshard/engine/host/shardfile';

const legacy = new Set(['driftwood-isle', 'pine-hollow', 'nalati-grasslands', 'far-reach', 'sunscar-dunes', 'nine-dragon-stack']);
/** A first-party shard repo is `project-wildshard/shard-*`, its package `@wildshard/shard-*`. SA28: `wildshard new` writes
 * an AGENTS.md into every author repo, so AGENTS.md alone no longer tells a first-party checkout from a `new` one. */
function firstPartyCheckout(root: string): boolean {
  const file = resolve(root, 'package.json');
  if (!existsSync(file) || !existsSync(resolve(root, 'AGENTS.md'))) return false;
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    const name: unknown = typeof parsed === 'object' && parsed !== null ? Reflect.get(parsed, 'name') : undefined;
    return typeof name === 'string' && name.startsWith('@wildshard/shard-');
  } catch { return false; }
}
/** Offline policy is selected by trusted checkout provenance, never by author slug or a product flag. */
export function projectPerformancePolicy(project: string | undefined, source: Pick<Shardfile,'identity'>, root: string = process.cwd()): 'warn' | 'refuse' {
  if (project === undefined || !legacy.has(source.identity.slug)) return 'refuse';
  // P4: a first-party shard repo is the checkout (the cwd), and it holds the shard at this path.
  if (!firstPartyCheckout(root)) return 'refuse';
  // SA16 (J317): a single-shard repo holds it at src/ (SA24 moves the six there), a multi-shard repo at src/shards/<slug>/.
  const canonical = existsSync(resolve(root, 'src/shard.config.ts')) ? resolve(root, 'src') : resolve(root, 'src/shards', source.identity.slug);
  if (!existsSync(project) || !existsSync(canonical)) return 'refuse';
  const actual = realpathSync(project), products = [resolve(root, 'public/shardfiles', source.identity.slug),resolve(root,'out',source.identity.slug)];
  return actual === realpathSync(canonical) || products.some(product => existsSync(product) && actual === realpathSync(product)) ? 'warn' : 'refuse';
}
