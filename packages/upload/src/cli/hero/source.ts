import { access } from 'node:fs/promises'
import path from 'node:path'

// QA 11-16 mini F38, re-walked in meta QA 11-25 row 20 on sdk 0.4.34: the
// folder build writes `<root>/public/shardfiles/<name>` (older layouts:
// `<root>/out/<name>`), and the hero check looked for the source under
// `public/src/shards/<name>`, so the build that is uploaded never checked it.

/** A single-shard repo's `src/` holds one of these: a scene config, or a manifest. */
const SINGLE_SOURCE_FILES = ['shard.config.ts', 'manifest.json'] as const

async function exists(file: string): Promise<boolean> {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

/** The repo a built product folder sits in. */
function projectRoot(resolved: string): string {
  const parent = path.dirname(resolved)
  return path.basename(parent) === 'shardfiles' &&
    path.basename(path.dirname(parent)) === 'public'
    ? path.dirname(path.dirname(parent))
    : path.dirname(parent)
}

/** The source shard folder of a built product: `src/shards/<name>`, or `src` in a single-shard repo (J317). */
async function sourceShard(product: string): Promise<string> {
  const resolved = path.resolve(product)
  const root = projectRoot(resolved)
  const many = path.join(root, 'src', 'shards', path.basename(resolved))
  if (await exists(many)) {
    return many
  }
  const single = path.join(root, 'src')
  const found = await Promise.all(
    SINGLE_SOURCE_FILES.map(
      async (name: string): Promise<boolean> =>
        await exists(path.join(single, name)),
    ),
  )
  return found.includes(true) ? single : many
}

export { sourceShard }
