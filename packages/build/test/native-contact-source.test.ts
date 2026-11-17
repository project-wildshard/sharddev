// oxlint-disable import/no-nodejs-modules -- Real author fixtures own their source and output on disk.
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { resolve } from 'node:path'

import { emptyShardfile } from '@wildshard/sdk/author'
import { afterEach, expect, test } from 'vitest'

import { validateOutputProduct } from '@wildshard/sdk/outputProduct'
import { emitPlatformSections } from '@wildshard/sdk/platformSections'
import { buildProject } from '../src/sharddev/project'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true })
})
const items: unknown = JSON.parse(
  readFileSync(
    new URL('../../sdk/test/fixtures/native-contact-items.json', import.meta.url),
    'utf8',
  ),
)
function author(
  kind: 'plain' | 'generator' | 'sidecar',
  target = 'fixture.shell',
  corrupt = false,
) {
  mkdirSync('tmp/codex-te2e', { recursive: true })
  const root = mkdtempSync(resolve('tmp/codex-te2e/native-source-'))
  roots.push(root)
  const source = {
    ...emptyShardfile({
      slug: 'native-source',
      name: 'Native source',
      author: 'Test',
      revision: 1,
      seed: 1,
    }),
    items,
  }
  const platform = emitPlatformSections(
    new Map([
      [
        'actors/species-programs',
        {
          page: [],
          native: [
            {
              id: target,
              kind: 'different.kind',
              label: 'Shell',
              variants: [
                {
                  id: 'plain',
                  label: 'Plain',
                  rarity: 'common',
                  weight: 1,
                  scale: [1, 1],
                },
              ],
            },
          ],
        },
      ],
    ]),
  )
  const emitted = `{sections:${JSON.stringify(platform.sections)},files:new Map(${JSON.stringify([...platform.files].map(([path, bytes]) => [path, corrupt ? [123, 125] : [...bytes]]))}.map(([path, bytes])=>[path,new Uint8Array(bytes)]))}`
  const output = `{platform:${emitted}}`
  writeFileSync(
    resolve(root, 'shard.config.ts'),
    kind === 'generator'
      ? `export default () => ({shard:${JSON.stringify(source)},output:${output}});`
      : `export default ${JSON.stringify(source)};${kind === 'plain' ? `export const output=${output};` : ''}`,
  )
  if (kind === 'sidecar') {
    mkdirSync(resolve(root, 'generators'))
    writeFileSync(
      resolve(root, 'generators/output.ts'),
      `export const output={};let calls=0;export function prepareOutput(){if(++calls!==1)throw Error('output prepared twice');return ${output};}`,
    )
  }
  return root
}
for (const kind of ['plain', 'generator', 'sidecar'] as const)
  test(
    `native contact source builds through the real ${kind} author path`,
    { timeout: 45000 },
    async () => {
      const root = author(kind),
        destination = resolve(root, 'built')
      await buildProject(root, destination, { client: null })
      const checked = validateOutputProduct(destination)
      expect(checked.shard.items).toEqual(items)
      expect(checked.sections.get('actors/species-programs')).toMatchObject({
        native: [{ id: 'fixture.shell' }],
      })
    },
  )
test(
  'unknown native contact targets refuse before changing a prior product',
  { timeout: 45000 },
  async () => {
    const root = author('sidecar', 'wrong.target'),
      destination = resolve(root, 'built')
    mkdirSync(destination)
    writeFileSync(resolve(destination, 'sentinel'), 'previous product')
    await expect(
      buildProject(root, destination, { client: null }),
    ).rejects.toThrow()
    expect(readFileSync(resolve(destination, 'sentinel'), 'utf8')).toBe(
      'previous product',
    )
  },
)

test(
  'changed native section bytes refuse before changing a prior product',
  { timeout: 45000 },
  async () => {
    const root = author('sidecar', 'fixture.shell', true),
      destination = resolve(root, 'built')
    mkdirSync(destination)
    writeFileSync(resolve(destination, 'sentinel'), 'previous product')
    await expect(
      buildProject(root, destination, { client: null }),
    ).rejects.toThrow('declared bytes')
    expect(readFileSync(resolve(destination, 'sentinel'), 'utf8')).toBe(
      'previous product',
    )
  },
)

test(
  'map packing preserves explicit native item targets and charged image bytes',
  { timeout: 45000 },
  async () => {
    const root = author('sidecar'),
      destination = resolve(root, 'built')
    const bytes = new Uint8Array(
      readFileSync(
        new URL(
          '../../kit/content/journal-icons/bear.png',
          import.meta.url,
        ),
      ),
    )
    await buildProject(root, destination, {
      client: null,
      map: { bytes, tilesHash: 'a'.repeat(64) },
    })
    const checked = validateOutputProduct(destination)
    expect(checked.shard.items).toEqual(items)
    expect(checked.shard.map?.tilesHash).toBe('a'.repeat(64))
    expect(checked.assets.get(checked.shard.map?.image ?? '')).toEqual(bytes)
  },
)
