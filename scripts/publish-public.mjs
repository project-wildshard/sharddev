// A gathered shard's published files, copied to the public URLs a build reads. The aliases are gitignored.
import { cpSync, existsSync } from 'node:fs';

for (const slug of ["_template","ink-cel-valley","pastel-plain"]) {
  const tree = `src/shards/${slug}/assets/public`;
  if (existsSync(tree)) cpSync(tree, `public/assets/${slug}`, { recursive: true, force: true });
}
