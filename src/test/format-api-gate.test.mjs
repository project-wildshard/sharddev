// SHARD-COMPAT CP3: sharddev's push refuses a format pin above the API's, from git's pre-push ref lines.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  PACKAGES,
  compareRelease,
  refsFailures,
} from '../scripts/format-api-gate.mjs'

const root = new URL('../../', import.meta.url).pathname

function repoWithPins(versions) {
  const dir = mkdtempSync(join(root, 'tmp', 'format-api-gate-'))
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: dir,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 't',
        GIT_AUTHOR_EMAIL: 't@t',
        GIT_COMMITTER_NAME: 't',
        GIT_COMMITTER_EMAIL: 't@t',
      },
    }).trim()
  git('init', '-q')
  writeFileSync(join(dir, 'package.json'), '{}\n')
  const shas = versions.map(version => {
    for (const folder of PACKAGES) {
      mkdirSync(join(dir, folder), { recursive: true })
      writeFileSync(
        join(dir, folder, 'package.json'),
        `${JSON.stringify({ dependencies: { '@wildshard/format': `npm:@wildshard/shard-format@${version}` } })}\n`,
      )
    }
    git('add', '-A')
    git('commit', '-q', '--no-verify', '-m', version)
    return git('rev-parse', 'HEAD')
  })
  return { dir, shas }
}

const api = version => ({
  observe: async () => version,
  env: {},
  warn: () => {},
})

test('a main push moving the pin above the API is refused, naming both versions', async () => {
  mkdirSync(join(root, 'tmp'), { recursive: true })
  const { dir, shas } = repoWithPins(['0.66.0', '0.67.0'])
  try {
    const line = `refs/heads/main ${shas[1]} refs/heads/main ${shas[0]}`
    const refused = await refsFailures(line, dir, api('0.66.0'))
    assert.equal(refused.length, 1)
    assert.match(refused[0], /0\.67\.0 is above the API's 0\.66\.0/u)
    // The remote tip this clone lacks: compared from the pushed commit's parent.
    assert.equal(
      (
        await refsFailures(
          `refs/heads/main ${shas[1]} refs/heads/main ${'f'.repeat(40)}`,
          dir,
          api('0.66.0'),
        )
      ).length,
      1,
    )
    assert.deepEqual(await refsFailures(line, dir, api('0.67.0')), [])
    assert.deepEqual(
      await refsFailures(line, dir, {
        ...api('0.66.0'),
        env: { ALLOW_FORMAT_AHEAD: '1' },
      }),
      [],
    )
    assert.deepEqual(
      await refsFailures(
        `refs/heads/plan/x ${shas[1]} refs/heads/plan/x ${shas[0]}`,
        dir,
        api('0.66.0'),
      ),
      [],
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('an unreachable API warns and passes', async () => {
  const { dir, shas } = repoWithPins(['0.66.0', '0.67.0'])
  try {
    const warned = []
    const refused = await refsFailures(
      `refs/heads/main ${shas[1]} refs/heads/main ${shas[0]}`,
      dir,
      {
        observe: async () => undefined,
        env: {},
        warn: line => warned.push(line),
      },
    )
    assert.deepEqual(refused, [])
    assert.equal(warned.length, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('releases compare numerically', () => {
  assert.ok(compareRelease('0.10.0', '0.9.9') > 0)
  assert.equal(compareRelease('0.66.0', '0.66.0'), 0)
})

test('the pre-push hook every main push runs calls the gate', () => {
  assert.match(
    readFileSync(join(root, '.githooks/pre-push'), 'utf8'),
    /node src\/scripts\/format-api-gate\.mjs refs/u,
  )
})
