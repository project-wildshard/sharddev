import path from 'node:path';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Node won't strip types under node_modules, so a config can't import engine's vite/rapier.ts from a tag. Its aliases, as a shard repo spells them.
const engine = path.dirname(createRequire(import.meta.url).resolve('@wildshard/engine/package.json'));
const rapierAlias = [
  { find: /^\.\/rapier_wasm3d(\.js)?$/u, replacement: path.join(engine, 'src/server/engine/physics/rapierBindings.ts') },
  { find: /^@dimforge\/rapier3d-simd$/u, replacement: createRequire(path.join(engine, 'package.json')).resolve('@dimforge/rapier3d-simd/rapier.js') },
];

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
