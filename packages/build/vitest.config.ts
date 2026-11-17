import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { viteTmpRoot } from '@wildshard/sdk/scripts/vite-tmp.mjs';
import { worktreeWatchIgnored } from '@wildshard/sdk/scripts/worktree-ignore.mjs';

// SDK-SPLIT SP9c: the build's own tests (project, synth and the source expanders' end-to-end builds). No engine alias:
// the build package never reaches the engine.
export default defineConfig({
  plugins: [viteTmpRoot()],
  define: { __SHARDFILE_VALIDATOR__: '"lift"' },
  resolve: { dedupe: ['three', 'valibot', '@wildshard/format'] },
  assetsInclude: ['**/*.bin', '**/*.wasm'],
  // Plan worktrees under .worktrees/ are other checkouts: watch mode never watches them (DEV-SPEED DS11).
  server: { watch: { ignored: worktreeWatchIgnored() } },
  test: {
    maxWorkers: 2,
    execArgv: ['--import', path.resolve('../sdk/src/sharddev/bake/format-hook.mjs')],
    testTimeout: 30_000,
    environment: 'node',
    server: { deps: { inline: [/@wildshard\//u] } },
    include: ['src/sharddev/**/*.test.ts', 'test/**/*.test.ts'],
  },
});
