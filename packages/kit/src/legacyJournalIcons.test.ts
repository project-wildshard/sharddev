import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'

import { legacyJournalIcon } from './legacyJournalIcons.ts'

// Independent engine ec71dd0365 icon()/installKitIcons() extraction, before the kit copy.
const originals = {
  antlers: '110f9d262af275124e547afbdf71f07ef533abab06b1ad13494e9b007aedeb69',
  ghost: '3e028ce0b86276abda5f2774f25e5465f4e68f9df3f933912bef7cdccd1007ef',
  ironhide: 'acec5bd5508fb9bcfa7f4ab003c7e04ca52d93cb92af5ac5fac128140f40190d',
  deer: 'dd5c7f966ed5f44899352e93a0ca57c03a23eeaf2ad455017f6346b1d3806581',
  boar: 'a90eeb927891c13f4b74247ba71645d2f0a02515bfa2179f8e54d60a72d41bed',
  elk: '67dbfa23f79d861808451b866bb0541ef548ddfec3a37666868b09626c59b52e',
  bear: '09d65cad412c62009edde474e7f9026d64d9cdf549f3ce0703283a388eba5cdb',
}

test('all original journal glyph strings retain their independent immutable byte hashes', () => {
  for (const [name, hash] of Object.entries(originals)) {
    const svg = legacyJournalIcon(name)
    assert.equal(createHash('sha256').update(svg).digest('hex'), hash)
    assert.match(svg, /^<svg viewBox="0 0 64 64"/u)
    assert.equal(legacyJournalIcon(name), svg)
  }
  for (const name of ['unknown', '__proto__', 'constructor', 'toString'])
    assert.throws(() => legacyJournalIcon(name), /Unknown kit journal icon/u)
})
