// J524, RL2: upload checks the authored shardVersion against its package and request.
/* oxlint-disable node/no-sync, import/no-nodejs-modules -- A release codemod edits a shard repo once. */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

export const title = 'Declare the shard version in the authored shard header'
export const guide = 'migrate-0-9-0'

const VERSION =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[a-zA-Z-][\da-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][\da-zA-Z-]*))*)?$/u

function read(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

function hasSource(dir) {
  return ['shard.json', 'shard.config.ts', 'shard.config.mjs', 'sections'].some(
    path => existsSync(join(dir, path)),
  )
}

function sourceFolders(root) {
  const group = join(root, 'src', 'shards')
  if (existsSync(group)) {
    return readdirSync(group, { withFileTypes: true })
      .filter(
        entry => entry.isDirectory() && hasSource(join(group, entry.name)),
      )
      .map(entry => join(group, entry.name))
  }
  return [join(root, 'src'), root].filter(hasSource)
}

function packageVersion(folder, root) {
  for (let dir = folder; ; dir = dirname(dir)) {
    const file = join(dir, 'package.json')
    if (existsSync(file)) return read(file).version
    if (dir === root) return undefined
  }
}

function changes(project) {
  const root = resolve(project)
  return sourceFolders(root).flatMap(folder => {
    const file = join(folder, 'shard.json'),
      path = relative(root, file)
    const header = existsSync(file) ? read(file) : {}
    const version = packageVersion(folder, root)
    if (typeof version !== 'string' || !VERSION.test(version)) {
      return [
        {
          file,
          path,
          manual: `${path}: set the owning package.json version to a shard SemVer, then rerun migrate`,
        },
      ]
    }
    if (header.shardVersion === version) return []
    if (header.shardVersion !== undefined) {
      return [
        {
          file,
          path,
          manual: `${path}: shardVersion differs from package.json version ${version}. Set both to the intended version`,
        },
      ]
    }
    return [
      { file, path, header: { ...header, shardVersion: version }, version },
    ]
  })
}

export function pending({ project }) {
  const rows = changes(project)
  return rows.length === 0
    ? undefined
    : `${rows.map(row => row.path).join(', ')} need a shardVersion matching package.json`
}

// oxlint-disable-next-line import/no-default-export -- migrate and upgrade load release codemods by their default export.
export default function codemod({ project }) {
  const lines = [],
    manual = []
  for (const row of changes(project)) {
    if (row.manual !== undefined) {
      manual.push(row.manual)
      continue
    }
    writeFileSync(row.file, `${JSON.stringify(row.header, null, 2)}\n`)
    lines.push(`${row.path}: declared shardVersion ${row.version}`)
  }
  return { lines, manual }
}
