// oxlint-disable-next-line import/no-nodejs-modules -- The gate reads the codemods folder, GUIDE.md and git's last release tag.
import { execFileSync } from 'node:child_process';
// oxlint-disable-next-line import/no-nodejs-modules -- Fixture codemod folders in the test's own scratch folder.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve the sdk package, the workspace root and fixtures.
import { join, resolve } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- A codemod is a module; it loads by file URL.
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { publicNames } from '../../../src/scripts/sdk-exports.mjs';

// SDK 0.5.0 plan M6 (ask A7). Jake, 2026-11-24: "0.4.$PATCH is non breaking, and 0.5.0 is for breaking, we bump the
// minor on every break." These gates hold the rule without anyone remembering it:
//   1. a codemod from 0.5.0 on is named for a minor (`x.Y.0.mjs`) and exports `title`, `pending` (a function), `guide`
//      (an anchor GUIDE.md has) and its default function; older codemods (0.2.5 to 0.4.24) are exempt;
//   2. an sdk version `x.Y.0` from 0.5.0 on ships `codemods/<v>.mjs` or `codemods/<v>.none.json` ({ "reason" });
//   3. a public name (export subpath, bin, verb) gone since the last release tag needs the next release to be a minor:
//      the sdk's version is a minor above the tag, or a codemod for that minor is already in the tree.
// The skill `.agents/skills/sdk-breaking-release` is the procedure these gates check.
const SDK = resolve(import.meta.dirname, '..');
const WORKSPACE = resolve(SDK, '../..');
const FIRST_GATED = [0, 5, 0] as const;

type Version = readonly [number, number, number];
const FILE = /^(\d+)\.(\d+)\.(\d+)(.*?)\.(mjs|none\.json)$/u;
const parse = (text: string): Version | undefined => {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/u.exec(text);
  return match === null ? undefined : [Number(match[1]), Number(match[2]), Number(match[3])];
};
const compare = (a: Version, b: Version): number => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
const shown = (version: Version): string => version.join('.');
/** GitHub's anchor for a heading (as guide.test.ts). */
const slug = (heading: string): string => heading.toLowerCase().replaceAll(/[^\w\s-]/gu, '').trim().replaceAll(/\s/gu, '-');
const anchorsOf = (guide: string): Set<string> => new Set([...guide.matchAll(/^#{1,6} (.+)$/gmu)].map(match => slug(match[1] ?? '')));

/** The gated entries of a codemods folder: every `<v>.mjs` and `<v>.none.json` at or above 0.5.0. */
function gatedFiles(folder: string): { readonly file: string; readonly version: Version; readonly suffix: string; readonly kind: 'mjs' | 'none' }[] {
  if (!existsSync(folder)) return [];
  return readdirSync(folder).flatMap(file => {
    const match = FILE.exec(file);
    if (match === null) return [];
    const version: Version = [Number(match[1]), Number(match[2]), Number(match[3])];
    return compare(version, FIRST_GATED) < 0 ? [] : [{ file, version, suffix: match[4] ?? '', kind: match[5] === 'mjs' ? 'mjs' as const : 'none' as const }];
  }).sort((a, b) => compare(a.version, b.version));
}

/** Gate 1: the gated codemods' names and exports. */
async function codemodProblems(folder: string, guide: string): Promise<string[]> {
  const anchors = anchorsOf(guide), problems: string[] = [];
  for (const { file, version, suffix, kind } of gatedFiles(folder)) {
    if (suffix !== '' || version[2] !== 0) { problems.push(`codemods/${file}: a migration from 0.5.0 on is named for a minor, x.Y.0 (a patch never breaks)`); continue; }
    if (kind === 'none') {
      let reason: unknown;
      try { reason = (JSON.parse(readFileSync(join(folder, file), 'utf8')) as { reason?: unknown }).reason; } catch { reason = undefined; }
      if (typeof reason !== 'string' || reason.trim() === '') problems.push(`codemods/${file}: needs { "reason": "<why this minor needs no migration>" }`);
      if (existsSync(join(folder, `${shown(version)}.mjs`))) problems.push(`codemods/${file}: ${shown(version)} has a migration too; keep one`);
      continue;
    }
    const loaded = await import(pathToFileURL(join(folder, file)).href) as Record<string, unknown>;
    if (typeof loaded['title'] !== 'string' || loaded['title'] === '') problems.push(`codemods/${file}: export title, one line on what the release changes in a shard repo`);
    if (typeof loaded['pending'] !== 'function') problems.push(`codemods/${file}: export pending({ project }), the reason a repo is still in the old state (undefined once migrated)`);
    if (typeof loaded['default'] !== 'function') problems.push(`codemods/${file}: its default export is the migration itself`);
    const guideAnchor = typeof loaded['guide'] === 'string' ? loaded['guide'].replace(/^(?:GUIDE\.md)?#/u, '') : undefined;
    if (guideAnchor === undefined) problems.push(`codemods/${file}: export guide, its GUIDE.md anchor (migrate-${shown(version).replaceAll('.', '-')})`);
    else if (!anchors.has(guideAnchor)) problems.push(`codemods/${file}: guide names #${guideAnchor}, which packages/sdk/GUIDE.md has no heading for`);
  }
  return problems;
}

/** Gate 2: a minor the sdk is at ships its migration, or says why it needs none. */
function minorProblems(folder: string, version: string): string[] {
  const parsed = parse(version);
  if (parsed === undefined || parsed[2] !== 0 || compare(parsed, FIRST_GATED) < 0) return [];
  const has = ['mjs', 'none.json'].some(kind => existsSync(join(folder, `${version}.${kind}`)));
  return has ? [] : [`@wildshard/sdk ${version} is a minor, a breaking release: add codemods/${version}.mjs (its migration), or codemods/${version}.none.json with { "reason" } if no shard repo needs one`];
}

/** Gate 3: names gone since the tag need the next release to be a minor. */
function exportProblems(tagged: readonly string[], current: readonly string[], tag: string, version: string, folder: string): string[] {
  const have = new Set(current), gone = tagged.filter(name => !have.has(name));
  const base = parse(tag), now = parse(version);
  if (gone.length === 0 || base === undefined || now === undefined) return [];
  const minor = (v: Version): boolean => v[0] > base[0] || (v[0] === base[0] && v[1] > base[1]);
  if (minor(now) || gatedFiles(folder).some(entry => entry.suffix === '' && entry.version[2] === 0 && minor(entry.version))) return [];
  const next: Version = base[0] === 0 ? [0, base[1] + 1, 0] : [base[0], base[1] + 1, 0];
  return [`${gone.join(', ')} left the sdk since ${tag}: a removed or renamed export breaks shard repos, so the next release is ${shown(next)}, not a patch. Add codemods/${shown(next)}.mjs (or a deprecation alias, node src/scripts/sdk-exports.mjs alias) and release it as ${shown(next)}`];
}

/** The last release tag reachable from HEAD and its exports lock, or why there is none (a shallow clone has no tags). */
function lastRelease(): { readonly tag: string; readonly names: readonly string[] } | string {
  let tag: string;
  try { tag = execFileSync('git', ['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*.[0-9]*.[0-9]*'], { cwd: WORKSPACE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return 'no release tag is reachable from HEAD (a shallow clone, or tags not fetched)'; }
  let text: string;
  try { text = execFileSync('git', ['show', `${tag}:packages/sdk/exports.lock.json`], { cwd: WORKSPACE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch { return `${tag} has no packages/sdk/exports.lock.json`; }
  return { tag, names: (JSON.parse(text) as { names: string[] }).names };
}

const scratchRoot = resolve(SDK, 'tmp');
mkdirSync(scratchRoot, { recursive: true });
const scratch = mkdtempSync(join(scratchRoot, 'codemod-gate-'));
afterAll(() => { rmSync(scratch, { recursive: true, force: true }); });
let fixtures = 0;
/** A codemods folder holding `files` (name to text). */
function folderOf(files: Readonly<Record<string, string>>): string {
  fixtures += 1;
  const folder = join(scratch, `codemods-${String(fixtures)}`);
  mkdirSync(folder);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(folder, name), text);
  return folder;
}
const GUIDE = '# Guide\n\n## 7. Upgrading and migrations\n\n#### migrate-0-6-0\n\nWhat moved.\n';
const MIGRATION = "export const title = 'x moves to y';\nexport const guide = 'migrate-0-6-0';\nexport const pending = () => undefined;\nexport default () => [];\n";

describe('the breaking-release gates (M6)', () => {
  it('a codemod for a patch fails; one for a minor with every export passes', async () => {
    expect(await codemodProblems(folderOf({ '0.6.0.mjs': MIGRATION }), GUIDE)).toEqual([]);
    expect(await codemodProblems(folderOf({ '0.6.1.mjs': MIGRATION }), GUIDE)).toEqual(['codemods/0.6.1.mjs: a migration from 0.5.0 on is named for a minor, x.Y.0 (a patch never breaks)']);
    expect(await codemodProblems(folderOf({ '0.6.0-folder.mjs': MIGRATION }), GUIDE)).toHaveLength(1);
  });

  it('a minor\'s codemod without pending, title or a guide heading fails', async () => {
    const noPending = MIGRATION.replace('export const pending = () => undefined;\n', '');
    expect(await codemodProblems(folderOf({ '0.6.0.mjs': noPending }), GUIDE)).toEqual(['codemods/0.6.0.mjs: export pending({ project }), the reason a repo is still in the old state (undefined once migrated)']);
    expect((await codemodProblems(folderOf({ '0.6.0.mjs': MIGRATION.replace("export const title = 'x moves to y';\n", '') }), GUIDE)).join()).toMatch(/export title/u);
    expect(await codemodProblems(folderOf({ '0.6.0.mjs': MIGRATION }), '# Guide\n')).toEqual(['codemods/0.6.0.mjs: guide names #migrate-0-6-0, which packages/sdk/GUIDE.md has no heading for']);
  });

  it('codemods before 0.5.0 are exempt, a .none.json needs its reason', async () => {
    const legacy = folderOf({ '0.4.24.mjs': 'export default () => [];\n', '0.4.0-folder.mjs': 'export default () => [];\n', '0.4.0.d.mts': '', '0.2.5.mjs': 'throw new Error("never loaded");\n' });
    expect(await codemodProblems(legacy, GUIDE)).toEqual([]);
    expect(await codemodProblems(folderOf({ '0.7.0.none.json': '{ "reason": "only a new optional export" }' }), GUIDE)).toEqual([]);
    expect(await codemodProblems(folderOf({ '0.7.0.none.json': '{}' }), GUIDE)).toEqual(['codemods/0.7.0.none.json: needs { "reason": "<why this minor needs no migration>" }']);
  });

  it('an sdk at a minor ships its migration or says why it needs none', () => {
    const empty = folderOf({});
    expect(minorProblems(empty, '0.4.34')).toEqual([]);
    expect(minorProblems(empty, '0.6.0')).toHaveLength(1);
    expect(minorProblems(folderOf({ '0.6.0.mjs': MIGRATION }), '0.6.0')).toEqual([]);
    expect(minorProblems(folderOf({ '0.6.0.none.json': '{ "reason": "r" }' }), '0.6.0')).toEqual([]);
  });

  it('an export removed at a patch fails; at a minor, or with that minor\'s migration in the tree, it passes', () => {
    const tagged = ['@wildshard/sdk/random', '@wildshard/sdk/rows'], current = ['@wildshard/sdk/rows'];
    expect(exportProblems(tagged, current, 'v0.6.3', '0.6.3', folderOf({}))).toEqual([expect.stringMatching(/^@wildshard\/sdk\/random left the sdk since v0\.6\.3: .* the next release is 0\.7\.0, not a patch/u)]);
    expect(exportProblems(tagged, current, 'v0.6.3', '0.7.0', folderOf({}))).toEqual([]);
    expect(exportProblems(tagged, current, 'v0.6.3', '0.6.3', folderOf({ '0.7.0.mjs': MIGRATION }))).toEqual([]);
    // A migration for a minor already released does not cover a new removal.
    expect(exportProblems(tagged, current, 'v0.6.3', '0.6.3', folderOf({ '0.6.0.mjs': MIGRATION }))).toHaveLength(1);
    expect(exportProblems(tagged, [...tagged, '@wildshard/sdk/new'], 'v0.6.3', '0.6.3', folderOf({}))).toEqual([]);
  });

  describe('the real tree', () => {
    const folder = join(SDK, 'codemods'), guide = readFileSync(join(SDK, 'GUIDE.md'), 'utf8');
    const { version } = JSON.parse(readFileSync(join(SDK, 'package.json'), 'utf8')) as { version: string };

    it('passes gates 1 and 2', async () => {
      expect(await codemodProblems(folder, guide)).toEqual([]);
      expect(minorProblems(folder, version)).toEqual([]);
    });

    const release = lastRelease();
    it.skipIf(typeof release === 'string')(`passes gate 3 against the last release tag${typeof release === 'string' ? ` (skipped: ${release})` : ` (${release.tag})`}`, () => {
      if (typeof release === 'string') return;
      expect(exportProblems(release.names, publicNames(WORKSPACE), release.tag, version, folder)).toEqual([]);
    });
  });
});
