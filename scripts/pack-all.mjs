// One tarball per product under out/, by `wildshard pack`.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';

mkdirSync('out/tars', { recursive: true });
for (const row of readdirSync('out', { withFileTypes: true })) {
  if (!row.isDirectory() || row.name === 'tars' || row.name.startsWith('.')) continue;
  execFileSync('pnpm', ['exec', 'wildshard', 'pack', `out/${row.name}`, '--out', `out/tars/${row.name}.tar`], { stdio: 'inherit' });
}
