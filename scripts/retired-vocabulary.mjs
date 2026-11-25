// FORMAT-PRUNE FP58 (opus-fp54, 11-25; was opus-prune2's duplicate FP54): SDK release notes pass the retired-vocabulary
// ceiling before the tag. v0.4.31's CHANGELOG said a retired word; shard-format's one-way test reads sharddev main
// (`sdk.retired-vocabulary`, ceiling 0, shard-format src/tools/one-way-counts.ts), so every shard-format push went red
// until sharddev 216bd54a. This is the same count over the same files, run by .githooks/pre-push on each main or
// release push (release.sh --prepare pushes its branch through it), naming each line. Escape hatch (J381):
// ALLOW_RETIRED_WORDS=1.
//   node scripts/retired-vocabulary.mjs refs   git's pre-push ref lines on stdin
//   node scripts/retired-vocabulary.mjs [rev]  the lines at a revision (default HEAD)
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PARTS = [
  ['code', 'shard'],
  ['data', 'shard'],
  ['first', 'party'],
  ['third', 'party'],
  ['trus', 'ted'],
  ['hy', 'brid'],
]
/** shard-format's `vocabulary`: the retired names, any of `-`, `_` or a space between their halves. */
export const VOCABULARY = new RegExp(`\\b(?:${PARTS.map(parts => parts.join('[-_ ]?')).join('|')})\\b`, 'giu')
/** A candidate line for git grep: the same halves with no word boundary (camelCase splits after). */
const LOOSE = PARTS.map(parts => parts.join('[-_ ]?')).join('|')
/** shard-format's OF15 exceptions: the DOM event's own flag, and the licence notices file. */
const NOT_SHARD_WORDS = new RegExp(`\\b${['is', 'Trus', 'ted'].join('')}\\b`, 'gu')
const NOT_SHARD_FILES = new RegExp(`(?:^|/)${['THIRD', 'PARTY', 'NOTICES'].join('-')}\\.md$`, 'u')
const ZERO = /^0+$/u

/** shard-format's `sourcePath`: the files its SDK inventory reads. @param {string} name */
export function sourcePath(name) {
  return /\.(?:[cm]?[jt]sx?|json|md)$/u.test(name)
    && (/^(?:src\/|docs\/|packages\/[^/]+\/(?:src|docs)\/)/u.test(name) || /^packages\/[^/]+\/[^/]+\.md$/u.test(name) || /^[^/]+\.md$/u.test(name))
    && !NOT_SHARD_FILES.test(name)
}

/** The retired words in one line, counted as shard-format counts them. @param {string} text */
export function retiredCount(text) {
  const split = text.replaceAll(NOT_SHARD_WORDS, '').replaceAll(/(?<lower>[a-z])(?<upper>[A-Z])/gu, '$<lower> $<upper>')
  return [...split.matchAll(VOCABULARY)].length
}

/** Each counted line at `rev`: `path:line: text`. @param {string} root @param {string} rev */
export function retiredLines(root, rev) {
  let out = ''
  try {
    out = execFileSync('git', ['grep', '-I', '-n', '-i', '-E', LOOSE, rev, '--'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  } catch (error) {
    // git grep exits 1 when nothing matches
    if (/** @type {{status?: number}} */ (error).status === 1) return []
    throw error
  }
  const lines = []
  for (const row of out.split('\n')) {
    const match = /^[^:]+:(?<path>[^:]+):(?<line>\d+):(?<text>.*)$/u.exec(row)?.groups
    if (match === undefined || !sourcePath(match.path) || retiredCount(match.text) === 0) continue
    lines.push(`${match.path}:${match.line}: ${match.text.trim().slice(0, 160)}`)
  }
  return lines
}

/** The refusals for git's pre-push ref lines: every pushed tip of main or a release branch. @param {string} refs @param {string} root */
export function refsFailures(refs, root) {
  const failures = []
  for (const line of refs.split('\n')) {
    const [, local, remoteRef] = line.trim().split(/\s+/u)
    if (local === undefined || remoteRef === undefined || ZERO.test(local)) continue
    if (remoteRef !== 'refs/heads/main' && !remoteRef.startsWith('refs/heads/release/')) continue
    for (const found of retiredLines(root, local)) failures.push(`${remoteRef.slice('refs/heads/'.length)} ${found}`)
  }
  return failures
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename) {
  const failures = process.argv[2] === 'refs' ? refsFailures(readFileSync(0, 'utf8'), process.cwd()) : retiredLines(process.cwd(), process.argv[2] ?? 'HEAD')
  for (const failure of failures) console.error(`retired-vocabulary: ${failure}`)
  if (failures.length > 0) {
    console.error('retired-vocabulary: shard-format\'s one-way ceiling for sdk.retired-vocabulary is 0; reword these lines (ALLOW_RETIRED_WORDS=1 to override, J381)')
    if (process.env['ALLOW_RETIRED_WORDS'] !== '1') process.exitCode = 1
  }
}
