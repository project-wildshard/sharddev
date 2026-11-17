import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  FORBIDDEN,
  engineExports,
  engineImporters,
  escapingImports,
  guardFailures,
  guardReport,
  LEAN,
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
      write('src/public/value.ts', "export * from '../b.ts'\n")
      write('src/public/deep/value.ts', "export * from '../../b.ts'\n")
      write('src/pure/value.ts', 'export const value = 1\n')
      write(
        'src/pure/not-shipped.test.ts',
        "import '@wildshard/engine/core/x'\n",
      )
      assert.deepEqual(
        engineExports(root, {
          './public/*': './src/public/*.ts',
          './pure/*': './src/pure/*.ts',
          './absent/*': './src/absent/*.ts',
        }),
        ['./public/*'],
      )
      write(
        'src/f.ts',
        "import { y } from '../../src/y.ts'\nimport { z } from './sub/../z.ts'\n",
      )
      assert.deepEqual(escapingImports(root, ['src']), [
        'src/f.ts -> ../../src/y.ts',
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('reports packages/upload clean and self-contained (SP2a)', () => {
    const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
    const upload = guardReport(repo).find(
      row => row.importer === 'packages/upload',
    )
    assert.ok(
      upload,
      'packages/upload is a workspace package in pnpm-lock.yaml',
    )
    assert.equal(upload.name, '@wildshard/upload')
    assert.deepEqual(upload.forbidden, [])
    assert.deepEqual(upload.engineFiles, [])
    assert.deepEqual(upload.escapes, [])
  })

  it('pins upload to the same versions the sdk ships with (SP2a)', () => {
    // The sdk depends on upload by name (SP2b) and both install side by side, so upload's own pins must be the sdk's:
    // provenance reads the format version from the nearest install, which in a checkout is packages/upload's.
    const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
    const read = path => JSON.parse(readFileSync(join(repo, path), 'utf8'))
    const root = read('packages/sdk/package.json').dependencies,
      upload = read('packages/upload/package.json').dependencies
    for (const [name, specifier] of Object.entries(upload))
      assert.equal(specifier, root[name], name)
  })
  it('fails a lean package on a forbidden name, an engine import or an export reaching it, never dev (SP11)', () => {
    const row = (name, extra = {}) => ({ importer: name, name, forbidden: [], engineFiles: [], escapes: [], engineExports: [], ...extra })
    assert.deepEqual(LEAN, ['@wildshard/build', '@wildshard/kit', '@wildshard/sdk', '@wildshard/upload'])
    assert.deepEqual(guardFailures([row('@wildshard/build'), row('@wildshard/dev', { forbidden: ['vite'], engineFiles: ['src/a.ts'], engineExports: ['./a'] })]), [])
    const failures = guardFailures([
      row('@wildshard/build', { forbidden: ['vite'] }),
      row('@wildshard/sdk', { engineFiles: [resolve('src/a.ts')], escapes: ['scripts/x.mjs -> ../../kit/y'] }),
      row('@wildshard/upload', { engineExports: ['./api'] }),
    ])
    assert.deepEqual(failures, [
      '@wildshard/build: production tree holds vite',
      '@wildshard/sdk: src/a.ts imports @wildshard/engine',
      '@wildshard/upload: export ./api reaches @wildshard/engine',
    ])
  })

  it('finds every lean package of this repo clean (SP11)', () => {
    const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
    const report = guardReport(repo)
    for (const name of LEAN) assert.ok(report.some(row => row.name === name), name)
    assert.deepEqual(guardFailures(report), [])
  })
  it('pins build\'s run-time packages at the sdk\'s versions (SP9d2)', () => {
    // The compiled build (packages/build/dist/build.mjs) inlines the sdk, upload, kit and format and imports the sdk's
    // own dependencies from beside it, so build declares each at the sdk's pin.
    const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
    const read = path => JSON.parse(readFileSync(join(repo, path), 'utf8'))
    const sdk = read('packages/sdk/package.json').dependencies,
      build = read('packages/build/package.json').dependencies
    for (const [name, specifier] of Object.entries(build))
      if (sdk[name] !== undefined && !specifier.startsWith('workspace:')) assert.equal(specifier, sdk[name], name)
  })
})
