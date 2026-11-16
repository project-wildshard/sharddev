// CI21 source ports are opt-in until their installed public graph is ready.
// Preserve the actual SDK aliases, format hook and runtime options.
import { defineConfig } from 'vitest/config'

import sdk from './vitest.config.ts'

export default defineConfig({
  ...sdk,
  test: { ...sdk.test, include: ['test/ci21-source/**/*.source.ts'] },
})
