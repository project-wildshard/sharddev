// CI21 source ports are opt-in until their installed public graph is ready.
// Preserve the actual SDK aliases, format hook and runtime options.
import { defineConfig } from 'vitest/config'
import {readFileSync} from 'node:fs'

import sdk from './vitest.config.ts'

export default defineConfig({
  ...sdk,
  test: { ...sdk.test, include: JSON.parse(readFileSync('test/ci21-source/manifest.json','utf8')).files.map((row:{targetPath:string})=>row.targetPath) },
})
