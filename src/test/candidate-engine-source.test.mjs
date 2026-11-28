// Copied from shard-open-plots test/ci21-candidate-source.test.mjs (meta QA69), plus the sdk's devDependency edge.
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  declaredEnginePin,
  lockedEngineSource,
  lockedEngineSources,
  pinnedEngineCommit,
  PRODUCER_PIN,
} from '../scripts/candidate-engine-source.mjs'

const sha = '922b9d451ef5c86cfbfc91154bb95c58c9af6614'
const codeload = `https://codeload.github.com/project-wildshard/engine/tar.gz/${sha}`
const entry = (key, resolution) =>
  `  '${key}':\n    resolution: {${resolution}}\n    version: 0.1.100\n\n`
const snapshot = `snapshots:\n\n  '@wildshard/engine@git+ssh://git@github.com/project-wildshard/engine.git#${sha}(three@0.186.0)':\n    dependencies:\n      three: 0.186.0\n`

test('a git resolution of project-wildshard/engine reads as its codeload tarball', () => {
  const lock = `packages:\n\n${entry(`@wildshard/engine@git+ssh://git@github.com/project-wildshard/engine.git#${sha}`, `commit: ${sha}, repo: git@github.com:project-wildshard/engine.git, type: git`)}${snapshot}`
  assert.equal(lockedEngineSource(lock), codeload)
})

test('a codeload tarball resolution reads as itself', () => {
  const lock = `packages:\n\n${entry(`@wildshard/engine@${codeload}`, `tarball: ${codeload}`)}`
  assert.equal(lockedEngineSource(lock), codeload)
})

test('the npm prerelease is a registry source, never the candidate', () => {
  const lock = `packages:\n\n${entry('@wildshard/engine@0.1.100-next.922b9d45', 'integrity: sha512-abc==')}`
  assert.equal(lockedEngineSource(lock), 'registry')
})

test('a registry copy beside the candidate, another repo, or no engine is refused', () => {
  const both = `packages:\n\n${entry(`@wildshard/engine@${codeload}`, `tarball: ${codeload}`)}${entry('@wildshard/engine@0.1.100-next.922b9d45', 'integrity: sha512-abc==')}`
  assert.throws(() => lockedEngineSource(both), /2 @wildshard\/engine sources/u)
  const other = `packages:\n\n${entry(`@wildshard/engine@git+ssh://x#${sha}`, `commit: ${sha}, repo: git@github.com:someone/engine.git, type: git`)}`
  assert.deepEqual(lockedEngineSources(other), [
    `git:git@github.com:someone/engine.git#${sha}`,
  ])
  assert.throws(
    () => lockedEngineSource('packages:\n'),
    /0 @wildshard\/engine sources: none/u,
  )
})

// Meta QA65: cook-play matched the producer's version as X.Y.Z only, so every run since the pin moved to npm next's
// 0.1.100-next.922b9d45 went red in all three partitions (hidden by continue-on-error). Both read one rule now.
test('the producer pin admits a release and npm next’s exact prerelease, nothing looser', () => {
  for (const pin of ['0.1.100', '0.1.100-next.922b9d45']) assert.match(pin, PRODUCER_PIN)
  for (const pin of ['0.1', '0.1.100-beta.1', '0.1.100-next.xyz', '^0.1.100', 'latest']) assert.doesNotMatch(pin, PRODUCER_PIN)
})

// Meta QA68: the workflow's hand-typed candidate sat on an 11-16 engine whose exports lack host/headlessFolder, so
// cook-play went red in every partition (hidden by continue-on-error). The candidate now defaults to the pin's commit.
test('the default candidate is the commit behind the producer pin', async () => {
  const asked = []
  const lookup = async query => (asked.push(query), sha)
  assert.equal(await pinnedEngineCommit('0.1.100-next.922b9d45', lookup), sha)
  assert.equal(await pinnedEngineCommit('0.1.100', lookup), sha)
  assert.deepEqual(asked, [{ version: '0.1.100-next.922b9d45' }, { tag: 'v0.1.100' }])
})

test('a pin with no commit, a short commit or another commit is refused', async () => {
  await assert.rejects(pinnedEngineCommit('0.1.100-next.9c487655', async () => sha), /another commit/u)
  await assert.rejects(pinnedEngineCommit('0.1.100', async () => undefined), /no full commit/u)
  await assert.rejects(pinnedEngineCommit('0.1.100', async () => '922b9d45'), /no full commit/u)
  await assert.rejects(pinnedEngineCommit('^0.1.100', async () => sha), /not X\.Y\.Z/u)
})

// Meta QA69: the sdk's engine edge moved to devDependencies, and the producer check read `dependencies` only.
test('the declared engine pin is the sdk package edge, wherever it sits', () => {
  assert.equal(declaredEnginePin({ devDependencies: { '@wildshard/engine': '0.1.100-next.922b9d45' } }), '0.1.100-next.922b9d45')
  assert.equal(declaredEnginePin({ dependencies: { '@wildshard/engine': '0.1.100' }, peerDependencies: { '@wildshard/engine': '*' } }), '0.1.100')
  assert.equal(declaredEnginePin({ peerDependencies: { '@wildshard/engine': '*' } }), undefined)
})
