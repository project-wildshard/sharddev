import path from 'node:path';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import { rapierAlias } from '@wildshard/engine/vite/rapier.ts';

export default defineConfig({
  define: { __SHARDFILE_VALIDATOR__: '"lift"' },
  resolve: { alias: rapierAlias, dedupe: ['three', 'valibot', 'postprocessing', '@wildshard/format'] },
  assetsInclude: ['**/*.bin', '**/*.wasm'],
  test: {
    execArgv: ['--import', path.resolve('src/sharddev/bake/format-hook.mjs')],
    testTimeout: 30_000,
    environment: 'node',
    server: { deps: { inline: [/@wildshard\//u] } },
    include: ['src/sharddev/**/*.test.ts', 'src/commons/**/*.test.ts', 'src/shards/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: ['**/node_modules/**', ...JSON.parse(readFileSync('test/lift-pending.json', 'utf8'))],
  },
});
