// CI21 source ports are opt-in until their installed public graph is ready.
// Preserve the actual SDK aliases, format hook and runtime options.
import { defineConfig } from 'vitest/config'
import manifest from './test/ci21-source/manifest.json' with {type:'json'}

import sdk from './vitest.config.ts'

export default defineConfig({
  ...sdk,
  test: { ...sdk.test, include: manifest.files.map((row:Readonly<{targetPath:string}>):string=>row.targetPath) },
})
