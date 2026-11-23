import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { after, describe, it } from 'node:test'

import { migrateDryRun } from './migrate.ts'

// Meta SHARD-COMPAT CP7: `wildshard migrate --dry-run` prints the API's
// dry run for a shard file, and refuses with the API's reason.

const parent = path.resolve('tmp/node-test')
mkdirSync(parent, { recursive: true })
const scratch = mkdtempSync(path.join(parent, 'migrate-'))
after((): void => {
  rmSync(scratch, { recursive: true, force: true })
})
const FILE = path.join(scratch, 'shard.shardfile')
writeFileSync(FILE, 'shard file bytes')

function answering(status: number, body: unknown): typeof fetch {
  const replied = async (): Promise<Response> =>
    await Promise.resolve(Response.json(body, { status }))
  return replied
}

describe('wildshard migrate --dry-run', (): void => {
  it("prints the API's migrations, chain and digest", async (): Promise<void> => {
    const lines: string[] = []
    await migrateDryRun({
      server: 'http://api.test',
      file: FILE,
      report: (line: string): void => {
        lines.push(line)
      },
      fetch: answering(200, {
        ok: true,
        format: '0.1.0.2',
        apiFormat: '0.1.0.3',
        floor: '0.1.0.0',
        chainId: 'c'.repeat(64),
        migrations: ['preparation-marker'],
        digest: 'd'.repeat(64),
      }),
    })
    assert.deepEqual(lines, [
      'format 0.1.0.2, the API is at 0.1.0.3',
      'migrations: preparation-marker',
      'deprecated: none',
      `chain: ${'c'.repeat(64)}`,
      `digest: ${'d'.repeat(64)}`,
    ])
  })

  it("refuses with the API's reason", async (): Promise<void> => {
    await assert.rejects(
      migrateDryRun({
        server: 'http://api.test',
        file: FILE,
        report: (): void => undefined,
        fetch: answering(409, {
          ok: false,
          window: 'above',
          error: "format 0.1.0.9 is newer than the API's 0.1.0.3",
        }),
      }),
      /the API refuses it: format 0\.1\.0\.9 is newer/u,
    )
  })
})
