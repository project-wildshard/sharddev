import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { resolve } from 'node:path'

import { afterEach, expect, test } from 'vitest'

import { emptyShardfile } from '../../src/sharddev/author.ts'
import {
  generationCache,
  pruneGenerationCache,
} from '../../src/sharddev/generationCache.ts'
import { readProjectAssets } from '../../src/sharddev/project.ts'

const owned: string[] = []
afterEach(() => {
  for (const path of owned.splice(0))
    rmSync(path, { recursive: true, force: true })
})

test('an import edit regenerates its reader and preserves an independent step', async () => {
  mkdirSync('tmp', { recursive: true })
  const root = mkdtempSync(resolve('tmp', 'gen-input-proof-'))
  owned.push(root)
  const cache = resolve(root, 'cache')
  const previous = process.env['WILDSHARD_GEN_CACHE']
  process.env['WILDSHARD_GEN_CACHE'] = cache
  try {
    const source = emptyShardfile({
      slug: 'cache-proof',
      name: 'Cache proof',
      author: 'Test',
      revision: 1,
      seed: 3,
    })
    writeFileSync(resolve(root, 'a.ts'), 'export function a(){return 1;}')
    writeFileSync(resolve(root, 'b.ts'), 'export function b(){return 2;}')
    writeFileSync(
      resolve(root, 'shard.config.ts'),
      `import {a} from './a'; import {b} from './b';
    export default async function(ctx) {
      let captured; captured=a(); const box=[]; box.push(a());
      await ctx.cached({id:'first'}, () => new Map([['a',new Uint8Array([captured,box[0]])]]));
      await ctx.cached({id:'second'}, () => new Map([['b',new Uint8Array([b()])]]));
      return ${JSON.stringify(source)};
    }`,
    )
    await readProjectAssets(root)
    const project = resolve(cache, 'v3', 'keys', root.split('/').at(-1) ?? '')
    const first = readdirSync(resolve(project, 'first'))
    const second = readdirSync(resolve(project, 'second'))
    writeFileSync(resolve(root, 'a.ts'), 'export function a(){return 3;}')
    await readProjectAssets(root)
    expect(readdirSync(resolve(project, 'first')).length - first.length).toBe(1)
    expect(readdirSync(resolve(project, 'second'))).toEqual(second)
    const current = readdirSync(resolve(project, 'first')).find(
      key => !first.includes(key),
    )
    const manifest = JSON.parse(
      readFileSync(
        resolve(project, 'first', current ?? '', 'index.json'),
        'utf8',
      ),
    )
    expect([
      ...readFileSync(resolve(cache, 'blobs', manifest.files[0].hash)),
    ]).toEqual([3, 3])
    expect(
      JSON.parse(
        readFileSync(
          resolve(project, 'second', second[0] ?? '', 'index.json'),
          'utf8',
        ),
      ).files,
    ).toHaveLength(1)
  } finally {
    if (previous === undefined) delete process.env['WILDSHARD_GEN_CACHE']
    else process.env['WILDSHARD_GEN_CACHE'] = previous
  }
})

function fixture(): string {
  mkdirSync('tmp', { recursive: true })
  const path = mkdtempSync(resolve('tmp', 'gen-store-proof-'))
  owned.push(path)
  return path
}
const sha = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex')

test('the real CLI executes its bundled recipe compiler', () => {
  const root = fixture(),
    out = resolve(root, 'new-project')
  const child = spawnSync(
    process.execPath,
    [resolve('bin/wildshard.mjs'), 'new', out, 'cli-cache-proof'],
    {
      env: { ...process.env, WILDSHARD_GEN_CACHE: resolve(root, 'cache') },
      encoding: 'utf8',
      timeout: 6_000,
    },
  )
  expect(child.status, child.stderr).toBe(0)
  expect(existsSync(resolve(out, 'shard.config.ts'))).toBe(true)
})

async function populate(
  store: ReturnType<typeof generationCache>,
  key: string,
  bytes: Uint8Array,
): Promise<void> {
  const files = new Map([['body.bin', bytes]])
  expect(
    await store.populate(
      'mesh',
      {
        key,
        files: [{ name: 'body.bin', hash: sha(bytes), bytes: bytes.length }],
      },
      files,
    ),
  ).toBe(true)
}

test('identical output uses one blob and index-only keys; owned bytes stay detached', async () => {
  const base = fixture(),
    store = generationCache(base, base, 'default'),
    bytes = new Uint8Array([1, 2, 3])
  await populate(store, 'a'.repeat(64), bytes)
  await populate(store, 'b'.repeat(64), bytes)
  expect(readdirSync(store.blobs)).toEqual([sha(bytes)])
  expect(
    readdirSync(
      resolve(
        store.root,
        'keys',
        base.split('/').at(-1) ?? '',
        'mesh',
        'a'.repeat(64),
      ),
    ),
  ).toEqual(['index.json'])
  const ownedBytes = readFileSync(resolve(store.blobs, sha(bytes)))
  ownedBytes.fill(9)
  expect([...readFileSync(resolve(store.blobs, sha(bytes)))]).toEqual([1, 2, 3])
  await store.finish(true)
})

test('legacy hardlinks reuse the shared pool and survive collection', async () => {
  const base = fixture(),
    store = generationCache(base, base, 'default'),
    bytes = new Uint8Array([7, 8])
  await populate(store, 'a'.repeat(64), bytes)
  const blob = resolve(store.blobs, sha(bytes)),
    legacy = resolve(base, 'legacy-body')
  linkSync(blob, legacy)
  const inode = statSync(legacy).ino
  await store.finish(false)
  expect(pruneGenerationCache(store.root, { maxBytes: 0 })?.bytes).toBe(2)
  const next = generationCache(base, base, 'next')
  await populate(next, 'b'.repeat(64), bytes)
  expect(statSync(blob).ino).toBe(inode)
  expect([...readFileSync(legacy)]).toEqual([7, 8])
  await next.finish(true)
})

test('a crash before publishing lock ownership cannot strand cache readers', async () => {
  const base = fixture(),
    store = generationCache(base, base, 'default'),
    key = 'a'.repeat(64)
  await populate(store, key, new Uint8Array([1]))
  const abandoned = resolve(store.root, '.lock')
  mkdirSync(abandoned)
  const pending = store.read('mesh', key)
  let result
  try {
    result = await Promise.race([
      pending,
      new Promise(resolve => setTimeout(() => resolve('blocked'), 300)),
    ])
  } finally {
    rmSync(abandoned, { recursive: true })
    await pending
  }
  expect(result).not.toBe('blocked')
  await store.finish(false)
})

test('a killed collector releases the native cache mutex', async () => {
  const base = fixture(),
    store = generationCache(base, base, 'default'),
    key = 'a'.repeat(64)
  await populate(store, key, new Uint8Array([1]))
  const script = `import {DatabaseSync} from 'node:sqlite';
    const db=new DatabaseSync(${JSON.stringify(resolve(store.root, '.mutex.sqlite'))});
    db.exec('BEGIN IMMEDIATE'); process.stdout.write('locked'); setInterval(()=>{},10000);`
  const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (child.stdout === null) throw new Error('Missing collector proof output')
  try {
    await Promise.race([
      once(child.stdout, 'data'),
      once(child, 'exit').then(() => {
        throw new Error('Collector exited before locking')
      }),
    ])
    let settled = false
    const pending = store.read('mesh', key).then(value => {
      settled = true
      return value
    })
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(settled).toBe(false)
    const exited = once(child, 'exit')
    child.kill('SIGKILL')
    await exited
    expect((await pending)?.key).toBe(key)
  } finally {
    if (child.exitCode === null && child.signalCode === null)
      child.kill('SIGKILL')
  }
  await store.finish(false)
})

test('a concurrent hardlink publisher may win the blob race without failing a build', async () => {
  const base = fixture(),
    store = generationCache(base, base, 'default')
  const bytes = new Uint8Array(64 * 1024 * 1024).fill(7),
    reference = resolve(base, 'reference.bin'),
    target = resolve(store.blobs, sha(bytes))
  writeFileSync(reference, bytes)
  mkdirSync(store.blobs, { recursive: true })
  const script = `import {watch,linkSync} from 'node:fs';
    const watcher=watch(${JSON.stringify(store.blobs)},(_,name)=>{
      if(name?.endsWith('.tmp')) {linkSync(${JSON.stringify(reference)},${JSON.stringify(target)});watcher.close();}
    });process.stdout.write('ready');`
  const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (child.stdout === null) throw new Error('Missing publisher proof output')
  const exited = once(child, 'exit')
  try {
    await once(child.stdout, 'data')
    await populate(store, 'a'.repeat(64), bytes)
    await exited
    expect(statSync(target).ino).toBe(statSync(reference).ino)
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL')
      await exited
    }
  }
  await store.finish(false)
})

test('G430 expires history, keeps newest three and protects live and receipt keys under a size cap', async () => {
  const base = fixture(),
    project = resolve(base, 'project')
  mkdirSync(project)
  const old = generationCache(base, project, 'default')
  await populate(old, 'a'.repeat(64), new Uint8Array([1]))
  await old.finish(true)
  const active = generationCache(base, project, 'building')
  await populate(active, 'b'.repeat(64), new Uint8Array([2]))
  for (const [index, value] of ['c', 'd', 'e', 'f'].entries()) {
    const history = generationCache(base, project, 'history')
    await populate(history, value.repeat(64), new Uint8Array([3 + index]))
    await history.finish(false)
    const at = new Date(Date.now() - (5 - index) * 1000)
    utimesSync(
      resolve(history.root, 'keys', 'project', 'mesh', value.repeat(64)),
      at,
      at,
    )
  }
  expect(pruneGenerationCache(old.root)?.removed).toBe(3)
  expect(
    existsSync(resolve(old.root, 'keys', 'project', 'mesh', 'a'.repeat(64))),
  ).toBe(true)
  expect(
    existsSync(resolve(old.root, 'keys', 'project', 'mesh', 'b'.repeat(64))),
  ).toBe(true)
  const result = pruneGenerationCache(old.root, { maxBytes: 0 })
  expect(result).toEqual({ removed: 1, bytes: 2, protected: 2 })
  expect((await active.read('mesh', 'b'.repeat(64)))?.files[0]?.hash).toBe(
    sha(new Uint8Array([2])),
  )
  await active.finish(false)
  expect(
    pruneGenerationCache(old.root, {
      now: Date.now() + 2 * 86_400_000,
      maxBytes: 0,
    }),
  ).toEqual({ removed: 1, bytes: 1, protected: 1 })
  const worker = spawnSync(
    process.execPath,
    [
      resolve('src/sharddev/generationCache.ts'),
      '--prune-generation-cache',
      old.root,
    ],
    { encoding: 'utf8', timeout: 2_000 },
  )
  expect(worker.status, worker.stderr).toBe(0)
  expect(
    JSON.parse(readFileSync(resolve(old.root, '.last-prune.json'), 'utf8'))
      .protected,
  ).toBe(1)
})
