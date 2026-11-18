// oxlint-disable-next-line import/no-nodejs-modules -- Generate reproducible Kit assets.
import { mkdir, writeFile } from 'node:fs/promises'

import { bakeWildlife } from '../src/geometry/wildlife.ts'

const directory = new URL('../content/wildlife/', import.meta.url)
await mkdir(directory, { recursive: true })
for (const kind of ['deer', 'wolf'] as const) {
  const { glb, skin } = await bakeWildlife(kind)
  await writeFile(new URL(`${kind}.glb`, directory), glb)
  await writeFile(new URL(`${kind}.skin.json`, directory), skin)
}
