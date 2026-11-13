// oxlint-disable-next-line import/no-nodejs-modules -- `update --pins` asks pnpm for a release, installs it and runs its CLI.
import { execFileSync } from 'node:child_process';
// oxlint-disable-next-line import/no-nodejs-modules -- It edits the shard repo's package.json and reads the installed sdk.
import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve files beneath the shard repo and the installed sdk.
import { basename, resolve } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- A codemod is a module the installed sdk ships; it loads by file URL.
import { pathToFileURL } from 'node:url';
// oxlint-disable-next-line import/no-nodejs-modules -- The new sdk's CLI runs under this same Node.
import process from 'node:process';
import { assertShardRepo } from './agentFiles';

// SHARD-AUTHORING SA18 (J314 Q7, Q27; J317 Q16): `wildshard update --pins[=<version>] [dir]`. Move the repo's pins to one
// sdk release (the sdk, and the shard-format, engine and three specs that release pins), install with pnpm, apply the
// release's codemods, rewrite GUIDE.md and the skills with the new sdk's own `update` (SA28), then run its `check`.

/** The pins a shard repo may list; each moves to what the release names. `@wildshard/sdk` moves to the release itself. */
export const PINNED = ['@wildshard/sdk', '@wildshard/engine', '@wildshard/format', 'three'] as const;
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies'] as const;

/** One sdk release, as the registry describes it: its version, the exact specs it pins (dependencies win over peers)
 * and the Node it needs (`engines.node`, which `new` copies into a repo). */
export interface SdkRelease { readonly version: string; readonly pins: Readonly<Record<string, string>>; readonly node?: string }

/** How `update --pins` reaches the world, so a test can stand in for pnpm and the network. */
export interface PinsRunner {
  /** The release `@wildshard/sdk@<spec>` names (`latest`, or a version). */
  readonly view: (spec: string, cwd: string) => SdkRelease;
  /** Run a command in `cwd` with its output shown; throw when it exits non-zero. */
  readonly run: (command: string, args: readonly string[], cwd: string) => void;
  readonly log: (line: string) => void;
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/u;
/** Compare two versions `x.y.z[-pre]`: negative, zero or positive. A prerelease sorts before its release. */
export function compareVersions(a: string, b: string): number {
  const left = SEMVER.exec(a), right = SEMVER.exec(b);
  if (left === null || right === null) throw new Error(`update --pins: ${left === null ? a : b} is not a version`);
  for (let part = 1; part <= 3; part += 1) {
    const difference = Number(left[part]) - Number(right[part]);
    if (difference !== 0) return difference;
  }
  const [preLeft, preRight] = [left[4], right[4]];
  if (preLeft === preRight) return 0;
  if (preLeft === undefined) return 1;
  if (preRight === undefined) return -1;
  // semver: dot-separated identifiers, numbers numerically and below words; fewer identifiers sort first.
  const [partsLeft, partsRight] = [preLeft.split('.'), preRight.split('.')];
  for (let index = 0; index < Math.min(partsLeft.length, partsRight.length); index += 1) {
    const [l, r] = [partsLeft[index] ?? '', partsRight[index] ?? ''];
    if (l === r) continue;
    const [ln, rn] = [/^\d+$/u.test(l), /^\d+$/u.test(r)];
    if (ln && rn) return Number(l) - Number(r);
    if (ln !== rn) return ln ? -1 : 1;
    return l < r ? -1 : 1;
  }
  return partsLeft.length - partsRight.length;
}

type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const readJson = (file: string): Json => {
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!isRecord(parsed)) throw new Error(`update --pins: ${file} is not a JSON object`);
  return parsed;
};
const stringAt = (record: Json, key: string): string | undefined => typeof record[key] === 'string' ? record[key] : undefined;

/** One pin `movePins` changed (or left: the release no longer pins a package the repo lists). */
export interface PinMove { readonly name: string; readonly field: string; readonly from: string; readonly to: string | undefined }

/** The repo's package.json text with every listed pin moved to `release`; each pin keeps its field (a blender repo's
 * sdk stays a dev dependency). `engines.node` moves too, when the repo lists it, since `new` writes it and `.npmrc`
 * makes it strict. Nothing else in the file changes, and its indent is kept. */
export function movePins(text: string, release: SdkRelease): { readonly text: string; readonly moves: readonly PinMove[] } {
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed)) throw new Error('update --pins: package.json is not a JSON object');
  const moves: PinMove[] = [];
  for (const field of DEPENDENCY_FIELDS) {
    const listed = parsed[field];
    if (!isRecord(listed)) continue;
    for (const name of PINNED) {
      const from = stringAt(listed, name);
      if (from === undefined) continue;
      const to = name === '@wildshard/sdk' ? release.version : release.pins[name];
      if (to === from) continue;
      moves.push({ name, field, from, to });
      if (to !== undefined) listed[name] = to;
    }
  }
  const engines = parsed['engines'], node = isRecord(engines) ? stringAt(engines, 'node') : undefined;
  if (isRecord(engines) && node !== undefined && release.node !== undefined && node !== release.node) {
    moves.push({ name: 'engines.node', field: 'engines', from: node, to: release.node });
    engines['node'] = release.node;
  }
  const indent = /^\{\r?\n([ \t]+)"/u.exec(text)?.[1] ?? 2;
  return { text: moves.some(move => move.to !== undefined) ? `${JSON.stringify(parsed, null, indent)}\n` : text, moves };
}

/** Whether package.json lists `three` itself (a `--template sdk` repo does; a blender one does not). */
const listsThree = (listed: Json): boolean => DEPENDENCY_FIELDS.some(field => { const pins = listed[field]; return isRecord(pins) && stringAt(pins, 'three') !== undefined; });

/** The version of the package installed at `<project>/node_modules/<name>`, if any. */
function installedVersion(project: string, name: string): string | undefined {
  const file = resolve(project, 'node_modules', name, 'package.json');
  return existsSync(file) ? stringAt(readJson(file), 'version') : undefined;
}

/** The sdk version the repo is on now: its exact `@wildshard/sdk` pin, which must match what is installed. */
function currentSdk(project: string, listed: Json): string {
  const pin = DEPENDENCY_FIELDS.map(field => listed[field]).map(pins => isRecord(pins) ? stringAt(pins, '@wildshard/sdk') : undefined)
    .find(found => found !== undefined);
  if (pin === undefined || !SEMVER.test(pin)) throw new Error(`update --pins: cannot tell which sdk ${project} is on: pin @wildshard/sdk to a version (not ${pin ?? 'nothing'})`);
  const installed = installedVersion(project, '@wildshard/sdk');
  if (installed !== undefined && installed !== pin) throw new Error(`update --pins: ${project} pins @wildshard/sdk ${pin} but has ${installed} installed: run pnpm install, then wildshard check ., then update --pins again`);
  return pin;
}

/** A release's codemods: `codemods/<version>.mjs` in the installed sdk, each default-exporting
 * `({ project, from, to }) => void | string[] | Promise<…>` that edits the shard repo for that release. */
export const CODEMODS_FOLDER = 'codemods';

/** The codemods for a move `from` → `to`: every `<v>.mjs` with from < v <= to, oldest first. */
export function codemodsBetween(sdkRoot: string, from: string, to: string): string[] {
  const folder = resolve(sdkRoot, CODEMODS_FOLDER);
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .map(file => /^(.+)\.mjs$/u.exec(file)?.[1])
    .filter((version): version is string => version !== undefined && SEMVER.test(version)
      && compareVersions(version, from) > 0 && compareVersions(version, to) <= 0)
    .sort(compareVersions)
    .map(version => resolve(folder, `${version}.mjs`));
}

/** Apply each codemod from `codemodsBetween` to `project`, in order; returns what each says it changed. */
export async function applyCodemods(project: string, sdkRoot: string, from: string, to: string): Promise<string[]> {
  const lines: string[] = [];
  for (const file of codemodsBetween(sdkRoot, from, to)) {
    const name = basename(file);
    let said: unknown;
    try {
      const loaded: unknown = await import(pathToFileURL(file).href);
      const codemod: unknown = isRecord(loaded) ? loaded['default'] : undefined;
      if (typeof codemod !== 'function') throw new Error('it has no default export function');
      said = await Reflect.apply(codemod, undefined, [{ project, from, to }]);
    } catch (error) { throw new Error(`update --pins: codemod ${name} failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error }); }
    lines.push(`  codemod ${name}`);
    if (Array.isArray(said)) for (const line of said) if (typeof line === 'string') lines.push(`    ${line}`);
  }
  return lines;
}

/** pnpm view: the release a spec names, with the specs it pins. */
function pnpmView(spec: string, cwd: string): SdkRelease {
  let out: string;
  try { out = execFileSync('pnpm', ['view', `@wildshard/sdk@${spec}`, 'version', 'dependencies', 'peerDependencies', 'engines', '--json'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (error) { throw new Error(`update --pins: pnpm view @wildshard/sdk@${spec} failed: ${error instanceof Error ? error.message.split('\n')[0] ?? '' : String(error)}`, { cause: error }); }
  if (out.trim() === '') throw new Error(`update --pins: npm has no @wildshard/sdk@${spec}`);
  const parsed: unknown = JSON.parse(out);
  // A range matching several versions lists each; take the newest.
  const found: unknown = Array.isArray(parsed) ? parsed.at(-1) : parsed;
  const record = isRecord(found) ? found : {}, version = stringAt(record, 'version');
  if (version === undefined || !SEMVER.test(version)) throw new Error(`update --pins: npm gave no version for @wildshard/sdk@${spec}`);
  const pins: Record<string, string> = {};
  for (const key of ['peerDependencies', 'dependencies']) {
    const listed = record[key];
    if (isRecord(listed)) for (const [name, value] of Object.entries(listed)) if (typeof value === 'string') pins[name] = value;
  }
  const engines = record['engines'], node = isRecord(engines) ? stringAt(engines, 'node') : undefined;
  return { version, pins, ...(node === undefined ? {} : { node }) };
}

function runInherited(command: string, args: readonly string[], cwd: string): void {
  execFileSync(command, args, { cwd, stdio: 'inherit' });
}

export const PNPM_RUNNER: PinsRunner = { view: pnpmView, run: runInherited, log: line => { console.info(line); } };

/** `wildshard update --pins[=<version>] [dir]`: move the repo at `project` to the sdk release `spec` names. */
export async function updatePins(project: string, spec = 'latest', runner: PinsRunner = PNPM_RUNNER): Promise<void> {
  assertShardRepo(project);
  const packageFile = resolve(project, 'package.json'), listed = readJson(packageFile);
  const manager = stringAt(listed, 'packageManager');
  if (manager !== undefined && !manager.startsWith('pnpm@')) throw new Error(`update --pins: ${project} names ${manager} as its package manager; update --pins installs with pnpm`);
  const from = currentSdk(project, listed);
  const release = runner.view(spec, project);
  if (compareVersions(release.version, from) < 0) throw new Error(`update --pins: ${project} is on @wildshard/sdk ${from}, newer than ${release.version}; update --pins moves forward only`);
  runner.log(`wildshard update --pins: @wildshard/sdk ${from} -> ${release.version}`);

  // 1. Move the pins. Until the codemods are done, a failure puts package.json and the lock file back and installs the
  // old sdk again, so a second run starts from the same sdk and applies every codemod.
  const lockFile = resolve(project, 'pnpm-lock.yaml'), oldText = readFileSync(packageFile, 'utf8');
  const oldLock = existsSync(lockFile) ? readFileSync(lockFile) : undefined;
  const moved = movePins(oldText, release);
  for (const move of moved.moves) runner.log(move.to === undefined
    ? `  left ${move.name} ${move.from}: sdk ${release.version} no longer pins it`
    : `  ${move.name} ${move.from} -> ${move.to}`);
  if (moved.moves.length === 0) runner.log('  pins already match');
  writeFileSync(packageFile, moved.text);
  let sdkRoot: string;
  try {
    // 2. Install, then confirm pnpm installed what the pins say.
    try { runner.run('pnpm', ['install'], project); }
    catch (error) { throw new Error(`update --pins: pnpm install failed on @wildshard/sdk ${release.version}`, { cause: error }); }
    const installed = installedVersion(project, '@wildshard/sdk');
    if (installed !== release.version) throw new Error(`update --pins: pnpm installed @wildshard/sdk ${installed ?? 'nothing'}, not ${release.version}`);
    // A repo that lists three (not a blender one) must get the exact three the release pins.
    const threePin = release.pins['three'], three = installedVersion(project, 'three');
    if (threePin !== undefined && SEMVER.test(threePin) && listsThree(listed) && three !== threePin) throw new Error(`update --pins: sdk ${release.version} pins three ${threePin}, but ${three ?? 'none'} is installed`);
    sdkRoot = realpathSync(resolve(project, 'node_modules/@wildshard/sdk'));
    // 3. The release's codemods, read from the installed sdk.
    const codemods = await applyCodemods(project, sdkRoot, from, release.version);
    runner.log(codemods.length === 0 ? `  no codemods between ${from} and ${release.version}` : codemods.join('\n'));
  } catch (error) {
    writeFileSync(packageFile, oldText);
    if (oldLock !== undefined) writeFileSync(lockFile, oldLock);
    let back = `package.json and pnpm-lock.yaml are back on @wildshard/sdk ${from}`;
    try { runner.run('pnpm', ['install'], project); } catch { back += ', but pnpm install failed: run it again'; }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message}\n  ${back}; a codemod may have edited src/ before it failed: git diff shows it`, { cause: error });
  }

  // 4. GUIDE.md and the skills, by the new sdk's own `update` (SA28); 5. its `check`.
  const cli = resolve(sdkRoot, 'bin/wildshard.mjs');
  try { runner.run(process.execPath, [cli, 'update', project], project); }
  catch (error) { throw new Error(`update --pins: the pins moved to @wildshard/sdk ${release.version}, but its wildshard update failed: run pnpm exec wildshard update`, { cause: error }); }
  try { runner.run(process.execPath, [cli, 'check', '.'], project); }
  catch (error) { throw new Error(`update --pins: the pins moved to @wildshard/sdk ${release.version}, but check failed: fix each refusal above, then run wildshard check .`, { cause: error }); }
  runner.log(`wildshard update --pins: on @wildshard/sdk ${release.version}, check pass`);
}
