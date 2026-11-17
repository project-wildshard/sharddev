import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

import {
  FORBIDDEN,
  engineExports,
  engineImporters,
  escapingImports,
  guardReport,
  parseLock,
  productionTree,
} from '../../scripts/dep-guard.mjs'

// SDK-SPLIT SP1: the guard reads the lockfile, so a fixture lockfile with
// one clean and one dirty workspace package is the whole contract.
const LOCK = `lockfileVersion: '9.0'

importers:

  .:
    devDependencies:
      vitest:
        specifier: 5.0.3
        version: 5.0.3

  packages/clean:
    dependencies:
      '@wildshard/format':
        specifier: npm:@wildshard/shard-format@0.13.0
        version: '@wildshard/shard-format@0.13.0'
      valibot:
        specifier: 1.5.0
        version: 1.5.0
    devDependencies:
      happy-dom:
        specifier: 21.0.4
        version: 21.0.4

  packages/dirty:
    dependencies:
      '@wildshard/engine':
        specifier: 0.1.32
        version: 0.1.32(vite@8.3.0)
      clean:
        specifier: link:../clean
        version: link:../clean

packages:

  valibot@1.5.0:
    resolution: {integrity: sha512-x}

snapshots:

  '@wildshard/engine@0.1.32(vite@8.3.0)':
    dependencies:
      hono: 4.13.13
      vite: 8.3.0
    optionalDependencies:
      playwright: 1.65.0

  '@wildshard/shard-format@0.13.0':
    dependencies:
      valibot: 1.5.0

  happy-dom@21.0.4: {}

  hono@4.13.13: {}

  playwright@1.65.0: {}

  valibot@1.5.0: {}

  vite@8.3.0: {}

  vitest@5.0.3:
    dependencies:
      vite: 8.3.0
`

describe('dep-guard', () => {
  it('names every forbidden package a production tree holds, and none a clean one holds', () => {
    const lock = parseLock(LOCK)
    assert.deepEqual(Object.keys(lock.importers).sort(), [
      '.',
      'packages/clean',
      'packages/dirty',
    ])
    const clean = productionTree(lock, 'packages/clean')
    assert.ok(clean.has('@wildshard/shard-format'))
    assert.ok(clean.has('valibot'))
    assert.deepEqual(
      FORBIDDEN.filter(name => clean.has(name)),
      [],
      'dev dependencies stay out of the production tree',
    )
    const dirty = productionTree(lock, 'packages/dirty')
    assert.deepEqual(
      FORBIDDEN.filter(name => dirty.has(name)),
      ['@wildshard/engine', 'vite', 'playwright'],
    )
    assert.ok(dirty.has('valibot'), 'a link: dependency brings its own tree')
    assert.deepEqual(
      FORBIDDEN.filter(name => productionTree(lock, '.').has(name)),
      [],
    )
  })

  it('finds the source files that import the engine and the exports that reach them', () => {
    const root = mkdtempSync(resolve('tmp', 'dep-guard-'))
    try {
      const write = (path, text) => {
        mkdirSync(dirname(join(root, path)), { recursive: true })
        writeFileSync(join(root, path), text)
      }
      write('src/a.ts', "import { x } from '@wildshard/engine/core/x'\n")
      write('src/b.ts', "export { x } from './a.ts'\n")
      write('src/c.ts', "export const c = await import('./d.mjs')\n")
      write('src/d.mjs', 'export const d = 1\n')
      write(
        'src/e.ts',
        "export * from './b.ts'\nimport type { T } from '@wildshard/engine/types'\n",
      )
      const files = engineImporters(root, ['src'])
      assert.deepEqual(files, ['src/a.ts', 'src/e.ts'])
      const exports = {
        './package.json': './package.json',
        './a': './src/a.ts',
        './b': './src/b.ts',
        './c': './src/c.ts',
        './e': './src/e.ts',
      }
      assert.deepEqual(engineExports(root, exports), ['./a', './b', './e'])
      write('src/f.ts', "import { y } from '../../src/y.ts'\nimport { z } from './sub/../z.ts'\n")
      assert.deepEqual(escapingImports(root, ['src']), ['src/f.ts -> ../../src/y.ts'])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('reports packages/upload clean and self-contained (SP2a)', () => {
    const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
    const upload = guardReport(repo).find(row => row.importer === 'packages/upload')
    assert.ok(upload, 'packages/upload is a workspace package in pnpm-lock.yaml')
    assert.equal(upload.name, '@wildshard/upload')
    assert.deepEqual(upload.forbidden, [])
    assert.deepEqual(upload.engineFiles, [])
    assert.deepEqual(upload.escapes, [])
  })
})
