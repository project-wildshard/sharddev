// One tarball per product under out/, by `wildshard pack`.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';

mkdirSync('out/tars', { recursive: true });
for (const row of readdirSync('out', { withFileTypes: true })) {
  if (!row.isDirectory() || row.name === 'tars' || row.name.startsWith('.')) continue;
  const product = `out/${row.name}`, index = JSON.parse(readFileSync(`${product}/shard.json`, 'utf8'));
  if (index.sdk !== '0.3') {
    const base = process.env.WILDSHARD_PREPARATION_URL;
    if (!base) throw new Error(`Unprepared ${product}: run wildshard prepare ${product} --base <exact-preview-url> through engine scripts/browser-lane.sh; or set WILDSHARD_PREPARATION_URL for pack:shards`);
    execFileSync('pnpm', ['exec', 'wildshard', 'prepare', product, '--base', base], { stdio: 'inherit' });
  }
  execFileSync('pnpm', ['exec', 'wildshard', 'pack', `out/${row.name}`, '--out', `out/tars/${row.name}.tar`], { stdio: 'inherit' });
}
