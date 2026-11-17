import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { TestContext } from 'node:test'

import { open, upload } from '../../../../../src/test/helpers/upload-run.ts'

// Meta STAGING-BUGBASH SB35: sdk 0.3.6 uploaded Mossgate at format 0.1.0.1
// to a staging serving 0.1, so no pointer moved, and the CLI still printed
// "committed ... for staging" with nothing else. api-server's answer now
// says `held`, and the CLI warns right after the commit line.
test('warns when the API holds the upload below its format', async (context: TestContext): Promise<void> => {
  const run = await open(context)
  run.server.state.held = "format 0.1.0.1 is above staging's 0.1"

  await upload(run)

  const committed = run.lines.findIndex((line: string): boolean =>
    line.startsWith('committed: upload-test 0.0.3 '),
  )
  assert.equal(
    run.lines[committed + 1],
    "warning: held: format 0.1.0.1 is above staging's 0.1; nothing goes live on staging until that channel's format moves",
    run.lines.join('\n'),
  )
})

test('prints no held warning when the API answers none', async (context: TestContext): Promise<void> => {
  const run = await open(context)

  await upload(run)

  assert.ok(
    !run.lines.some((line: string): boolean =>
      line.startsWith('warning: held:'),
    ),
    run.lines.join('\n'),
  )
})
