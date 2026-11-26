// The workspace's packages share one release version (SDK-SPLIT D5): the root package.json's, which the release
// tooling bumps; `stamp` copies it into each published package (SP2b: the sdk lives in packages/sdk).
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, posix, resolve } from 'node:path'
import { ownPeerProblems } from './own-peers.mjs'

const root = resolve(import.meta.dirname, '..', '..')
const read = path => JSON.parse(readFileSync(path, 'utf8'))
const workspace = read(join(root, 'package.json'))
// Publish order: a package before any that depends on it. SDK-SPLIT SP12: all six publish at one version (D5); build,
// dev and the cli (SP10, the `wildshard` bin) joined kit, upload and the sdk.
const PACKAGES = [
  ['packages/kit', '@wildshard/kit'],
  ['packages/upload', '@wildshard/upload'],
  ['packages/sdk', '@wildshard/sdk'],
  ['packages/build', '@wildshard/build'],
  ['packages/dev', '@wildshard/dev'],
  ['packages/cli', '@wildshard/cli'],
].map(([dir, name]) => ({ dir: join(root, dir), path: join(root, dir, 'package.json'), name }))
const manifests = PACKAGES.map(pkg => ({ ...pkg, manifest: read(pkg.path) }))
const OWN = new Set(PACKAGES.map(pkg => pkg.name))
const [command, destination] = process.argv.slice(2)
if (
  manifests.some(pkg => pkg.manifest.name !== pkg.name || pkg.manifest.private === true) ||
  !/^\d+\.\d+\.\d+$/u.test(workspace.version)
)
  throw new Error('Unexpected release workspace identities')

if (command === 'stamp' && destination === undefined) {
  for (const pkg of manifests) {
    if (pkg.manifest.version === workspace.version) continue
    const before = readFileSync(pkg.path, 'utf8')
    writeFileSync(
      pkg.path,
      before.replace(/("version"\s*:\s*)"[^"]*"/u, `$1"${workspace.version}"`),
    )
  }
  console.log(
    `release workspace: ${manifests.map(pkg => pkg.name).join(', ')} ${workspace.version}`,
  )
} else if (command === 'pack' && destination !== undefined) {
  if (manifests.some(pkg => pkg.manifest.version !== workspace.version))
    throw new Error('Package and workspace release versions differ; run release:stamp')
  const output = resolve(destination)
  const allowed = [
    join(root, 'tmp') + '/',
    ...(process.env.RUNNER_TEMP
      ? [resolve(process.env.RUNNER_TEMP) + '/']
      : []),
  ]
  if (!allowed.some(base => output.startsWith(base)))
    throw new Error('Release archives need owned scratch')
  mkdirSync(output, { recursive: true })
  const artifacts = []
  for (const { dir, manifest: pkg } of manifests) {
    const filename = `${pkg.name.replace(/^@/u, '').replaceAll('/', '-')}-${pkg.version}.tgz`
    const archive = join(output, filename)
    execFileSync('pnpm', ['pack', '--out', archive], {
      cwd: dir,
      stdio: ['ignore', 'ignore', 'inherit'],
    })
    const manifest = JSON.parse(
      execFileSync('tar', ['-xOf', archive, 'package/package.json'], {
        encoding: 'utf8',
      }),
    )
    if (manifest.name !== pkg.name || manifest.version !== workspace.version)
      throw new Error('Packed release identity differs')
    const files = new Set(
      execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' })
        .trim()
        .split('\n'),
    )
    for (const file of files) {
      if (!/(?:^|\/)tsconfig(?:\.[^/]+)?\.json$/u.test(file)) continue
      const config = JSON.parse(
        execFileSync('tar', ['-xOf', archive, file], {
          encoding: 'utf8',
        }),
      )
      const parents = Array.isArray(config.extends)
        ? config.extends
        : [config.extends]
      const inputs = [
        ...parents,
        ...(config.references ?? []).map(row => row.path),
      ]
      for (const parent of inputs) {
        if (typeof parent !== 'string' || !parent.startsWith('.')) continue
        const target = posix.normalize(posix.join(posix.dirname(file), parent))
        const candidates = [
          target,
          target + '.json',
          posix.join(target, 'tsconfig.json'),
        ]
        if (!candidates.some(candidate => files.has(candidate))) {
          throw new Error(
            'Missing packed tsconfig parent ' + pkg.name + ' ' + target,
          )
        }
      }
    }
    const targets = []
    const visit = value =>
      typeof value === 'string'
        ? targets.push(value)
        : Object.values(value ?? {}).forEach(visit)
    visit(manifest.exports)
    visit(manifest.bin)
    for (const target of targets) {
      if (
        !target.includes('*') &&
        !files.has(`package/${target.replace(/^\.\//u, '')}`)
      )
        throw new Error(`Missing release export ${pkg.name} ${target}`)
    }
    for (const field of [
      'dependencies',
      'optionalDependencies',
      'peerDependencies',
    ]) {
      if (
        Object.values(manifest[field] ?? {}).some(value =>
          /^(?:workspace|link|file):/u.test(value),
        )
      )
        throw new Error(`Unpublished dependency in ${pkg.name} ${field}`)
    }
    // A peer range on another workspace package admits this release version (own-peers.mjs; release/v0.5.0 refused).
    const peers = ownPeerProblems(manifest, OWN, workspace.version)
    if (peers.length > 0) throw new Error(`Packed ${peers.join('; ')}`)
    // Each workspace package a packed one depends on is pinned at this one release version (D5).
    for (const [name, spec] of Object.entries(manifest.dependencies ?? {}))
      if (OWN.has(name) && spec !== workspace.version)
        throw new Error(`Packed ${pkg.name} pins ${name} ${spec}, not ${workspace.version}`)
    if (
      pkg.name === '@wildshard/sdk' &&
      (manifest.dependencies?.['@wildshard/kit'] === undefined ||
        manifest.dependencies?.['@wildshard/upload'] === undefined)
    )
      throw new Error('Packed SDK does not pin the matching kit and upload')
    const bytes = readFileSync(archive)
    artifacts.push({
      name: pkg.name,
      version: pkg.version,
      archive,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    })
  }
  writeFileSync(
    join(output, 'release-artifacts.json'),
    `${JSON.stringify(artifacts, null, 2)}\n`,
  )
  for (const artifact of artifacts)
    console.log(
      `release archive: ${artifact.name}@${artifact.version}, ${artifact.bytes} bytes, ${artifact.sha256}`,
    )
} else
  throw new Error('usage: release-workspace.mjs stamp | pack <owned scratch>')
