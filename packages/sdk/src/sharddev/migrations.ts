// oxlint-disable-next-line import/no-nodejs-modules -- The stamp lives in the shard repo's package.json.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve the repo's package.json and the installed sdk.
import { resolve } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- A codemod is a module the installed sdk ships; it loads by file URL.
import { pathToFileURL } from 'node:url';
// `.ts`: the bin loads this module straight under Node (status, and the migration gate before dev, build, check and upload).
import { SEMVER, codemodFiles, compareVersions } from './updatePins.ts';

// SDK 0.5.0 plan M1 (ask A7): what a shard repo was last migrated to, and which of the installed sdk's migrations have
// not run on it. A migration is a release codemod, `codemods/<version>.mjs`; from 0.5.0 on it also exports
//   title: string                                   one line: what the release changes in a shard repo
//   pending({ project }): string | undefined         why the repo is still in the old state (undefined: it is not),
//                                                    sync or async
//   guide: string                                    its GUIDE.md anchor (`migrate-0-5-0`)
// beside its default export, the edit itself. The stamp (`package.json` `"wildshard": { "migrated": "<v>" }`) is the sdk
// version the source was last migrated to, not its pin: a repo bumped by hand keeps its old stamp, so the CLI can tell.

/** The package.json field that holds the stamp: `"wildshard": { "migrated": "<version>" }`. */
export const STAMP_FIELD = 'wildshard';
/** The first sdk whose codemods may export `pending`. Older codemods are not loaded to ask (0.4.24's pulls in the
 * TypeScript compiler), so they are pending only inside a stamp's window. */
export const FIRST_STATEFUL = '0.5.0';

/** One migration the installed sdk has that has not run on a repo. `reason` is what its `pending` said, when it fired. */
export interface PendingMigration {
  readonly version: string;
  readonly file: string;
  readonly title?: string;
  /** The GUIDE.md anchor, without `GUIDE.md#`. */
  readonly guide?: string;
  readonly reason?: string;
}

type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const packageFile = (project: string): string => resolve(project, 'package.json');

/** The repo's stamp: the sdk version it was last migrated to, or undefined when it has none (every repo before 0.5.0). */
export function readStamp(project: string): string | undefined {
  const file = packageFile(project);
  if (!existsSync(file)) return undefined;
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
  const field = isRecord(parsed) ? parsed[STAMP_FIELD] : undefined;
  if (field === undefined) return undefined;
  const migrated = isRecord(field) ? field['migrated'] : undefined;
  if (migrated === undefined) return undefined;
  if (typeof migrated !== 'string' || !SEMVER.test(migrated)) throw new Error(`${file}: "${STAMP_FIELD}": { "migrated": ... } must be an sdk version, not ${JSON.stringify(migrated)}`);
  return migrated;
}

/** Stamp the repo as migrated to `version`. Only this field changes: key order and indent stay, and a new field goes last. */
export function writeStamp(project: string, version: string): void {
  if (!SEMVER.test(version)) throw new Error(`writeStamp: ${version} is not a version`);
  const file = packageFile(project), text = readFileSync(file, 'utf8');
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed)) throw new Error(`${file} is not a JSON object`);
  const field = parsed[STAMP_FIELD];
  if (field !== undefined && !isRecord(field)) throw new Error(`${file}: "${STAMP_FIELD}" is not an object`);
  parsed[STAMP_FIELD] = { ...field, migrated: version };
  const indent = /^\{\r?\n([ \t]+)"/u.exec(text)?.[1] ?? 2;
  writeFileSync(file, `${JSON.stringify(parsed, null, indent)}${text.endsWith('\n') ? '\n' : ''}`);
}

/** A codemod's migration exports, as loaded. */
interface Loaded { readonly title?: string; readonly guide?: string; readonly pending?: (input: { readonly project: string }) => unknown }

async function load(file: string): Promise<Loaded> {
  let loaded: unknown;
  try { loaded = await import(pathToFileURL(file).href); }
  catch (error) { throw new Error(`migration ${file} did not load: ${error instanceof Error ? error.message : String(error)}`, { cause: error }); }
  if (!isRecord(loaded)) return {};
  const { title, guide, pending } = loaded;
  return {
    ...(typeof title === 'string' ? { title } : {}),
    ...(typeof guide === 'string' ? { guide: guide.replace(/^(?:GUIDE\.md)?#/u, '') } : {}),
    ...(typeof pending === 'function' ? { pending: input => Reflect.apply(pending, undefined, [input]) as unknown } : {}),
  };
}

/** What a migration's `pending` says about the repo: its reason, or undefined when it has none or says nothing. */
async function askPending(version: string, pending: Loaded['pending'], project: string): Promise<string | undefined> {
  if (pending === undefined) return undefined;
  let said: unknown;
  try { said = await pending({ project }); }
  catch (error) { throw new Error(`migration ${version}'s pending() failed on ${project}: ${error instanceof Error ? error.message : String(error)}`, { cause: error }); }
  return typeof said === 'string' && said !== '' ? said : undefined;
}

/** The installed sdk's migrations that have not run on the repo at `project`, oldest first: each codemod with
 * stamp < v <= installed, plus any codemod <= installed whose `pending` fires. With no stamp, only those whose `pending`
 * fires. A codemod from before FIRST_STATEFUL is never asked. */
export async function pendingMigrations(project: string, sdkRoot: string, installed: string): Promise<PendingMigration[]> {
  const stamp = readStamp(project), found: PendingMigration[] = [];
  for (const { version, file } of codemodFiles(sdkRoot)) {
    if (compareVersions(version, installed) > 0) continue;
    const inWindow = stamp !== undefined && compareVersions(version, stamp) > 0;
    if (!inWindow && compareVersions(version, FIRST_STATEFUL) < 0) continue;
    const { title, guide, pending } = await load(file);
    const reason = await askPending(version, pending, project);
    if (!inWindow && reason === undefined) continue;
    found.push({ version, file, ...(title === undefined ? {} : { title }), ...(guide === undefined ? {} : { guide }), ...(reason === undefined ? {} : { reason }) });
  }
  return found;
}
