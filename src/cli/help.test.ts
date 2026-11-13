import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { HELP_VERBS, PACK_ALIAS, USAGE, verbHelp } from './help.ts'

// SHARD-AUTHORING SA2 (J317): help speaks the glossary (meta
// docs/architecture/README.md). A retired word in any verb's help fails here.
// `pack` is allowed only in the deprecated alias's own entry; `shardfile` only
// as code (`<slug>.shardfile`, `--shardfile-only`, `schema shardfile`).

const BIN = fileURLToPath(new URL('../../bin/wildshard.mjs', import.meta.url))

const RETIRED: readonly RegExp[] = [
  /\bproducts?\b/iu,
  /\bpublish/iu,
  /\bpromot/iu,
  /\bcook/iu,
  /\bpack\b/iu,
  /\bheads?\b/iu,
  /\btarball/iu,
  /\brevision/iu,
  /\bstage\b/iu,
  /\bshard version\b/iu,
  /\b(?:shard|author) project/iu,
  /(?<![\w./|`-])shardfile(?![\w/|`-])/iu,
]

const ALIAS_LINES: ReadonlySet<string> = new Set(
  PACK_ALIAS.split('\n').map((line: string): string => line.trim()),
)

/** The retired words in `text`, with the pack alias's own lines taken out. */
function retiredIn(text: string): string[] {
  const rest = text
    .split('\n')
    .filter(
      (line: string): boolean =>
        !ALIAS_LINES.has(line.trim().replace(/^Usage: wildshard /u, '')),
    )
    .join('\n')
  return RETIRED.flatMap((word: Readonly<RegExp>): string[] => {
    const hit = rest.match(word)
    return hit === null ? [] : [hit[0]]
  })
}

function wildshard(args: readonly string[]): {
  status: number | null
  stdout: string
} {
  const run = spawnSync(process.execPath, [BIN, ...args], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'] },
  })
  return { status: run.status, stdout: run.stdout }
}

describe('help in the glossary words (SA2)', (): void => {
  it('catches a retired word, and allows only the pack alias line', (): void => {
    assert.deepEqual(retiredIn('upload a product tarball'), [
      'product',
      'tarball',
    ])
    assert.deepEqual(retiredIn('the shardfile is built'), ['shardfile'])
    assert.deepEqual(retiredIn('pack it'), ['pack'])
    assert.deepEqual(
      retiredIn(`${PACK_ALIAS}\nwrites <slug>.shardfile (--shardfile-only)`),
      [],
    )
  })

  it('has no retired word in the full help', (): void => {
    assert.deepEqual(retiredIn(USAGE), [])
    assert.match(USAGE, /^Usage: wildshard /u)
    assert.match(USAGE, /shard source/u)
    assert.match(USAGE, /shard file/u)
    assert.match(USAGE, /\bupload\b/u)
  })
})

describe('every verb prints its own help (SA2)', (): void => {
  for (const verb of HELP_VERBS) {
    it(`wildshard ${verb} --help prints its help with no retired word`, (): void => {
      const run = wildshard([verb, '--help'])

      assert.equal(run.status, 0)
      assert.equal(run.stdout, verbHelp(verb))
      assert.match(run.stdout, new RegExp(`^Usage: wildshard ${verb} `, 'u'))
      assert.deepEqual(retiredIn(run.stdout), [])
    })
  }

  it('lists every verb the bin routes', (): void => {
    for (const verb of [
      'new',
      'dev',
      'check',
      'hero',
      'upload',
      'build',
      'prepare',
      'validate',
      'prove',
      'synth',
      'schema',
      'serve',
      'build-shards',
      'pack',
    ]) {
      assert.ok(HELP_VERBS.includes(verb), verb)
    }
  })

  it('prints the full help for --help and help, one verb for help <verb>', (): void => {
    assert.equal(wildshard(['--help']).stdout, USAGE)
    assert.equal(wildshard(['help']).stdout, USAGE)
    assert.equal(wildshard(['help', 'upload']).stdout, verbHelp('upload'))
    const unknown = wildshard(['help', 'nope'])
    assert.equal(unknown.status, 1)
  })
})
