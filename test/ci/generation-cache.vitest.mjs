// J186: quick outer-edge proofs run explicitly, never in commit/push hooks.
// pnpm exec vitest run --config test/ci/generation-cache.vitest.mjs
import { defineConfig } from 'vitest/config'

import base from '../../vitest.config.ts'

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['test/ci/generation-cache.proof.ts'],
    exclude: [],
    testTimeout: 5_000,
  },
})
