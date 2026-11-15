/* eslint-disable id-length, max-lines-per-function, typescript/explicit-function-return-type, typescript/prefer-readonly-parameter-types, typescript/promise-function-async, unicorn/import-style */
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { afterEach, describe, it } from 'node:test'

import { formatContent, readContent } from './content.ts'

const dirs: string[] = []
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })),
  )
})

async function product(
  files: Readonly<Record<string, unknown>>,
): Promise<string> {
  const dir = await mkdtemp(resolve('tmp', 'codex-te2e', 'content-'))
  dirs.push(dir)
  await mkdir(resolve(dir, 'sections'), { recursive: true })
  await writeFile(
    resolve(dir, 'shard.json'),
    JSON.stringify({ identity: { slug: 'test-content' } }),
  )
  await Promise.all(
    Object.entries(files).map(async ([name, value]) => {
      const file = resolve(dir, 'sections', `${name}.json`)
      await mkdir(resolve(file, '..'), { recursive: true })
      await writeFile(file, JSON.stringify(value))
    }),
  )
  return dir
}

describe('content bar', () => {
  it('reads row-shaped sections and names every failed template threshold', async () => {
    const dir = await product({
      'combat/items': {
        items: {
          rows: [{ id: 'weapon.one', kind: 'weapon' }],
          loadout: { primary: 'weapon.one' },
        },
      },
      'actors/creatures': {
        creatures: {
          brains: [{ kind: 'pursue' }],
          spawns: [{ species: 'blob' }],
        },
      },
      'actors/species': {
        rows: {
          species: [{ id: 'blob', aggressive: true, variants: [{ hp: 20 }] }],
        },
      },
      'quests/quests': { quests: [{ steps: [{}] }] },
    })
    const report = readContent(dir, 'templates')
    assert.equal(report.counts.weapons, 1)
    assert.match(
      formatContent(report, 'templates'),
      /short hostile species: 1\/4/u,
    )
    assert.match(formatContent(report, 'templates'), /short boss hp: 20\/400/u)
  })

  it('accepts a complete row-shaped template bar', async () => {
    const dir = await product({
      'combat/items': {
        items: {
          rows: [{ id: 'weapon.one', kind: 'weapon' }],
          loadout: { primary: 'weapon.one' },
          pickups: [{}, {}],
        },
      },
      'actors/creatures': {
        creatures: {
          brains: [{ kind: 'pursue' }, { kind: 'patrol' }, { kind: 'hold' }],
          spawns: Array.from({ length: 12 }, () => ({ species: 'boss' })),
          groups: [{}],
        },
      },
      'actors/species': {
        rows: {
          species: Array.from({ length: 4 }, (_, index) => ({
            id: index === 0 ? 'boss' : `hostile-${index}`,
            aggressive: true,
            variants: [{ hp: index === 0 ? 400 : 20 }],
          })),
        },
      },
      'combat/strikes': {
        rows: {
          strikes: [
            { id: 'boss.one' },
            { id: 'boss.two' },
            { id: 'boss.three' },
            { id: 'hostile.four' },
          ],
        },
      },
      'actors/npcs': { questNpcs: [{}] },
      'quests/host': { dialogue: [{ nodes: [{}, {}] }] },
      'quests/quests': { quests: [{ steps: [{}, {}, {}, {}] }] },
      'world/movers': { movers: [{}] },
      'world/targets': {
        rows: {
          itemScenes: [{}, {}],
          interactables: [{}, {}, {}],
          pois: Array.from({ length: 8 }, () => ({})),
        },
      },
      'economy/ledger': {
        ledger: [
          { rewards: [{ kind: 'achievement' }, { kind: 'achievement' }] },
        ],
      },
    })
    const report = readContent(dir, 'templates')
    assert.deepEqual(report.short, [])
  })
})
