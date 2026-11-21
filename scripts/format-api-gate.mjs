// SHARD-COMPAT CP3 (meta, J486, Q46): API first. A push to main that moves sharddev's `@wildshard/format` pin above
// the version the API serves (`GET https://api.wildshard.io/api/format` -> `package`) is refused, naming both: the
// API is released and deployed on a format before the SDK family pins it, as engine's own gate does
// (engine scripts/format-api-gate.mjs). An unreachable API warns and passes. Escape hatch (J381): ALLOW_FORMAT_AHEAD=1.
// .githooks/pre-push runs `node scripts/format-api-gate.mjs refs` with git's ref lines on stdin.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const FORMAT_API = 'https://api.wildshard.io'
export const PACKAGES = [
  'packages/sdk',
  'packages/dev',
  'packages/build',
  'packages/upload',
]
const FETCH_MS = 10_000
const PIN = /^npm:@wildshard\/shard-format@(\d+\.\d+\.\d+)$/u
const EXACT = /^\d+\.\d+\.\d+$/u
const ZERO = /^0+$/u
// METRICS MT2: a hosted read carries the Wildshard agent marker (engine src/shared/engine/app/actorMarkers.json).
const AGENT_HEADER = 'x-wildshard-agent'
const AGENT_UA = 'WildshardAgent/1'

/** @param {string} left @param {string} right */
export function compareRelease(left, right) {
  const a = left.split('.').map(Number),
    b = right.split('.').map(Number)
  for (let at = 0; at < 3; at += 1)
    if ((a[at] ?? 0) !== (b[at] ?? 0)) return (a[at] ?? 0) - (b[at] ?? 0)
  return 0
}

/** The highest exact format pin across the SDK family's manifests, read by `read(path)`; undefined if none.
 * @param {(path: string) => string | undefined} read */
export function pinnedFormat(read) {
  let best
  for (const folder of PACKAGES) {
    const text = read(`${folder}/package.json`)
    if (text === undefined) continue
    const manifest = JSON.parse(text)
    for (const section of [
      'dependencies',
      'devDependencies',
      'peerDependencies',
    ]) {
      const version = PIN.exec(
        manifest[section]?.['@wildshard/format'] ?? '',
      )?.[1]
      if (
        version !== undefined &&
        (best === undefined || compareRelease(version, best) > 0)
      )
        best = version
    }
  }
  return best
}

/** The format the API serves, or undefined when it cannot be read. @param {string} api @param {typeof fetch} read */
export async function observeApiPackage(
  api = FORMAT_API,
  read = globalThis.fetch,
) {
  try {
    const lane = /^[a-z0-9][a-z0-9._-]{0,63}$/iu.test(
      process.env.WS_LANE_NAME ?? '',
    )
      ? process.env.WS_LANE_NAME
      : '1'
    const response = await read(new URL('/api/format', api), {
      signal: AbortSignal.timeout(FETCH_MS),
      redirect: 'error',
      cache: 'no-store',
      headers: {
        [AGENT_HEADER]: String(lane),
        'user-agent': `node ${AGENT_UA}${lane === '1' ? '' : ` (${lane})`}`,
      },
    })
    if (!response.ok) return undefined
    const body = await response.json()
    return typeof body?.package === 'string' && EXACT.test(body.package)
      ? body.package
      : undefined
  } catch {
    return undefined
  }
}

/** Refusals for a pin move `before` -> `after` (exact versions or undefined).
 * @param {string | undefined} before @param {string | undefined} after
 * @param {{ observe?: () => Promise<string | undefined>, env?: Record<string, string | undefined>, warn?: (line: string) => void }} [options] */
export async function formatApiFailures(
  before,
  after,
  {
    observe = () => observeApiPackage(),
    env = process.env,
    warn = line => console.warn(line),
  } = {},
) {
  if (after === undefined || before === after || env.ALLOW_FORMAT_AHEAD === '1')
    return []
  const api = await observe()
  if (api === undefined) {
    warn(
      `format-api-gate: the API's format could not be read; pin ${after} passes unchecked (CP3)`,
    )
    return []
  }
  return compareRelease(after, api) > 0
    ? [
        `@wildshard/format ${after} is above the API's ${api}: release and deploy api-server on it first (SHARD-COMPAT CP3; ALLOW_FORMAT_AHEAD=1 to override)`,
      ]
    : []
}

/** @param {string} root @param {string} sha @returns {(path: string) => string | undefined} */
function filesAt(root, sha) {
  return path => {
    try {
      return execFileSync('git', ['show', `${sha}:${path}`], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
    } catch {
      return undefined
    }
  }
}

/** git's pre-push ref lines: each main push's remote tip against its pushed tip (the pushed tip's first parent when
 * this clone lacks the remote tip). @param {string} refs @param {string} root @param {Parameters<typeof formatApiFailures>[2]} [options] */
export async function refsFailures(refs, root, options = {}) {
  const failures = []
  for (const line of refs.split('\n')) {
    const [, local, remoteRef, remote] = line.trim().split(/\s+/u)
    if (
      remoteRef !== 'refs/heads/main' ||
      local === undefined ||
      remote === undefined ||
      ZERO.test(local)
    )
      continue
    const after = pinnedFormat(filesAt(root, local))
    const known =
      !ZERO.test(remote) && filesAt(root, remote)('package.json') !== undefined
    const before = pinnedFormat(filesAt(root, known ? remote : `${local}^`))
    failures.push(...(await formatApiFailures(before, after, options)))
  }
  return failures
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === import.meta.filename &&
  process.argv[2] === 'refs'
) {
  const failures = await refsFailures(readFileSync(0, 'utf8'), process.cwd())
  for (const failure of failures) console.error(`format-api-gate: ${failure}`)
  if (failures.length > 0) process.exitCode = 1
}
