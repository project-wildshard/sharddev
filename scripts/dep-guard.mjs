#!/usr/bin/env node
// SDK-SPLIT SP1 (meta docs/plans/SDK-SPLIT-PLAN.md): the dependency guard. For each workspace package in
// pnpm-lock.yaml it prints which of FORBIDDEN its production tree holds (dependencies and optionalDependencies, followed
// through the lockfile's snapshots and through `link:` workspace packages; devDependencies are not shipped), which source
// files import `@wildshard/engine`, which relative imports leave a workspace package (SP2a), and which of the package's
// exports reach such a file through relative imports.
// SP11: strict for the lean packages (LEAN): it exits 1 when one's production tree holds a forbidden name, its source
// imports the engine, or an export reaches it. dev and the workspace root only report.
//
//   node scripts/dep-guard.mjs [--json]
//
// The lockfile is read with a small reader for pnpm's v9 layout (two-space indents, one key per line), so the guard needs
// no YAML package of its own.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, posix, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** What a lean package's production tree must never hold (plan "Target layout", Q36). */
export const FORBIDDEN = [
  '@wildshard/engine',
  'vite',
  'playwright',
  'happy-dom',
  'vitest',
]
const ENGINE = '@wildshard/engine'
/** The packages a shard build installs: none may reach the engine or the dev tools (SP11, Q36). */
export const LEAN = [
  '@wildshard/build',
  '@wildshard/kit',
  '@wildshard/sdk',
  '@wildshard/upload',
]
const PRODUCTION = new Set(['dependencies', 'optionalDependencies'])

const unquote = text =>
  text
    .trim()
    .replace(/^'(.*)'$/u, '$1')
    .replace(/^"(.*)"$/u, '$1')
const indentOf = line => line.length - line.trimStart().length
/** `key: value` or `key:`, with pnpm's quoted keys; the key ends at the first `: ` or a trailing `:`. */
function keyValue(line) {
  const text = line.trim()
  const quoted = /^'([^']*)':(?:\s+(.*))?$/u.exec(text)
  if (quoted !== null)
    return [quoted[1], quoted[2] === undefined ? undefined : unquote(quoted[2])]
  const at = text.indexOf(': ')
  if (at !== -1) return [text.slice(0, at), unquote(text.slice(at + 2))]
  return text.endsWith(':') ? [text.slice(0, -1), undefined] : [text, undefined]
}

/**
 * The parts of a v9 lockfile the guard reads: each importer's dependency groups (name to resolved version) and each
 * snapshot's production dependencies.
 */
export function parseLock(text) {
  const importers = {},
    snapshots = {}
  let section, importer, group, snapshot
  for (const line of text.split('\n')) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue
    const indent = indentOf(line)
    if (indent === 0) {
      section = keyValue(line)[0]
      importer = group = snapshot = undefined
      continue
    }
    const [key, value] = keyValue(line)
    if (section === 'importers') {
      if (indent === 2) {
        importer = key
        importers[importer] = {}
        group = undefined
      } else if (indent === 4 && importer !== undefined) {
        group = key
        importers[importer][group] = {}
      } else if (indent === 6 && group !== undefined)
        importers[importer][group][key] = undefined
      else if (indent === 8 && group !== undefined && key === 'version') {
        const names = Object.keys(importers[importer][group])
        importers[importer][group][names.at(-1)] = value
      }
    } else if (section === 'snapshots') {
      if (indent === 2) {
        snapshot = key
        snapshots[snapshot] = {}
        group = undefined
      } else if (indent === 4 && snapshot !== undefined)
        group = PRODUCTION.has(key) ? key : undefined
      else if (indent === 6 && snapshot !== undefined && group !== undefined)
        snapshots[snapshot][key] = value
    }
  }
  return { importers, snapshots }
}

/** A dependency's snapshot key: `name@version`, or the version itself for an `npm:` alias (`@scope/real@1.0.0`). */
const snapshotKey = (name, version) =>
  /^\d/u.test(version) ? `${name}@${version}` : version
/** The package name a snapshot key names (`@scope/name@1.0.0(peer@2)` is `@scope/name`). */
const nameOf = key => key.slice(0, key.indexOf('@', 1))

/** Every package name in an importer's production tree, through snapshots and `link:` workspace packages. */
export function productionTree(lock, importer) {
  const names = new Set(),
    seen = new Set(),
    seenImporters = new Set()
  const visitImporter = path => {
    if (seenImporters.has(path) || lock.importers[path] === undefined) return
    seenImporters.add(path)
    for (const group of PRODUCTION) {
      for (const [name, version] of Object.entries(
        lock.importers[path][group] ?? {},
      )) {
        if (version === undefined) continue
        names.add(name)
        if (version.startsWith('link:'))
          visitImporter(
            posix.normalize(posix.join(path, version.slice('link:'.length))),
          )
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
const SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)['"]([^'"]+)['"]/gu
/** The module specifiers a source file names: static and dynamic imports, re-exports and requires. */
const specifiers = text => [...text.matchAll(SPECIFIER)].map(match => match[1])
const isEngine = specifier =>
  specifier === ENGINE || specifier.startsWith(`${ENGINE}/`)

function walk(root, folder, files = []) {
  const at = join(root, folder)
  if (!existsSync(at)) return files
  for (const entry of readdirSync(at, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const path = posix.join(folder, entry.name)
    if (entry.isDirectory()) walk(root, path, files)
    else if (
      SOURCE.test(entry.name) &&
      !/\.test\.|\.d\.[cm]?ts$/u.test(entry.name)
    )
      files.push(path)
  }
  return files
}

/** The non-test source files under `folders` (relative to `root`) that import the engine, sorted. */
export function engineImporters(root, folders) {
  return folders
    .flatMap(folder => walk(root, folder))
    .filter(path =>
      specifiers(readFileSync(join(root, path), 'utf8')).some(isEngine),
    )
    .sort()
}

/**
 * The relative imports in the non-test source files under `folders` that resolve outside `root`, as `file -> specifier`,
 * sorted (SP2a): a workspace package ships alone, so its code may not reach into a sibling or the repo root.
 */
export function escapingImports(root, folders) {
  return folders
    .flatMap(folder => walk(root, folder))
    .flatMap(path =>
      specifiers(readFileSync(join(root, path), 'utf8'))
        .filter(specifier => specifier.startsWith('.'))
        .filter(specifier =>
          posix
            .normalize(posix.join(posix.dirname(path), specifier))
            .startsWith('../'),
        )
        .map(specifier => `${path} -> ${specifier}`),
    )
    .sort()
}

/** A relative specifier's file, trying the extensions and index files Node and TypeScript accept. */
function resolveRelative(root, from, specifier) {
  const base = posix.normalize(posix.join(posix.dirname(from), specifier))
  const stem = base.replace(/\.[cm]?js$/u, '')
  for (const candidate of [
    base,
    `${stem}.ts`,
    `${stem}.mts`,
    `${stem}.tsx`,
    `${stem}.mjs`,
    `${stem}.js`,
    `${base}/index.ts`,
    `${base}/index.mjs`,
    `${base}/index.js`,
  ]) {
    const at = join(root, candidate)
    if (existsSync(at) && statSync(at).isFile()) return candidate
  }
  return undefined
}

/** Resolve a package export pattern against real non-test source files. */
function exportTargets(root, target) {
  const path = posix.normalize(target)
  if (!path.includes('*')) return [path]
  const prefix = path.slice(0, path.indexOf('*'))
  const folder = prefix.endsWith('/')
    ? prefix.slice(0, -1)
    : posix.dirname(prefix)
  const pattern = path
    .split('*')
    .map(part => part.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'))
    .join('.*')
  const matches = new RegExp(`^${pattern}$`, 'u')
  return walk(root, folder || '.').filter(file => matches.test(file))
}

/** The export keys whose files reach an engine import through relative imports, sorted. */
export function engineExports(root, exportsMap) {
  const memo = new Map()
  const reaches = (path, stack = new Set()) => {
    if (memo.has(path)) return memo.get(path)
    if (stack.has(path)) return false
    stack.add(path)
    const text = readFileSync(join(root, path), 'utf8')
    let found = false
    for (const specifier of specifiers(text)) {
      if (isEngine(specifier)) {
        found = true
        break
      }
      if (!specifier.startsWith('.')) continue
      const next = resolveRelative(root, path, specifier)
      if (next !== undefined && SOURCE.test(next) && reaches(next, stack)) {
        found = true
        break
      }
    }
    stack.delete(path)
    memo.set(path, found)
    return found
  }
  return Object.entries(exportsMap)
    .filter(([, target]) => typeof target === 'string' && SOURCE.test(target))
    .filter(([, target]) =>
      exportTargets(root, target).some(path => reaches(path)),
    )
    .map(([key]) => key)
    .sort()
}

/** The report for every importer in `root`'s lockfile. */
export function guardReport(root) {
  const lock = parseLock(readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8'))
  return Object.keys(lock.importers)
    .sort()
    .map(importer => {
      const folder = join(root, importer)
      const manifest = JSON.parse(
        readFileSync(join(folder, 'package.json'), 'utf8'),
      )
      const tree = productionTree(lock, importer)
      const sources = ['src', 'bin', 'scripts'].filter(name =>
        existsSync(join(folder, name)),
      )
      return {
        importer,
        name: manifest.name,
        forbidden: FORBIDDEN.filter(name => tree.has(name)),
        engineFiles: engineImporters(folder, sources),
        escapes: importer === '.' ? [] : escapingImports(folder, sources),
        engineExports: engineExports(folder, manifest.exports ?? {}),
      }
    })
}

/** SP11: one line per way a lean package breaks the guard; empty when every lean package is clean. */
export function guardFailures(report) {
  return report
    .filter(row => LEAN.includes(row.name))
    .flatMap(row => [
      ...row.forbidden.map(name => `${row.name}: production tree holds ${name}`),
      ...row.engineFiles.map(
        file => `${row.name}: ${relative('.', file)} imports ${ENGINE}`,
      ),
      ...row.engineExports.map(key => `${row.name}: export ${key} reaches ${ENGINE}`),
    ])
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const report = guardReport(root)
  if (process.argv.includes('--json'))
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  else {
    for (const row of report) {
      console.log(`dep-guard ${row.name ?? row.importer} (${row.importer})`)
      console.log(
        `  production tree holds: ${row.forbidden.length === 0 ? 'none of the forbidden names' : row.forbidden.join(', ')}`,
      )
      console.log(
        `  ${String(row.engineFiles.length)} source files import ${ENGINE}`,
      )
      for (const file of row.engineFiles)
        console.log(`    ${relative('.', file)}`)
      console.log(`  ${String(row.escapes.length)} imports leave the package`)
      for (const escape of row.escapes) console.log(`    ${escape}`)
      console.log(
        `  ${String(row.engineExports.length)} exports reach ${ENGINE}`,
      )
      for (const key of row.engineExports) console.log(`    ${key}`)
    }
  }
  const failures = guardFailures(report)
  for (const line of failures) console.error(`dep-guard: ${line}`)
  if (!process.argv.includes('--json'))
    console.log(
      failures.length === 0
        ? `dep-guard: ${LEAN.join(', ')} are clean (SP11)`
        : `dep-guard: ${String(failures.length)} failures in the lean packages (SP11)`,
    )
  if (failures.length > 0) process.exitCode = 1
}
