// FORMAT-PRUNE FP58: sharddev's push refuses a retired word shard-format's one-way ceiling (sdk.retired-vocabulary, 0)
// would count on main, a CHANGELOG line included (v0.4.31's release notes turned every shard-format push red).
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

import { refsFailures, retiredCount, retiredLines, sourcePath } from '../../scripts/retired-vocabulary.mjs'

const parent = resolve('tmp')
mkdirSync(parent, { recursive: true })

function repo(files) {
  const root = mkdtempSync(join(parent, 'retired-vocabulary-'))
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  git('init', '--quiet', '--initial-branch=main')
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  git('add', '.')
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '--no-verify', '-m', 'fixture')
  return { root, head: git('rev-parse', 'HEAD') }
}

test('counts the words as shard-format does: any separator, camelCase split, its two exceptions', () => {
  const word = ['first', 'party'].join('-')
  assert.equal(retiredCount(`- ${word} shards ship`), 1)
  assert.equal(retiredCount(`const ${['is', 'First', 'Party'].join('')} = true`), 1)
  assert.equal(retiredCount(`event.${['is', 'Trus', 'ted'].join('')}`), 0)
  assert.equal(retiredCount('a party of the first rank'), 0)
  assert.equal(sourcePath('CHANGELOG.md'), true)
  assert.equal(sourcePath('packages/sdk/CHANGELOG.md'), true)
  assert.equal(sourcePath('packages/sdk/src/a.ts'), true)
  assert.equal(sourcePath(`${['THIRD', 'PARTY', 'NOTICES'].join('-')}.md`), false)
  assert.equal(sourcePath('scripts/a.mjs'), false)
})

test('a main or release push with a retired word in the CHANGELOG is refused, naming the line', () => {
  const word = ['first', 'party'].join('-')
  const { root, head } = repo({ 'CHANGELOG.md': `# 0.4.31\n\n- ${word} looks\n`, 'packages/sdk/src/a.ts': 'export const a = 1\n', 'scripts/b.mjs': `// ${word}\n` })
  try {
    assert.deepEqual(retiredLines(root, head), [`CHANGELOG.md:3: - ${word} looks`])
    const zero = '0'.repeat(40)
    assert.deepEqual(refsFailures(`refs/heads/main ${head} refs/heads/main ${zero}`, root), [`main CHANGELOG.md:3: - ${word} looks`])
    assert.equal(refsFailures(`refs/heads/release/v0.4.35 ${head} refs/heads/release/v0.4.35 ${zero}`, root).length, 1)
    assert.deepEqual(refsFailures(`refs/heads/plan/x ${head} refs/heads/plan/x ${zero}`, root), [])
    assert.deepEqual(refsFailures(`(delete) ${zero} refs/heads/main ${head}`, root), [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a clean tree passes', () => {
  const { root, head } = repo({ 'CHANGELOG.md': '# 0.4.35\n\n- shards ship their own looks\n' })
  try {
    assert.deepEqual(retiredLines(root, head), [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
