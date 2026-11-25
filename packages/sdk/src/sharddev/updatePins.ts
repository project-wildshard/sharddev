// oxlint-disable-next-line import/no-nodejs-modules -- `upgrade` asks pnpm for a release, installs it and runs its CLI.
import { execFileSync } from 'node:child_process';
// oxlint-disable-next-line import/no-nodejs-modules -- It edits the shard repo's package.json and reads the installed sdk.
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve files beneath the shard repo and the installed sdk.
import { resolve } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- The new sdk's CLI runs under this same Node.
import process from 'node:process';
// `.ts`: migrations.ts loads these modules straight under Node (the bin's status, migrate and migration gate), unbundled.
import { assertShardRepo, updateShardRepo } from './agentFiles.ts';
import { assertCommitted, codemodsBetween, compareVersions, isVersion, migrationsForMove, readStamp, runLines, runMigrations, writeStamp, type PendingMigration } from './migrations.ts';

// SHARD-AUTHORING SA18 (J314 Q7, Q27; J317 Q16): `wildshard upgrade [version] [dir]`, and its alias
// `update --pins[=<version>] [dir]` (SDK 0.5.0 plan M4). Move the repo's pins to one sdk release (the sdk, and the
// shard-format, engine and three specs that release pins), install with pnpm, run the release's migrations (the
// engine `migrate` runs, migrations.ts), rewrite GUIDE.md and the skills with the new sdk's own `update` (SA28), stamp
// the repo, then run its `check`. It starts only from a committed git tree (assertCommitted), so the author can tell
// its edits from their own.
// The version and codemod helpers (isVersion, compareVersions, codemodFiles, codemodsBetween, assertCommitted) are
// migrations.ts's, the base `migrate` shares.

/** The names a shard repo lists the sdk under. `new` writes `@wildshard/sdk`; the org's shard repos list it as
 * `@wildshard/sharddev`, which their source imports, as a GitHub pin or NPM-PUBLISH NP8's `npm:@wildshard/sdk@<v>`
 * alias. The move keeps the name the repo has. */
export const SDK_NAMES = ['@wildshard/sdk', '@wildshard/sharddev'] as const;
/** The pins a shard repo may list; each moves to what the release names. The sdk moves to the release itself. */
export const PINNED = ['@wildshard/sdk', '@wildshard/sharddev', '@wildshard/cli', '@wildshard/build', '@wildshard/dev', '@wildshard/upload', '@wildshard/engine', '@wildshard/format', '@wildshard/kit', 'three', '@types/three'] as const;
/** SDK-SPLIT SP10, SP13: the cli, build, dev and upload release with the sdk at one version (D5), so each moves to the
 * release's own version. */
const LOCKSTEP: ReadonlySet<string> = new Set(['@wildshard/cli', '@wildshard/build', '@wildshard/dev', '@wildshard/upload']);
const isSdkName = (name: string): boolean => (SDK_NAMES as readonly string[]).includes(name);
const isPinned = (name: string): boolean => (PINNED as readonly string[]).includes(name);
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies'] as const;

/** One sdk release, as the registry describes it: its version, the exact specs it pins (dependencies win over peers)
 * and the Node it needs (`engines.node`, which `new` copies into a repo). */
export interface SdkRelease { readonly version: string; readonly pins: Readonly<Record<string, string>>; readonly node?: string }

/** How `upgrade` reaches the world, so a test can stand in for pnpm and the network. */
export interface PinsRunner {
  /** The release `@wildshard/sdk@<spec>` names (`latest`, or a version). */
  readonly view: (spec: string, cwd: string) => SdkRelease;
  /** The tags of the GitHub repo `owner/name`, each to the commit it names (`git ls-remote --tags`). */
  readonly tags: (repo: string, cwd: string) => ReadonlyMap<string, string>;
  /** Run a command in `cwd` with its output shown; throw when it exits non-zero. */
  readonly run: (command: string, args: readonly string[], cwd: string) => void;
  readonly log: (line: string) => void;
}

type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const readJson = (file: string): Json => {
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!isRecord(parsed)) throw new Error(`upgrade: ${file} is not a JSON object`);
  return parsed;
};
const stringAt = (record: Json, key: string): string | undefined => typeof record[key] === 'string' ? record[key] : undefined;

/** One pin `movePins` changed (or left: the release no longer pins a package the repo lists). An override's name is
 * its key in `pnpm.overrides`. */
export interface PinMove { readonly name: string; readonly field: string; readonly from: string; readonly to: string | undefined }

const SDK_ALIAS = /^npm:@wildshard\/sdk@(.+)$/u;
/** The format package's own name, and the `npm:` alias a repo pins it under as `@wildshard/format`. */
const FORMAT_REAL_NAME = '@wildshard/shard-format';
const FORMAT_ALIAS = /^npm:@wildshard\/shard-format@(.+)$/u;
const GITHUB_PIN = /^github:([\w.-]+\/[\w.-]+)#(.+)$/u;
/** The package a `pnpm.overrides` key overrides: the last `parent>` step, without its `@<range>` selector (which may
 * hold a `>` of its own, as in `three@>=0.180`). */
const overriddenPackage = (key: string): string => (key.split(/>(?=[@A-Za-z])/u).at(-1) ?? key).replace(/(?<=.)@[^@/]*$/u, '');

// SHARD-COMPAT CP18 (replaces SDK-SPLIT SP13's never-back rule): the format pin is the SDK's, either way; check
// refuses any other, so a repo ahead of its SDK moves the SDK up instead.
/** The repo's package.json text with every listed pin moved to `release`; each pin keeps its field (a blender repo's
 * sdk stays a dev dependency) and the sdk keeps its name and form: an exact version moves to the release, an
 * `npm:@wildshard/sdk@<v>` alias to the release's alias, and a GitHub pin to `sdkSpec`, which `updatePins` resolves
 * (the release tag's commit); any other form (`link:`, a `$` reference, a GitHub pin with no `sdkSpec`) is left, and
 * reported as a move to nothing. `pnpm.overrides` of a moved package move with it, whatever their key's form, since an
 * override wins over the pin. `engines.node` moves too, when the repo lists it, since `new` writes it and `.npmrc` makes
 * it strict. Nothing else in the file changes, and its indent is kept. */
export function movePins(text: string, release: SdkRelease, sdkSpec?: string): { readonly text: string; readonly moves: readonly PinMove[] } {
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed)) throw new Error('upgrade: package.json is not a JSON object');
  const moves: PinMove[] = [];
  const target = (name: string, from: string): string | undefined => {
    if (LOCKSTEP.has(name)) return isVersion(from) ? release.version : undefined;
    if (!isSdkName(name)) return release.pins[name];
    if (SDK_ALIAS.test(from)) return `npm:@wildshard/sdk@${release.version}`;
    if (GITHUB_PIN.test(from)) return sdkSpec;
    return isVersion(from) ? release.version : undefined;
  };
  const move = (record: Json, key: string, name: string, field: string): void => {
    const from = stringAt(record, key);
    if (from === undefined) return;
    const to = target(name, from);
    if (to === from) return;
    moves.push({ name: key, field, from, to });
    if (to !== undefined) record[key] = to;
  };
  const moveFormatOverride = (record: Json, key: string): void => {
    const from = stringAt(record, key), pin = release.pins['@wildshard/format'];
    if (from === undefined || pin === undefined) return;
    const to = FORMAT_ALIAS.exec(pin)?.[1] ?? pin;
    if (to === from) return;
    moves.push({ name: key, field: 'pnpm.overrides', from, to });
    record[key] = to;
  };
  for (const field of DEPENDENCY_FIELDS) {
    const listed = parsed[field];
    if (isRecord(listed)) for (const name of PINNED) move(listed, name, name, field);
  }
  const pnpm = parsed['pnpm'], overrides = isRecord(pnpm) ? pnpm['overrides'] : undefined;
  if (isRecord(overrides)) for (const key of Object.keys(overrides)) {
    const name = overriddenPackage(key);
    if (isPinned(name)) move(overrides, key, name, 'pnpm.overrides');
    // The format under its real name, as kit depends on it (`@wildshard/kit>@wildshard/shard-format`), is the format
    // pin too: left behind, kit linked an older format beside the sdk's and named-JSON provenance refused the build
    // (shard-nalati on 0.4.33). It takes the format pin's version, without the `npm:` alias.
    else if (name === FORMAT_REAL_NAME) moveFormatOverride(overrides, key);
  }
  const engines = parsed['engines'], node = isRecord(engines) ? stringAt(engines, 'node') : undefined;
  if (isRecord(engines) && node !== undefined && release.node !== undefined && node !== release.node) {
    moves.push({ name: 'engines.node', field: 'engines', from: node, to: release.node });
    engines['node'] = release.node;
  }
  const indent = /^\{\r?\n([ \t]+)"/u.exec(text)?.[1] ?? 2;
  return { text: moves.some(moved => moved.to !== undefined) ? `${JSON.stringify(parsed, null, indent)}\n` : text, moves };
}

/** Whether package.json lists `three` itself (a `--template sdk` repo does; a blender one does not). */
const listsThree = (listed: Json): boolean => DEPENDENCY_FIELDS.some(field => { const pins = listed[field]; return isRecord(pins) && stringAt(pins, 'three') !== undefined; });

/** The version of the package installed at `<project>/node_modules/<name>`, if any. */
function installedVersion(project: string, name: string): string | undefined {
  const file = resolve(project, 'node_modules', name, 'package.json');
  return existsSync(file) ? stringAt(readJson(file), 'version') : undefined;
}

/** The sdk dependency a repo lists: its name, its spec, and the GitHub repo and ref when it is a GitHub pin. */
interface SdkPin { readonly name: string; readonly spec: string; readonly github?: { readonly repo: string; readonly ref: string } }

/** The repo's sdk pin: an exact version, an `npm:@wildshard/sdk@<version>` alias, or a GitHub pin (`github:<owner>/<repo>#<ref>`,
 * at a commit or a tag), under either name. Anything else (`link:`, a range) names no one release. */
function sdkPin(project: string, listed: Json): SdkPin {
  for (const field of DEPENDENCY_FIELDS) for (const name of SDK_NAMES) {
    const pins = listed[field], spec = isRecord(pins) ? stringAt(pins, name) : undefined;
    if (spec === undefined) continue;
    const alias = SDK_ALIAS.exec(spec)?.[1], github = GITHUB_PIN.exec(spec);
    if (isVersion(spec) || (alias !== undefined && isVersion(alias))) return { name, spec };
    if (github !== null) return { name, spec, github: { repo: github[1] ?? '', ref: github[2] ?? '' } };
    throw new Error(`upgrade: cannot tell which sdk ${project} is on: pin ${name} to a version, an npm:@wildshard/sdk@<version> alias or a github: commit (not ${spec})`);
  }
  throw new Error(`upgrade: cannot tell which sdk ${project} is on: its package.json lists no ${SDK_NAMES.join(' or ')}`);
}

/** The release a `v<version>` tag names, newest first when one commit has several. */
function taggedVersion(tags: ReadonlyMap<string, string>, ref: string): string | undefined {
  if (/^v\d/u.test(ref)) return isVersion(ref.slice(1)) ? ref.slice(1) : undefined;
  if (!/^[0-9a-f]{7,40}$/u.test(ref)) return undefined;
  return [...tags].filter(([tag, commit]) => commit.startsWith(ref) && /^v\d/u.test(tag) && isVersion(tag.slice(1)))
    .map(([tag]) => tag.slice(1)).sort(compareVersions).at(-1);
}

/** The sdk version the repo is on now. A version or alias pin says it, and must match what is installed; a GitHub pin
 * says it by its tag, or by the release tag at its commit; a commit no release tag names is whatever is installed. */
function currentSdk(project: string, pin: SdkPin, tags: () => ReadonlyMap<string, string>): string {
  const pinned = pin.github === undefined ? SDK_ALIAS.exec(pin.spec)?.[1] ?? pin.spec : taggedVersion(tags(), pin.github.ref);
  const installed = installedVersion(project, pin.name);
  if (pinned !== undefined && installed !== undefined && installed !== pinned) throw new Error(`upgrade: ${project} pins ${pin.name} ${pinned} but has ${installed} installed: run pnpm install, then wildshard check ., then upgrade again`);
  const from = pinned ?? installed;
  if (from === undefined) throw new Error(`upgrade: cannot tell which sdk ${project} is on: ${pin.name} ${pin.spec} is no release tag's commit and no sdk is installed: run pnpm install, then upgrade again`);
  return from;
}

/** Where a GitHub sdk pin moves for `version`: a tag pin to that release's tag, a commit pin to the commit the release's
 * `v<version>` tag names, so the repo's pin style stays as it was. */
function githubTarget(pin: SdkPin & { readonly github: NonNullable<SdkPin['github']> }, version: string, tags: ReadonlyMap<string, string>): { readonly spec: string; readonly why: string } {
  const tag = `v${version}`, commit = tags.get(tag);
  if (commit === undefined) throw new Error(`upgrade: ${pin.github.repo} has no tag ${tag}, so ${pin.name} ${pin.spec} has no release commit to move to; pin ${pin.name} to npm:@wildshard/sdk@${version} instead`);
  if (/^v\d/u.test(pin.github.ref)) return { spec: `github:${pin.github.repo}#${tag}`, why: `kept as a GitHub tag pin: ${tag}` };
  return { spec: `github:${pin.github.repo}#${commit}`, why: `kept as a GitHub commit pin: the ${tag} tag's commit` };
}

/** git ls-remote: a GitHub repo's tags, each to its commit (an annotated tag's peeled `^{}` line wins). */
function gitTags(repo: string, cwd: string): ReadonlyMap<string, string> {
  let out: string;
  // GIT_TERMINAL_PROMPT=0: a private or misspelt repo fails instead of asking for a username on the terminal.
  try { out = execFileSync('git', ['ls-remote', '--tags', `https://github.com/${repo}.git`], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }); }
  catch (error) { throw new Error(`upgrade: git ls-remote --tags on github.com/${repo} failed: ${error instanceof Error ? error.message.split('\n')[0] ?? '' : String(error)}`, { cause: error }); }
  const tags = new Map<string, string>();
  for (const [commit, ref] of out.split('\n').map(line => line.split('\t'))) {
    const tag = ref?.replace(/^refs\/tags\//u, '');
    if (commit === undefined || tag === undefined || tag === ref) continue;
    if (tag.endsWith('^{}')) tags.set(tag.slice(0, -3), commit);
    else if (!tags.has(tag)) tags.set(tag, commit);
  }
  return tags;
}

/** The newest sdk whose `wildshard update` refuses a repo that lists it as `@wildshard/sharddev`. */
const LAST_UPDATE_WITHOUT_SHARDDEV = '0.2.5';

/** pnpm view: the release a spec names, with the specs it pins. */
function pnpmView(spec: string, cwd: string): SdkRelease {
  let out: string;
  try { out = execFileSync('pnpm', ['view', `@wildshard/sdk@${spec}`, 'version', 'dependencies', 'peerDependencies', 'devDependencies', 'engines', '--json'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (error) { throw new Error(`upgrade: pnpm view @wildshard/sdk@${spec} failed: ${error instanceof Error ? error.message.split('\n')[0] ?? '' : String(error)}`, { cause: error }); }
  if (out.trim() === '') throw new Error(`upgrade: npm has no @wildshard/sdk@${spec}`);
  const parsed: unknown = JSON.parse(out);
  // A range matching several versions lists each; take the newest.
  const release = sdkReleaseOf(Array.isArray(parsed) ? parsed.at(-1) : parsed);
  if (release === undefined) throw new Error(`upgrade: npm gave no version for @wildshard/sdk@${spec}`);
  return release;
}

/** One `pnpm view @wildshard/sdk` record as the release it names, with the specs it pins. */
export function sdkReleaseOf(found: unknown): SdkRelease | undefined {
  const record = isRecord(found) ? found : {}, version = stringAt(record, 'version');
  if (version === undefined || !isVersion(version)) return undefined;
  const pins: Record<string, string> = {};
  for (const key of ['peerDependencies', 'dependencies']) {
    const listed = record[key];
    if (isRecord(listed)) for (const [name, value] of Object.entries(listed)) if (typeof value === 'string') pins[name] = value;
  }
  // SDK-SPLIT SP13: the split sdk keeps the engine only as a dev dependency, at dev's exact pin (test/dev-engine-pin), so
  // a repo's engine pin (sim tests) and its override still move with each release. SHARD-COMPAT: the engine's peer range
  // (`*`, so the shard's own engine resolves) is not a pin; 0.4.26 wrote it into shard repos and the lock took npm latest.
  const dev = record['devDependencies'], engine = isRecord(dev) ? stringAt(dev, '@wildshard/engine') : undefined, peer = pins['@wildshard/engine'];
  if (engine !== undefined && isVersion(engine) && (peer === undefined || !isVersion(peer))) pins['@wildshard/engine'] = engine;
  const engines = record['engines'], node = isRecord(engines) ? stringAt(engines, 'node') : undefined;
  return { version, pins, ...(node === undefined ? {} : { node }) };
}

function runInherited(command: string, args: readonly string[], cwd: string): void {
  execFileSync(command, args, { cwd, stdio: 'inherit' });
}

export const PNPM_RUNNER: PinsRunner = { view: pnpmView, tags: gitTags, run: runInherited, log: line => { console.info(line); } };

/** Run `migrations` on `project` as the move `from` → `to`, and say what each changed, `upgrade`'s way: a
 * `  codemod <file>` line each, its lines beneath, then the manual steps. A failure is `upgrade: codemod <file> failed`. */
async function applyListed(project: string, migrations: readonly PendingMigration[], from: string, to: string): Promise<string[]> {
  try { return runLines(await runMigrations(project, migrations, { from, to }), 'codemod'); }
  catch (error) { throw new Error(`upgrade: ${(error instanceof Error ? error.message : String(error)).replace(/^migration /u, 'codemod ')}`, { cause: error }); }
}

/** Apply each codemod from `codemodsBetween` to `project`, in order (the pin window alone, as before M4); returns what
 * each says it changed. */
export function applyCodemods(project: string, sdkRoot: string, from: string, to: string): Promise<string[]> {
  return applyListed(project, codemodsBetween(sdkRoot, from, to).map(file => ({ version: file.replaceAll(/^.*\/|\.mjs$/gu, ''), file })), from, to);
}

/** M4: apply the migrations a pin move `from` → `to` runs (migrationsForMove), oldest first. */
export async function applyMigrationsForMove(project: string, sdkRoot: string, from: string, to: string): Promise<string[]> {
  // A codemod's `from` is where the source comes from: the older of the stamp and the old pin.
  const stamp = readStamp(project), since = stamp !== undefined && compareVersions(stamp, from) < 0 ? stamp : from;
  return applyListed(project, await migrationsForMove(project, sdkRoot, from, to), since, to);
}

/** `wildshard upgrade [version] [dir]` and its alias `update --pins[=<version>] [dir]`: move the repo at `project` to the
 * sdk release `spec` names. */
export async function updatePins(project: string, spec = 'latest', runner: PinsRunner = PNPM_RUNNER): Promise<void> {
  assertShardRepo(project);
  const packageFile = resolve(project, 'package.json'), listed = readJson(packageFile);
  const manager = stringAt(listed, 'packageManager');
  if (manager !== undefined && !manager.startsWith('pnpm@')) throw new Error(`upgrade: ${project} names ${manager} as its package manager; upgrade installs with pnpm`);
  const pin = sdkPin(project, listed);
  assertCommitted(project);
  let tagsRead: ReadonlyMap<string, string> | undefined;
  const tags = (): ReadonlyMap<string, string> => {
    tagsRead ??= runner.tags(pin.github?.repo ?? '', project);
    return tagsRead;
  };
  const from = currentSdk(project, pin, tags);
  const release = runner.view(spec, project);
  if (compareVersions(release.version, from) < 0) throw new Error(`upgrade: ${project} is on ${pin.name} ${from}, newer than ${release.version}; upgrade moves forward only`);
  const github = pin.github === undefined || release.version === from ? undefined : githubTarget({ ...pin, github: pin.github }, release.version, tags());
  // A GitHub pin that is not moving stays as it is, and so does an sdk-named GitHub override.
  const sdkSpec = github?.spec ?? (pin.github === undefined ? undefined : pin.spec);
  runner.log(`wildshard upgrade: ${pin.name} ${from} -> ${release.version}`);

  // 1. Move the pins. Until the codemods are done, a failure puts package.json and the lock file back and installs the
  // old sdk again, so a second run starts from the same sdk and applies every codemod.
  const lockFile = resolve(project, 'pnpm-lock.yaml'), oldText = readFileSync(packageFile, 'utf8');
  const oldLock = existsSync(lockFile) ? readFileSync(lockFile) : undefined;
  const moved = movePins(oldText, release, sdkSpec);
  for (const move of moved.moves) {
    const what = move.field === 'pnpm.overrides' ? `pnpm.overrides ${move.name}` : move.name;
    const left = isSdkName(move.field === 'pnpm.overrides' ? overriddenPackage(move.name) : move.name)
      ? 'upgrade cannot move this form of the sdk pin; move it by hand' : `sdk ${release.version} no longer pins it`;
    runner.log(move.to === undefined ? `  left ${what} ${move.from}: ${left}` : `  ${what} ${move.from} -> ${move.to}`);
    if (move.name === pin.name && move.field !== 'pnpm.overrides' && github !== undefined) runner.log(`    ${github.why}`);
  }
  if (moved.moves.length === 0) runner.log('  pins already match');
  writeFileSync(packageFile, moved.text);
  let sdkRoot: string;
  try {
    // 2. Install, then confirm pnpm installed what the pins say.
    try { runner.run('pnpm', ['install'], project); }
    catch (error) { throw new Error(`upgrade: pnpm install failed on @wildshard/sdk ${release.version}`, { cause: error }); }
    const installed = installedVersion(project, pin.name);
    if (installed !== release.version) throw new Error(`upgrade: pnpm installed ${pin.name} ${installed ?? 'nothing'}, not ${release.version}`);
    // A repo that lists three (not a blender one) must get the exact three the release pins.
    const threePin = release.pins['three'], three = installedVersion(project, 'three');
    if (threePin !== undefined && isVersion(threePin) && listsThree(listed) && three !== threePin) throw new Error(`upgrade: sdk ${release.version} pins three ${threePin}, but ${three ?? 'none'} is installed`);
    sdkRoot = realpathSync(resolve(project, 'node_modules', pin.name));
    // 3. The release's migrations, read from the installed sdk (M4): the pin window's codemods from before 0.5.0, and
    // every migration pending by the stamp (else the old pin) or by its own `pending`, so a pin already at the release
    // still runs a migration that has not run.
    const pinned = readFileSync(packageFile, 'utf8');
    const codemods = await applyMigrationsForMove(project, sdkRoot, from, release.version);
    runner.log(codemods.length === 0 ? `  no codemods between ${from} and ${release.version}` : codemods.join('\n'));
    // SDK-SPLIT SP13: a codemod that pins a package (the cli, dev, build) installs it before update and check run.
    if (readFileSync(packageFile, 'utf8') !== pinned) {
      try { runner.run('pnpm', ['install'], project); }
      catch (error) { throw new Error(`upgrade: pnpm install after the codemods failed on @wildshard/sdk ${release.version}`, { cause: error }); }
    }
    // M3's stamp: the source is migrated to the release. A failure above puts package.json back, stamp and all.
    const stamp = readStamp(project);
    if (stamp === undefined || compareVersions(stamp, release.version) < 0) writeStamp(project, release.version);
  } catch (error) {
    writeFileSync(packageFile, oldText);
    if (oldLock !== undefined) writeFileSync(lockFile, oldLock);
    let back = `package.json and pnpm-lock.yaml are back on ${pin.name} ${from}`;
    try { runner.run('pnpm', ['install'], project); } catch { back += ', but pnpm install failed: run it again'; }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message}\n  ${back}; a codemod may have edited src/ before it failed: git diff shows it`, { cause: error });
  }

  // 4. GUIDE.md and the skills, by the new sdk's own `update` (SA28); 5. its `check`. An sdk up to 0.2.5 has an `update`
  // that refuses a repo listing it as @wildshard/sharddev, so for those this CLI syncs that sdk's guide and skills itself.
  // SDK-SPLIT SP8c: an sdk from the split on ships no bin; the repo's @wildshard/dev runs `update` and `check` (SP10: cli).
  const cli = [resolve(project, 'node_modules/@wildshard/cli/bin/wildshard.mjs'), resolve(sdkRoot, 'bin/wildshard.mjs'), resolve(project, 'node_modules/@wildshard/dev/bin/wildshard.mjs')].find(path => existsSync(path)) ?? resolve(sdkRoot, 'bin/wildshard.mjs');
  if (pin.name === '@wildshard/sdk' || compareVersions(release.version, LAST_UPDATE_WITHOUT_SHARDDEV) > 0) {
    try { runner.run(process.execPath, [cli, 'update', project], project); }
    catch (error) { throw new Error(`upgrade: the pins moved to @wildshard/sdk ${release.version}, but its wildshard update failed: run pnpm exec wildshard update`, { cause: error }); }
  } else {
    runner.log(`  sdk ${release.version}'s own update does not know ${pin.name}, so this CLI writes its GUIDE.md and skills`);
    try { for (const line of updateShardRepo(project, sdkRoot)) runner.log(line); }
    catch (error) { throw new Error(`upgrade: the pins moved to @wildshard/sdk ${release.version}, but writing its GUIDE.md and skills failed (${error instanceof Error ? error.message : String(error)}): run pnpm --package=@wildshard/sdk@latest dlx wildshard update`, { cause: error }); }
  }
  try { runner.run(process.execPath, [cli, 'check', '.'], project); }
  catch (error) { throw new Error(`upgrade: the pins moved to @wildshard/sdk ${release.version}, but check failed: fix each refusal above, then run wildshard check .`, { cause: error }); }
  runner.log(`wildshard upgrade: on @wildshard/sdk ${release.version}, check pass`);
}
