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
function author(kind: 'plain' | 'generator' | 'sidecar') {
  mkdirSync('tmp/codex-te2e', { recursive: true })
  const root = mkdtempSync(resolve('tmp/codex-te2e/native-source-'))
  roots.push(root)
  const source = {
    ...emptyShardfile({
      slug: 'native-source',
      name: 'Native source',
      author: 'Test',
      saveRevision: 1,
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
              id: 'fixture.shell',
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
  const emitted = `{sections:${JSON.stringify(platform.sections)},files:new Map(${JSON.stringify([...platform.files].map(([path, bytes]) => [path, [...bytes]]))}.map(([path, bytes])=>[path,new Uint8Array(bytes)]))}`
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
// FORMAT-PRUNE FP20: the species-program family is retired (the engine refuses it at admission, engine b75b5f57d), so a
// product whose platform emits `actors/species-programs` is refused at build on every author path, naming the section,
// and a prior product is left as it was.
for (const kind of ['plain', 'generator', 'sidecar'] as const)
  test(
    `a native species program is refused at build through the ${kind} author path`,
    { timeout: 45000 },
    async () => {
      const root = author(kind),
        destination = resolve(root, 'built')
      mkdirSync(destination)
      writeFileSync(resolve(destination, 'sentinel'), 'previous product')
      await expect(
        buildProject(root, destination, { client: null }),
      ).rejects.toThrow('Section actors/species-programs is retired (FORMAT-PRUNE FP20)')
      expect(readFileSync(resolve(destination, 'sentinel'), 'utf8')).toBe(
        'previous product',
      )
    },
  )
