import { mkdir, writeFile } from 'node:fs/promises'

import { skinnedGlb } from '@wildshard/sdk/bake/skinned'

import { referenceSkeletonSource } from '../src/skeletons.ts'

const directory = new URL('../content/skeletons/', import.meta.url)
await mkdir(directory, { recursive: true })
for (const kind of ['biped', 'quadruped'] as const) {
  const source = referenceSkeletonSource(kind)
  try {
    const { glb } = skinnedGlb(source)
    await writeFile(new URL(`${kind}.glb`, directory), glb)
    console.log(`Built kit ${kind}: ${glb.length} bytes`)
  } finally {
    for (const part of source.parts) {
      part.geometry.dispose()
      part.material.dispose()
    }
  }
}
