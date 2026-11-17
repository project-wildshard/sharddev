import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { homeInstallWarning } from './install-home.ts'

// SDK-SPLIT SP-NE1 (NEW-SHARD-E2E F1): `npm install @wildshard/sdk` in a
// folder with no package.json installs into the nearest folder above that
// has one, often the home folder, and `npx wildshard` then runs that copy.
const HOME = '/Users/author'

describe('homeInstallWarning', (): void => {
  it('warns when the sdk runs from the home folder in a folder below it', (): void => {
    const warning = homeInstallWarning({
      sdk: `${HOME}/node_modules/@wildshard/sdk`,
      cwd: `${HOME}/shards/first`,
      home: HOME,
    })
    assert.ok(warning !== undefined)
    assert.match(warning, /home folder/u)
    assert.match(warning, /npm init -y/u)
  })

  it('sees through pnpm store paths to the installing folder', (): void => {
    const warning = homeInstallWarning({
      sdk: `${HOME}/node_modules/.pnpm/@wildshard+sdk@0.3.9/node_modules/@wildshard/sdk`,
      cwd: `${HOME}/shards/first`,
      home: HOME,
    })
    assert.ok(warning !== undefined)
  })

  it('stays quiet for a project install, in the home folder itself and outside it', (): void => {
    const project = `${HOME}/shards/first`
    assert.equal(
      homeInstallWarning({
        sdk: `${project}/node_modules/@wildshard/sdk`,
        cwd: `${project}/src`,
        home: HOME,
      }),
      undefined,
    )
    assert.equal(
      homeInstallWarning({
        sdk: `${HOME}/node_modules/@wildshard/sdk`,
        cwd: HOME,
        home: HOME,
      }),
      undefined,
    )
    assert.equal(
      homeInstallWarning({
        sdk: '/opt/tools/node_modules/@wildshard/sdk',
        cwd: '/srv/shards/first',
        home: HOME,
      }),
      undefined,
    )
  })
})
