import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { object, optional, parse, record, string } from 'valibot'

import { prepareFolder, shardfileFiles } from './shardfile.ts'

import type { InferOutput } from 'valibot'

// This package as an install lays it out: `pnpm pack`'s tarball, unpacked
// under node_modules, beside only what it declares. pnpm doesn't do the
// install, because a git dependency can't resolve with no network.

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const Pins = record(string(), string())
const Bins = record(string(), string())
const ManifestSchema = object({
  bin: optional(Bins, {}),
  dependencies: Pins,
  peerDependencies: optional(Pins, {}),
})

function shell(
  command: string,
  args: readonly string[],
  cwd: string = ROOT,
): void {
  const done = spawnSync(command, [...args], { cwd, encoding: 'utf8' })
  assert.equal(done.status, 0, done.stderr)
}

function linkDependency(modules: string, name: string, from: string): void {
  const link = path.join(modules, name)
  mkdirSync(path.dirname(link), { recursive: true })
  symlinkSync(path.join(from, 'node_modules', name), link)
}

function packInto(dir: string, from: string): string {
  const before = new Set(readdirSync(dir))
  shell('pnpm', ['pack', '--pack-destination', dir], from)
  const tarball = readdirSync(dir).find(
    (file: string): boolean => file.endsWith('.tgz') && !before.has(file),
  )
  assert.ok(tarball !== undefined)
  return path.join(dir, tarball)
}

function tempFolder(): string {
  return mkdtempSync(path.join(tmpdir(), 'sharddev-installed-'))
}

// SDK-SPLIT SP8c: the bin is @wildshard/dev's and the library is
// @wildshard/sdk's; both are packed and unpacked side by side, as an install
// of dev lays them out. Every other dependency links to the checkout's copy.
const SDK = path.resolve(ROOT, '../sdk')

type Manifest = InferOutput<typeof ManifestSchema>

/** `from`'s `pnpm pack` tarball, unpacked at `app/node_modules/<name>`. */
function unpack(dir: string, name: string, from: string): Manifest {
  const unpacked = path.join(dir, 'app/node_modules', name)
  mkdirSync(unpacked, { recursive: true })
  const tarball = packInto(dir, from)
  shell('tar', ['-xzf', tarball, '-C', unpacked, '--strip-components', '1'])
  const text = readFileSync(path.join(unpacked, 'package.json'), 'utf8')
  const raw: unknown = JSON.parse(text)
  return parse(ManifestSchema, raw)
}

type Pinned = Readonly<{
  dependencies: Readonly<Record<string, string>>
  peerDependencies: Readonly<Record<string, string>>
}>

/** Links every dependency and peer of each package, once, from its checkout. */
function linkMissing(
  modules: string,
  sources: readonly (readonly [Pinned, string])[],
): void {
  const linked = new Set(['@wildshard/dev', '@wildshard/sdk'])
  for (const [manifest, from] of sources) {
    const names = [
      ...Object.keys(manifest.dependencies),
      ...Object.keys(manifest.peerDependencies),
    ]
    for (const name of names.filter(
      (dep: string): boolean => !linked.has(dep),
    )) {
      linked.add(name)
      linkDependency(modules, name, from)
    }
  }
}

/** Installs into `dir`, and gives the path of the `wildshard` bin. */
function installWildshard(target: string): string {
  const dir = path.resolve(target)
  const modules = path.join(dir, 'app/node_modules')
  const dev = unpack(dir, '@wildshard/dev', ROOT)
  const sdk = unpack(dir, '@wildshard/sdk', SDK)
  // SA8: `three` is a peer the app installs at the sdk's pin; this checkout's copy is that pin.
  linkMissing(modules, [
    [dev, ROOT],
    [sdk, SDK],
  ])
  return path.join(modules, '@wildshard/dev', dev.bin['wildshard'] ?? 'no bin')
}

/** The real product on disk, as `wildshard build` reads it. */
async function writeProduct(dir: string, name: string): Promise<string> {
  const folder = path.join(dir, name)
  const files = await shardfileFiles({ slug: 'upload-test' })
  for (const [file, bytes] of files) {
    const target = path.join(folder, file)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, bytes)
  }
  return folder
}

/**
 * The product as `wildshard prepare` leaves it (sdk 0.3), from the fixture
 * recording: upload refuses the draft `writeProduct` writes (J198).
 */
async function writePreparedProduct(
  dir: string,
  name: string,
): Promise<string> {
  const folder = await writeProduct(dir, name)
  await prepareFolder(folder)
  return folder
}

export { installWildshard, tempFolder, writePreparedProduct, writeProduct }
