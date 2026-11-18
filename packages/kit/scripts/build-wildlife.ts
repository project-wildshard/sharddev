// oxlint-disable-next-line import/no-nodejs-modules -- Generate reproducible Kit assets.
import { mkdir, writeFile } from 'node:fs/promises'

import { bakeWildlife } from '../src/geometry/wildlife.ts'

const directory = new URL('../content/wildlife/', import.meta.url)
await mkdir(directory, { recursive: true })
await Promise.all(
  (['deer', 'wolf'] as const).map(async (kind): Promise<void> => {
    const { glb, skin } = await bakeWildlife(kind)
    await Promise.all([
      writeFile(new URL(`${kind}.glb`, directory), glb),
      writeFile(new URL(`${kind}.skin.json`, directory), skin),
    ])
  }),
)
