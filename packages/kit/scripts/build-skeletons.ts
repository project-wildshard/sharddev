// oxlint-disable-next-line import/no-nodejs-modules -- This Node-only generator writes the reproducible package assets.
import { mkdir, writeFile } from 'node:fs/promises'

import { skinnedGlb } from '@wildshard/sdk/bake/skinned'

import { referenceSkeletonSource } from '../src/skeletons.ts'

const directory = new URL('../content/skeletons/', import.meta.url)
await mkdir(directory, { recursive: true })
await Promise.all(
  (['biped', 'quadruped'] as const).map(async (kind): Promise<void> => {
    const source = referenceSkeletonSource(kind)
    try {
      const { glb } = skinnedGlb(source)
      await writeFile(new URL(`${kind}.glb`, directory), glb)
    } finally {
      for (const part of source.parts) {
        part.geometry.dispose()
        part.material.dispose()
      }
    }
  }),
)
