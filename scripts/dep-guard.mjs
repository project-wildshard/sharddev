#!/usr/bin/env node
// SDK-SPLIT SP1 (meta docs/plans/SDK-SPLIT-PLAN.md): the dependency guard, in report mode. For each workspace package in
// pnpm-lock.yaml it prints which of FORBIDDEN its production tree holds (dependencies and optionalDependencies, followed
// through the lockfile's snapshots and through `link:` workspace packages; devDependencies are not shipped), which source
// files import `@wildshard/engine`, and which of the package's exports reach such a file through relative imports.
// Report only: it exits 0 whatever it finds. SP11 makes it strict.
//
//   node scripts/dep-guard.mjs [--json]
//
// The lockfile is read with a small reader for pnpm's v9 layout (two-space indents, one key per line), so the guard needs
// no YAML package of its own.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, posix, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** What a lean package's production tree must never hold (plan "Target layout", Q36). */
export const FORBIDDEN = ['@wildshard/engine', 'vite', 'playwright', 'happy-dom', 'vitest']
const ENGINE = '@wildshard/engine'
const PRODUCTION = new Set(['dependencies', 'optionalDependencies'])

const unquote = text => text.trim().replace(/^'(.*)'$/u, '$1').replace(/^"(.*)"$/u, '$1')
const indentOf = line => line.length - line.trimStart().length
/** `key: value` or `key:`, with pnpm's quoted keys; the key ends at the first `: ` or a trailing `:`. */
function keyValue(line) {
  const text = line.trim()
  const quoted = /^'([^']*)':(?:\s+(.*))?$/u.exec(text)
  if (quoted !== null) return [quoted[1], quoted[2] === undefined ? undefined : unquote(quoted[2])]
  const at = text.indexOf(': ')
  if (at !== -1) return [text.slice(0, at), unquote(text.slice(at + 2))]
  return text.endsWith(':') ? [text.slice(0, -1), undefined] : [text, undefined]
}

/**
 * The parts of a v9 lockfile the guard reads: each importer's dependency groups (name to resolved version) and each
 * snapshot's production dependencies.
 */
export function parseLock(text) {
  const importers = {}, snapshots = {}
  let section, importer, group, snapshot
  for (const line of text.split('\n')) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue
    const indent = indentOf(line)
    if (indent === 0) { section = keyValue(line)[0]; importer = group = snapshot = undefined; continue }
    const [key, value] = keyValue(line)
    if (section === 'importers') {
      if (indent === 2) { importer = key; importers[importer] = {}; group = undefined }
      else if (indent === 4 && importer !== undefined) { group = key; importers[importer][group] = {} }
      else if (indent === 6 && group !== undefined) importers[importer][group][key] = undefined
      else if (indent === 8 && group !== undefined && key === 'version') {
        const names = Object.keys(importers[importer][group])
        importers[importer][group][names.at(-1)] = value
      }
    } else if (section === 'snapshots') {
      if (indent === 2) { snapshot = key; snapshots[snapshot] = {}; group = undefined }
      else if (indent === 4 && snapshot !== undefined) group = PRODUCTION.has(key) ? key : undefined
      else if (indent === 6 && snapshot !== undefined && group !== undefined) snapshots[snapshot][key] = value
    }
  }
  return { importers, snapshots }
}

/** A dependency's snapshot key: `name@version`, or the version itself for an `npm:` alias (`@scope/real@1.0.0`). */
const snapshotKey = (name, version) => (/^\d/u.test(version) ? `${name}@${version}` : version)
/** The package name a snapshot key names (`@scope/name@1.0.0(peer@2)` is `@scope/name`). */
const nameOf = key => key.slice(0, key.indexOf('@', 1))

/** Every package name in an importer's production tree, through snapshots and `link:` workspace packages. */
export function productionTree(lock, importer) {
  const names = new Set(), seen = new Set(), seenImporters = new Set()
  const visitImporter = path => {
    if (seenImporters.has(path) || lock.importers[path] === undefined) return
    seenImporters.add(path)
    for (const group of PRODUCTION) {
      for (const [name, version] of Object.entries(lock.importers[path][group] ?? {})) {
        if (version === undefined) continue
        names.add(name)
        if (version.startsWith('link:')) visitImporter(posix.normalize(posix.join(path, version.slice('link:'.length))))
        else visit(snapshotKey(name, version))
      }
    }
  }
  const visit = key => {
    if (seen.has(key)) return
    seen.add(key)
    names.add(nameOf(key))
    for (const [name, version] of Object.entries(lock.snapshots[key] ?? {})) {
      names.add(name)
      if (version !== undefined) visit(snapshotKey(name, version))
    }
  }
  visitImporter(importer)
  return names
}

const SOURCE = /\.(?:[cm]?[jt]s|tsx)$/u
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)['"]([^'"]+)['"]/gu
/** The module specifiers a source file names: static and dynamic imports, re-exports and requires. */
const specifiers = text => [...text.matchAll(SPECIFIER)].map(match => match[1])
const isEngine = specifier => specifier === ENGINE || specifier.startsWith(`${ENGINE}/`)

function walk(root, folder, files = []) {
  const at = join(root, folder)
  if (!existsSync(at)) return files
  for (const entry of readdirSync(at, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const path = posix.join(folder, entry.name)
    if (entry.isDirectory()) walk(root, path, files)
    else if (SOURCE.test(entry.name) && !/\.test\.|\.d\.[cm]?ts$/u.test(entry.name)) files.push(path)
  }
  return files
}

/** The non-test source files under `folders` (relative to `root`) that import the engine, sorted. */
export function engineImporters(root, folders) {
  return folders.flatMap(folder => walk(root, folder))
    .filter(path => specifiers(readFileSync(join(root, path), 'utf8')).some(isEngine))
    .sort()
}

/** A relative specifier's file, trying the extensions and index files Node and TypeScript accept. */
function resolveRelative(root, from, specifier) {
  const base = posix.normalize(posix.join(posix.dirname(from), specifier))
  const stem = base.replace(/\.[cm]?js$/u, '')
  for (const candidate of [base, `${stem}.ts`, `${stem}.mts`, `${stem}.tsx`, `${stem}.mjs`, `${stem}.js`, `${base}/index.ts`, `${base}/index.mjs`, `${base}/index.js`]) {
    const at = join(root, candidate)
    if (existsSync(at) && statSync(at).isFile()) return candidate
  }
  return undefined
}

/** The export keys whose file reaches an engine import through relative imports, sorted. */
export function engineExports(root, exportsMap) {
  const memo = new Map()
  const reaches = (path, stack = new Set()) => {
    if (memo.has(path)) return memo.get(path)
    if (stack.has(path)) return false
    stack.add(path)
    const text = readFileSync(join(root, path), 'utf8')
    let found = false
    for (const specifier of specifiers(text)) {
      if (isEngine(specifier)) { found = true; break }
      if (!specifier.startsWith('.')) continue
      const next = resolveRelative(root, path, specifier)
      if (next !== undefined && SOURCE.test(next) && reaches(next, stack)) { found = true; break }
    }
    stack.delete(path)
    memo.set(path, found)
    return found
  }
  return Object.entries(exportsMap)
    .filter(([, target]) => typeof target === 'string' && SOURCE.test(target))
    .filter(([, target]) => reaches(posix.normalize(target)))
    .map(([key]) => key)
    .sort()
}

/** The report for every importer in `root`'s lockfile. */
export function guardReport(root) {
  const lock = parseLock(readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8'))
  return Object.keys(lock.importers).sort().map(importer => {
    const folder = join(root, importer)
    const manifest = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8'))
    const tree = productionTree(lock, importer)
    const sources = ['src', 'bin', 'scripts'].filter(name => existsSync(join(folder, name)))
    return {
      importer,
      name: manifest.name,
      forbidden: FORBIDDEN.filter(name => tree.has(name)),
      engineFiles: engineImporters(folder, sources),
      engineExports: engineExports(folder, manifest.exports ?? {}),
    }
  })
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const report = guardReport(root)
  if (process.argv.includes('--json')) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  else {
    for (const row of report) {
      console.log(`dep-guard ${row.name ?? row.importer} (${row.importer})`)
      console.log(`  production tree holds: ${row.forbidden.length === 0 ? 'none of the forbidden names' : row.forbidden.join(', ')}`)
      console.log(`  ${String(row.engineFiles.length)} source files import ${ENGINE}`)
      for (const file of row.engineFiles) console.log(`    ${relative('.', file)}`)
      console.log(`  ${String(row.engineExports.length)} exports reach ${ENGINE}`)
      for (const key of row.engineExports) console.log(`    ${key}`)
    }
    console.log('dep-guard: report mode (SP1); nothing fails yet (SP11 makes it strict)')
  }
}
