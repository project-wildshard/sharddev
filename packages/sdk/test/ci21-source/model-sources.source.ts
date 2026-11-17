// oxlint-disable-next-line import/no-nodejs-modules -- Run the repository's actual model-source CLI.
import { spawnSync } from 'node:child_process'
// oxlint-disable-next-line import/no-nodejs-modules -- Use the current test process's Node executable.
import { execPath } from 'node:process'
// oxlint-disable-next-line import/no-nodejs-modules -- Own bounded source and asset fixtures beneath repo tmp.
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
// oxlint-disable-next-line import/no-nodejs-modules -- Confine each fixture to its owned project root.
import { dirname, resolve } from 'node:path'
import { expect, test } from 'vitest'

// The original complete repository check, now against its SDK owner.
test('every Blender-built model keeps its source, and no script is an orphan', () => {
  const run = spawnSync(execPath, ['scripts/check-model-sources.mjs'], { encoding: 'utf8' })
  expect(run.stderr).toBe('')
  expect(run.status).toBe(0)
})

function fixture(check: (root: string, put: (path: string, bytes: string) => void) => void): void {
  mkdirSync('tmp', { recursive: true })
  const root = mkdtempSync(resolve('tmp/model-sources-'))
  const put = (path: string, bytes: string): void => {
    const file = resolve(root, path)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, bytes)
  }
  put('scripts/blender/build.py', '# the source')
  put('public/models/body.glb', 'built model')
  put('scripts/blender/targets.json', JSON.stringify({ targets: { body: { script: 'scripts/blender/build.py', outputs: ['public/models/body.glb'] } } }))
  try { check(root, put) } finally { rmSync(root, { recursive: true, force: true }) }
}
const check = (root: string) => spawnSync(execPath, ['scripts/check-model-sources.mjs', root], { encoding: 'utf8' })

test('an exported project with its source and outputs passes without a parent checkout inventory', () => fixture(root => {
  const run = check(root)
  expect(run.stderr).toBe('')
  expect(run.status).toBe(0)
  expect(run.stdout).toContain('1 GLBs, 1 source files')
}))

test('missing source scripts and named outputs refuse', () => fixture(root => {
  rmSync(resolve(root, 'scripts/blender/build.py'))
  const source = check(root)
  expect(source.status).toBe(1)
  expect(source.stderr).toContain('its script scripts/blender/build.py does not exist')
  rmSync(resolve(root, 'public/models/body.glb'))
  const output = check(root)
  expect(output.status).toBe(1)
  expect(output.stderr).toContain('its output public/models/body.glb does not exist')
}))

test('orphan scripts and unowned GLBs refuse', () => fixture((root, put) => {
  put('scripts/blender/orphan.py', '# unowned source')
  put('public/models/stray.glb', 'unowned model')
  const run = check(root)
  expect(run.status).toBe(1)
  expect(run.stderr).toContain('scripts/blender/orphan.py: an orphan')
  expect(run.stderr).toContain('public/models/stray.glb: a GLB')
}))

test('a content repo declares its own other-pipeline model exceptions', () => fixture((root, put) => {
  put('public/models/other.glb', 'another pipeline')
  put('scripts/blender/targets.json', JSON.stringify({ targets: { body: { script: 'scripts/blender/build.py', outputs: ['public/models/body.glb'] } }, notBlender: { 'public/models/other.glb': 'Another declared model pipeline' } }))
  expect(check(root).status).toBe(0)
}))

test('an exported project refuses .blend inspection files', () => fixture((root, put) => {
  put('inspection.blend1', 'inspection state')
  const run = check(root)
  expect(run.status).toBe(1)
  expect(run.stderr).toContain('inspection.blend1: a .blend is never committed')
}))

test('the tracked-file path refuses a staged .blend in its own checkout', () => fixture((root, put) => {
  put('inspection.blend', 'inspection state')
  const init = spawnSync('git', ['init', root], { encoding: 'utf8' })
  expect(init.status).toBe(0)
  const add = spawnSync('git', ['-C', root, 'add', 'inspection.blend', 'scripts/blender/targets.json', 'scripts/blender/build.py', 'public/models/body.glb'], { encoding: 'utf8' })
  expect(add.status).toBe(0)
  const run = check(root)
  expect(run.status).toBe(1)
  expect(run.stderr).toContain('inspection.blend: a .blend is never committed')
}))

// Only project-root scratch is outside the exported source inventory.
test('nested source tmp folders retain blend and orphan refusal', () => fixture((root, put) => {
  put('scripts/blender/tmp/inspection.blend', 'inspection state')
  const run = check(root)
  expect(run.status).toBe(1)
  expect(run.stderr).toContain('scripts/blender/tmp/inspection.blend: a .blend is never committed')
}))
