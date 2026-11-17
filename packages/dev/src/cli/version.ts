import { access, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { object, parse, string } from 'valibot'

const PackageJsonSchema = object({ version: string() })

// The package root is the repo root: package.json beside src/.
const PACKAGE_JSON = fileURLToPath(
  new URL('../../package.json', import.meta.url),
)

/** The packages `--version` names, in the order they build on each other (SA4). */
const CHAIN = ['@wildshard/engine', '@wildshard/format', 'three'] as const

async function versionAt(file: string): Promise<string> {
  const raw: unknown = JSON.parse(await readFile(file, 'utf8'))
  return parse(PackageJsonSchema, raw).version
}

async function readVersion(): Promise<string> {
  return await versionAt(PACKAGE_JSON)
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

/** Not every package exports ./package.json: walk node's own lookup dirs. */
async function manifestOf(name: string): Promise<string> {
  const dirs = createRequire(PACKAGE_JSON).resolve.paths(name) ?? []
  for (const dir of dirs) {
    const file = path.join(dir, name, 'package.json')
    // oxlint-disable-next-line no-await-in-loop -- the first hit wins, in order
    if (await exists(file)) {
      return file
    }
  }
  throw new Error(`cannot find ${name}`)
}

/**
 * The sdk, engine, shard-format and `three` chain this installed sdk
 * resolves, one `<name> <version>` line each (meta SHARD-AUTHORING SA4).
 */
async function readVersionChain(): Promise<string[]> {
  const rows = await Promise.all(
    CHAIN.map(
      async (name: string): Promise<string> =>
        `${name} ${await versionAt(await manifestOf(name))}`,
    ),
  )
  return [`@wildshard/sdk ${await readVersion()}`, ...rows]
}

export { readVersion, readVersionChain }
