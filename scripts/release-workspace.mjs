// The SDK and kit share one release version (SDK-SPLIT D5).
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = path => JSON.parse(readFileSync(path, 'utf8'))
const sdk = read(join(root, 'package.json'))
const kitPath = join(root, 'packages/kit/package.json')
const kit = read(kitPath)
const [command, destination] = process.argv.slice(2)
if (
  sdk.name !== '@wildshard/sdk' ||
  kit.name !== '@wildshard/kit' ||
  !/^\d+\.\d+\.\d+$/u.test(sdk.version)
)
  throw new Error('Unexpected release workspace identities')

if (command === 'stamp' && destination === undefined) {
  if (kit.version !== sdk.version) {
    const before = readFileSync(kitPath, 'utf8')
    writeFileSync(
      kitPath,
      before.replace(/("version"\s*:\s*)"[^"]*"/u, `$1"${sdk.version}"`),
    )
  }
  console.log(`release workspace: SDK and kit ${sdk.version}`)
} else if (command === 'pack' && destination !== undefined) {
  if (sdk.version !== kit.version)
    throw new Error('SDK and kit release versions differ; run release:stamp')
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
  for (const [dir, pkg] of [
    [join(root, 'packages/kit'), kit],
    [root, sdk],
  ]) {
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
    if (manifest.name !== pkg.name || manifest.version !== sdk.version)
      throw new Error('Packed release identity differs')
    const files = new Set(
      execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' })
        .trim()
        .split('\n'),
    )
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
    if (
      pkg.name === sdk.name &&
      manifest.dependencies?.['@wildshard/kit'] !== kit.version
    )
      throw new Error('Packed SDK does not pin the matching kit')
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
