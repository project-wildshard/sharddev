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

// This package as an install lays it out: `pnpm pack`'s tarball, unpacked
// under node_modules, beside only what it declares. pnpm doesn't do the
// install, because a git dependency can't resolve with no network.

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const Pins = record(string(), string())
const ManifestSchema = object({
  bin: record(string(), string()),
  dependencies: Pins,
  peerDependencies: optional(Pins, {}),
})

function shell(command: string, args: readonly string[]): void {
  const done = spawnSync(command, [...args], { cwd: ROOT, encoding: 'utf8' })
  assert.equal(done.status, 0, done.stderr)
}

function linkDependency(modules: string, name: string): void {
  const link = path.join(modules, name)
  mkdirSync(path.dirname(link), { recursive: true })
  symlinkSync(path.join(ROOT, 'node_modules', name), link)
}

function packInto(dir: string): string {
  shell('pnpm', ['pack', '--pack-destination', dir])
  const tarball = readdirSync(dir).find((file: string): boolean =>
    file.endsWith('.tgz'),
  )
  assert.ok(tarball !== undefined)
  return path.join(dir, tarball)
}

function tempFolder(): string {
  return mkdtempSync(path.join(tmpdir(), 'sharddev-installed-'))
}

/** Installs into `dir`, and gives the path of the `wildshard` bin. */
function installWildshard(dir: string): string {
  const tarball = packInto(dir)
  const modules = path.join(dir, 'app/node_modules')
  const unpacked = path.join(modules, '@wildshard/sdk')
  mkdirSync(unpacked, { recursive: true })
  shell('tar', ['-xzf', tarball, '-C', unpacked, '--strip-components', '1'])
  const raw = readFileSync(path.join(unpacked, 'package.json'), 'utf8')
  const manifest = parse(ManifestSchema, JSON.parse(raw))
  // SA8: `three` is a peer the app installs at the sdk's pin; this checkout's copy is that pin.
  for (const name of [
    ...Object.keys(manifest.dependencies),
    ...Object.keys(manifest.peerDependencies),
  ]) {
    linkDependency(modules, name)
  }
  return path.join(unpacked, manifest.bin['wildshard'] ?? 'no bin')
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
