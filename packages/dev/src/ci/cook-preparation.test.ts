import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { after, test } from 'node:test'

import {
  installWildshard,
  tempFolder,
  writeProduct,
} from '../test/helpers/install.ts'

const dir = tempFolder()
after((): void => {
  rmSync(dir, { recursive: true, force: true })
})
const bin = installWildshard(dir)
const root = path.resolve(path.dirname(bin), '..')
// A packed unpublished format can exercise this contract without activating
// workspace links or changing the real checkout. CI uses the ordinary pin.
const candidateFormat = process.env['WILDSHARD_FORMAT_PROOF']
if (candidateFormat !== undefined) {
  const dependency = path.resolve(root, '../format')
  assert.ok(lstatSync(dependency).isSymbolicLink())
  unlinkSync(dependency)
  symlinkSync(candidateFormat, dependency)
}
const FINISH = `import {readFileSync} from 'node:fs';
import {finishPreparation} from ${JSON.stringify(path.join(root, 'scripts/prepare-product.mjs'))};
const [dir,recording]=process.argv.slice(1);
await finishPreparation(dir,JSON.parse(readFileSync(recording,'utf8')),readFileSync(dir+'/shard.json'));`

function recording(folder: string): string {
  const header = readFileSync(path.join(folder, 'shard.json'))
  const hash = createHash('sha256').update(header).digest('hex')
  const file = path.join(dir, `${path.basename(folder)}-recording.json`)
  writeFileSync(
    file,
    JSON.stringify({
      headerHash: hash,
      renderer: '1'.repeat(64),
      reads: [],
      programs: {
        version: 2,
        build: 'wire-fixture-only',
        lines: ['void main() {}'],
        shaders: [[0]],
        programs: [[0, 0]],
      },
    }),
  )
  return file
}

function finish(folder: string, file: string): number | null {
  const run = spawnSync(
    process.execPath,
    [
      '--import',
      path.join(root, 'src/sharddev/bake/format-hook.mjs'),
      '--input-type=module',
      '-e',
      FINISH,
      folder,
      file,
    ],
    { encoding: 'utf8' },
  )
  assert.equal(run.error, undefined)
  return run.status
}

test('installed producer prepares and packs exact candidate bytes', async (): Promise<void> => {
  const folder = await writeProduct(dir, 'prepared')
  assert.equal(finish(folder, recording(folder)), 0)
  const out = path.join(dir, 'prepared.tar')
  const packed = spawnSync(
    process.execPath,
    [bin, 'pack', folder, '--out', out],
    { encoding: 'utf8' },
  )
  assert.equal(packed.status, 0, packed.stderr)
  assert.ok(readFileSync(out).length > 0)
})

test('a capture from another candidate cannot finish this product', async (): Promise<void> => {
  const folder = await writeProduct(dir, 'changed')
  const file = recording(folder)
  const header = readFileSync(path.join(folder, 'shard.json'))
  writeFileSync(path.join(folder, 'shard.json'), `${header.toString()} `)
  assert.notEqual(finish(folder, file), 0)
  assert.equal(
    readFileSync(path.join(folder, 'shard.json')).toString(),
    `${header.toString()} `,
  )
})

test('linked output refuses before changing a file outside the candidate', async (): Promise<void> => {
  const folder = await writeProduct(dir, 'linked')
  const file = recording(folder)
  const outside = path.join(dir, 'outside')
  mkdirSync(outside)
  const sentinel = path.join(outside, 'upload-test.json')
  writeFileSync(sentinel, 'keep')
  symlinkSync(outside, path.join(folder, 'mounts/programs'))
  assert.notEqual(finish(folder, file), 0)
  assert.equal(readFileSync(sentinel, 'utf8'), 'keep')
})

async function recipeProject(): Promise<{
  readonly work: string
  readonly folder: string
}> {
  const work = path.join(dir, 'publication')
  const folder = await writeProduct(path.join(work, 'out'), 'draft')
  writeFileSync(
    path.join(work, 'package.json'),
    JSON.stringify({
      name: 'publication-proof',
      version: '0.0.0',
      private: true,
    }),
  )
  const bins = path.join(work, 'node_modules/.bin')
  mkdirSync(bins, { recursive: true })
  symlinkSync(bin, path.join(bins, 'wildshard'))
  return { work, folder }
}

function runRecipe(work: string): {
  readonly status: number | null
  readonly stdout: string
  readonly stderr: string
} {
  const env = { ...process.env }
  delete env['WILDSHARD_PREPARATION_URL']
  return spawnSync(
    process.execPath,
    [path.join(root, 'scripts/pack-all.mjs')],
    { cwd: work, env, encoding: 'utf8' },
  )
}

test('new publication recipe refuses an unprepared product before packing', async (): Promise<void> => {
  const { work, folder } = await recipeProject()
  const run = runRecipe(work)
  assert.notEqual(run.status, 0)
  assert.match(run.stderr, /wildshard prepare/u)
  assert.equal(
    lstatSync(path.join(work, 'out/draft/shard.json')).isFile(),
    true,
  )
  assert.equal(finish(folder, recording(folder)), 0)
  const prepared = runRecipe(work)
  assert.equal(prepared.status, 0, `${prepared.stdout}\n${prepared.stderr}`)
  assert.ok(readFileSync(path.join(work, 'out/tars/draft.tar')).length > 0)
})
