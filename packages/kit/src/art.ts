// SF2 (meta standalone shardfiles, Jake SD1 2026-11-26: "Stuff that belongs in two shards can be in the kit, stuff that
// only lives in one shard ... can go into that shard source git repo"). Zone art two or more zones use: ground texture
// sets and skies, as images only (the cook makes every KTX2, J525). A shard names a file by its own URL,
// `/assets/<slug>/<path>`, and the SDK copies `content/art/<path>` into its shardfile when the shard's `static/` lacks it,
// so the shardfile stands alone and no zone reads art from the engine.
// oxlint-disable-next-line import/no-nodejs-modules -- the SDK reads the kit's files at pack time.
import { existsSync, readFileSync, statSync } from 'node:fs'
// oxlint-disable-next-line import/no-nodejs-modules -- the SDK reads the kit's files at pack time.
import { fileURLToPath } from 'node:url'

import * as v from 'valibot'

/** The folder the kit's shared art lives in. */
export const KIT_ART_ROOT: string = fileURLToPath(
  new URL('../content/art/', import.meta.url),
)

const SetPath = v.pipe(
  v.string(),
  v.regex(/^(?:tex\/[a-z0-9_]+|hdri\/[a-z0-9_]+)$/u),
)
const ArtIndexSchema = v.strictObject({
  version: v.literal(1),
  about: v.string(),
  sets: v.record(
    SetPath,
    v.strictObject({
      zones: v.array(v.pipe(v.string(), v.regex(/^[a-z0-9-]+$/u))),
    }),
  ),
})
/** `content/art/art.json`: each shared set and the zones that place it. */
export type KitArtIndex = v.InferOutput<typeof ArtIndexSchema>

/** The kit's art index, checked. */
export function kitArtIndex(): KitArtIndex {
  return v.parse(
    ArtIndexSchema,
    JSON.parse(readFileSync(`${KIT_ART_ROOT}art.json`, 'utf8')),
  )
}

/** The set a path under `content/art/` belongs to: its folder for a texture set, its stem for a sky. */
export function kitArtSet(path: string): string | undefined {
  const tex = /^(tex\/[a-z0-9_]+)\/[^/]+$/u.exec(path)?.[1]
  if (tex !== undefined) return tex
  return /^(hdri\/[a-z0-9_]+?)\.[a-z.]+$/u.exec(path)?.[1]
}

/** The kit's file for a shard's mount URL (`/assets/<slug>/<path>`), or undefined when the kit holds none. */
export function kitArtFile(url: string, slug: string): string | undefined {
  const prefix = `/assets/${slug}/`
  if (!url.startsWith(prefix)) return undefined
  const path = url.slice(prefix.length)
  if (path.split('/').includes('..') || kitArtSet(path) === undefined)
    return undefined
  const file = `${KIT_ART_ROOT}${path}`
  return existsSync(file) && statSync(file).isFile() ? file : undefined
}
