import { stat } from 'node:fs/promises'
import path from 'node:path'

// Meta NEW-SHARD-E2E F28: a scene shard keeps no manifest.json (its discovery
// is generated), so its captured hero is `card/<slot>.jpg` in the shard
// folder, which the generated discovery card wears from the next build on
// (`authorManifest`).

const SCENE_CARD = 'card'
const SCENE_SLOTS = ['thumb', 'portrait', 'landscape'] as const

/** Whether a file is there; an unreadable path counts as absent. */
async function present(file: string): Promise<boolean> {
  return await stat(file).then(
    (): boolean => true,
    (): boolean => false,
  )
}

/** A scene shard's source folder: its `shard.config.ts`. */
async function isSceneShard(shard: string): Promise<boolean> {
  return await present(path.join(shard, 'shard.config.ts'))
}

/** A scene shard's captured card files, by slot: only the ones on disk. */
async function sceneCardUrls(
  shard: string,
): Promise<Readonly<Record<string, string>>> {
  const found = await Promise.all(
    SCENE_SLOTS.map(
      async (slot: string): Promise<readonly [string, string] | undefined> => {
        const url = `${SCENE_CARD}/${slot}.jpg`
        return (await present(path.join(shard, url))) ? [slot, url] : undefined
      },
    ),
  )
  return Object.fromEntries(
    found.filter(
      (
        row: readonly [string, string] | undefined,
      ): row is readonly [string, string] => row !== undefined,
    ),
  )
}

export { isSceneShard, sceneCardUrls }
