// SF2: the kit holds only zone art two or more zones use, as images; every file belongs to a set the index names.
import assert from 'node:assert/strict'
// oxlint-disable-next-line import/no-nodejs-modules -- the test walks the kit's own art folder.
import { readdirSync } from 'node:fs'
import { test } from 'node:test'

import {
  KIT_ART_ROOT,
  kitArtFile,
  kitArtIndex,
  kitArtSet,
} from '@wildshard/kit/art'

const files = (): string[] =>
  readdirSync(KIT_ART_ROOT, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name !== 'art.json')
    .map(
      entry =>
        `${entry.parentPath
          .slice(KIT_ART_ROOT.length)
          .replace(/^\/+/u, '')
          .replace(/([^/])$/u, '$1/')}${entry.name}`,
    )

test('names two or more zones for every shared set', () => {
  for (const [set, { zones }] of Object.entries(kitArtIndex().sets)) {
    assert.ok(
      new Set(zones).size >= 2,
      `${set}: fewer than two zones place it, so it belongs in its zone's repo`,
    )
  }
})

test('holds no file outside a set the index names, and no KTX2 or phone copy', () => {
  const { sets } = kitArtIndex()
  const all = files()
  assert.ok(all.length > 0)
  for (const path of all) {
    assert.ok(
      sets[kitArtSet(path) ?? ''] !== undefined,
      `${path}: not in a set art.json names`,
    )
    assert.doesNotMatch(
      path,
      /\.ktx2$|[._-]phone\.|_1k\./u,
      `${path}: the kit holds images only; the cook makes every KTX2 (J525) and the phone's sizes`,
    )
  }
  for (const set of Object.keys(sets))
    assert.ok(
      all.some(path => kitArtSet(path) === set),
      `${set}: named but empty`,
    )
})

test("finds a shard mount URL in the kit and nothing outside the shard's own name", () => {
  assert.equal(
    kitArtFile(
      '/assets/nalati-grasslands/tex/leafy_grass/diffuse.jpg',
      'nalati-grasslands',
    ),
    `${KIT_ART_ROOT}tex/leafy_grass/diffuse.jpg`,
  )
  assert.equal(
    kitArtFile('/assets/tex/leafy_grass/diffuse.jpg', 'nalati-grasslands'),
    undefined,
  )
  assert.equal(
    kitArtFile(
      '/assets/nalati-grasslands/tex/leafy_grass/../../art.json',
      'nalati-grasslands',
    ),
    undefined,
  )
  assert.equal(
    kitArtFile(
      '/assets/nalati-grasslands/tex/no_such_set/diffuse.jpg',
      'nalati-grasslands',
    ),
    undefined,
  )
  assert.notEqual(
    kitArtFile(
      '/assets/nine-dragon-stack/hdri/kloofendal_48d_partly_cloudy_puresky_2k.hdr',
      'nine-dragon-stack',
    ),
    undefined,
  )
})
