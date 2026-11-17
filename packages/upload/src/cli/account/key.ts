import { link, mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

// The account key (meta SHARD-DELETE DEL6, J309, J310): `wildshard account`
// stores the `wsk_` key api-server answers once, and upload sends it as
// `Authorization: Bearer` on the ticket and the commit. WILDSHARD_API_KEY
// wins over the file, so CI can pass a secret. The key is never printed
// whole: whoami shows its first characters only, and a malformed key is
// refused without echoing it.

/** Where `wildshard account` keeps the key, under the user's home. */
const KEY_PATH = ['.config', 'wildshard', 'sharddev-key'] as const

const FILE_MODE = 0o600
const FOLDER_MODE = 0o700
const FIRST = 0
const SHOWN = 8
const HALF = 2
const KEY_SHAPE = /^wsk_[\w-]+$/u
const LOOPBACK: ReadonlySet<string> = new Set([
  'localhost',
  '127.0.0.1',
  '[::1]',
])

/** The key and where it came from. */
interface ApiKey {
  readonly key: string
  /** `WILDSHARD_API_KEY`, or the key file's path. */
  readonly source: string
}

/** A key file being written: the key lands in `draft`, then at `file`. */
interface KeyDraft {
  /** Keep the key: write it, then move it to the key file. */
  readonly keep: (key: string) => Promise<void>
  /** Nothing to keep: remove the draft. */
  readonly drop: () => Promise<void>
}

function keyFile(home: string = homedir()): string {
  return path.join(home, ...KEY_PATH)
}

function missing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

/** The key file's text, trimmed, or undefined with no file. */
async function readKeyFile(file: string): Promise<string | undefined> {
  try {
    const text = await readFile(file, 'utf8')
    const key = text.trim()
    return key === '' ? undefined : key
  } catch (error: unknown) {
    if (missing(error)) {
      return undefined
    }
    throw error
  }
}

/** The key, refused (never echoed) unless it is shaped like a `wsk_` key. */
function shaped(found: ApiKey): ApiKey {
  if (!KEY_SHAPE.test(found.key)) {
    throw new Error(`the account key in ${found.source} is not a wsk_ key`)
  }
  return found
}

/** WILDSHARD_API_KEY when set, else the key file, else undefined. */
async function readApiKey(
  fromEnv: string | undefined,
  file: string = keyFile(),
): Promise<ApiKey | undefined> {
  if (fromEnv !== undefined && fromEnv.trim() !== '') {
    return shaped({ key: fromEnv.trim(), source: 'WILDSHARD_API_KEY' })
  }
  const key = await readKeyFile(file)
  return key === undefined ? undefined : shaped({ key, source: file })
}

/** Whether a key file is there already (an empty one counts). */
async function keyFileExists(file: string): Promise<boolean> {
  try {
    await readFile(file)
    return true
  } catch (error: unknown) {
    if (missing(error)) {
      return false
    }
    throw error
  }
}

/**
 * Open a mode-600 draft beside the key file before the account is made, so
 * a folder that can't be written refuses before the API shows the key.
 * Keeping links the draft to the key file (refusing one that appeared
 * meanwhile) or, with `force`, renames over it; if that fails the key stays
 * in the draft, whose path the error names.
 */
async function draftKeyFile(file: string, force: boolean): Promise<KeyDraft> {
  await mkdir(path.dirname(file), { recursive: true, mode: FOLDER_MODE })
  const draft = `${file}.${String(process.pid)}.new`
  const handle = await open(draft, 'wx', FILE_MODE)
  const drop = async (): Promise<void> => {
    await handle.close()
    await rm(draft, { force: true })
  }
  const keep = async (key: string): Promise<void> => {
    await handle.writeFile(`${key}\n`)
    await handle.close()
    try {
      await (force ? rename(draft, file) : link(draft, file))
    } catch (error: unknown) {
      throw new Error(
        `the key is saved in ${draft}, not ${file}: ${String(error)}`,
        { cause: error },
      )
    }
    await rm(draft, { force: true })
  }
  return { keep, drop }
}

/** The key's first characters and an ellipsis: enough to tell keys apart. */
function maskKey(key: string): string {
  return `${key.slice(FIRST, Math.min(SHOWN, Math.floor(key.length / HALF)))}…`
}

/** What is wrong with sending a key to `server`: only https, or loopback. */
function keyTransport(server: string): string | undefined {
  const url = URL.parse(server)
  const safe =
    url !== null &&
    (url.protocol === 'https:' ||
      (url.protocol === 'http:' && LOOPBACK.has(url.hostname)))
  return safe
    ? undefined
    : `the account key goes only to an https server (or localhost), not ${server}`
}

export {
  type ApiKey,
  type KeyDraft,
  draftKeyFile,
  keyFile,
  keyFileExists,
  keyTransport,
  maskKey,
  readApiKey,
}
