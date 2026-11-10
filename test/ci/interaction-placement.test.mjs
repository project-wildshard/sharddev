// CI-only installed author contracts. Engine owns the actual progress/floor companion.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'

import {
  autoFlag,
  bindInteractPlacements,
  readInteractPlacements,
} from '@wildshard/engine/world/interact/types'

import { installWildshard } from '../../src/test/helpers/install.ts'

void test(
  'installed authored placements preserve rows, quest law, order and all strict refusals',
  { timeout: 9500 },
  async () => {
    const started = performance.now(),
      parent = 'tmp/codex-interaction-placement'
    mkdirSync(parent, { recursive: true })
    const root = mkdtempSync(join(parent, 'consumer-'))
    try {
      installWildshard(root)
      const author = createRequire(
        join(
          process.cwd(),
          root,
          'app/node_modules/@wildshard/sharddev/package.json',
        ),
      )
      const { bindInteractionPlacements, readInteractionPlacements } =
        await import(
          pathToFileURL(author.resolve('@wildshard/sharddev/interactions')).href
        )
      const table = {
        external: ['met'],
        rows: [
          {
            kind: 'lever',
            id: 'handle',
            label: 'Pull',
            at: { poi: 'world', x: 1, z: 2 },
            requires: { all: ['met'] },
            latch: true,
          },
          {
            kind: 'door',
            id: 'gate',
            look: 'sluice',
            w: 2,
            h: 2,
            at: { poi: 'world', x: 2, z: 3 },
            opensWhen: { all: ['lever:handle'] },
          },
        ],
      }
      const placements = [
        { id: 'gate', kind: 'door', x: 20, y: 4, z: 30, yaw: 1 },
        { id: 'handle', kind: 'lever', x: 10, y: 3, z: 20, yaw: 0 },
      ]
      const before = JSON.stringify(table),
        source = JSON.stringify(placements)
      const bound = bindInteractionPlacements(table, placements),
        control = bindInteractPlacements(table, placements)
      assert.deepEqual(bound, control)
      assert.equal(JSON.stringify(bound), JSON.stringify(control))
      assert.deepEqual(
        bound.rows.map(row => row.id),
        table.rows.map(row => row.id),
      )
      const handle = bound.rows.find(row => row.id === 'handle')
      assert.ok(handle?.kind === 'lever')
      assert.equal(handle.label, 'Pull')
      assert.equal(handle.latch, true)
      assert.deepEqual(handle.requires, { all: ['met'] })
      assert.deepEqual(handle.at, { poi: 'world', x: 10, y: 3, z: 20, yaw: 0 })
      assert.equal(autoFlag(handle), 'lever:handle')
      assert.deepEqual(bound.rows[1].opensWhen, { all: ['lever:handle'] })
      assert.equal(JSON.stringify(table), before)
      assert.equal(JSON.stringify(placements), source)
      assert.deepEqual(table.rows[0].at, { poi: 'world', x: 1, z: 2 })
      for (const invalid of [
        placements.slice(0, 1),
        [...placements, placements[0]],
        [{ ...placements[0], id: 'foreign' }, placements[1]],
        [{ ...placements[0], kind: 'key' }, placements[1]],
      ]) {
        assert.throws(() => bindInteractPlacements(table, invalid))
        assert.throws(() => bindInteractionPlacements(table, invalid))
        assert.equal(JSON.stringify(table), before)
      }
      for (const reader of [
        readInteractPlacements,
        readInteractionPlacements,
      ]) {
        assert.throws(() =>
          reader([
            { id: 'bad', kind: 'lever', x: Infinity, y: 0, z: 0, yaw: 0 },
          ]),
        )
        assert.throws(() => reader({}))
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
    assert.ok(
      performance.now() - started < 9500,
      'Complete installed placement proof exceeds 9.5 seconds',
    )
  },
)
