// oxlint-disable-next-line import/no-nodejs-modules -- Scaffold new repos into a scratch folder.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Scaffold new repos into a scratch folder.
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { runCli } from './cli';
import { newProject } from './project';
import { findShardSource, shardFolderName, shardOutputRoot } from './shardSource';
import { checkProject } from './checkProject';
import { validateOutputProduct } from './outputProduct';

// SA16 (J314, J317): `wildshard new <dir> [--template sdk|blender]` writes a whole single-shard repo, its shard source at
// `src/`. A flag only, never a prompt; no flag is `sdk`; an unknown template refuses before anything is written.
describe('wildshard new writes a shard repo (SA16)', () => {
  let scratch = '';
  const sdk = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../package.json'), 'utf8')) as { version: string; dependencies: Record<string, string>; peerDependencies: Record<string, string> };
  beforeAll(() => { mkdirSync('tmp', { recursive: true }); scratch = mkdtempSync(resolve('tmp', 'new-repo-')); });
  afterAll(() => { rmSync(scratch, { recursive: true, force: true }); });

  it.each([['no flag', 'none', []], ['--template sdk', 'spaced', ['--template', 'sdk']], ['--template=sdk', 'equals', ['--template=sdk']], ['--empty', 'empty', ['--empty']]] as const)('%s: src/shard.config.ts, no src/shards/, the repo files and exact pins', async (_, folder, flags) => {
    const repo = resolve(scratch, folder);
    await runCli(['new', repo, 'my-shard', ...flags]);
    expect(existsSync(resolve(repo, 'src/shard.config.ts'))).toBe(true);
    expect(existsSync(resolve(repo, 'src/shards'))).toBe(false);
    expect(existsSync(resolve(repo, 'shard.config.ts'))).toBe(false);
    for (const file of ['package.json', 'tsconfig.json', '.gitignore', '.npmrc', 'README.md', 'pnpm-workspace.yaml', 'GUIDE.md', '.claude/skills/wildshard/SKILL.md']) expect(existsSync(resolve(repo, file)), file).toBe(true);
    const manifest = JSON.parse(readFileSync(resolve(repo, 'package.json'), 'utf8')) as { name: string; packageManager: string; dependencies: Record<string, string>; devDependencies?: unknown };
    expect(manifest.name).toBe('my-shard');
    expect(manifest.packageManager).toBe('pnpm@10.34.9');
    expect(manifest.dependencies).toEqual({ '@wildshard/engine': sdk.dependencies['@wildshard/engine'], '@wildshard/format': sdk.dependencies['@wildshard/format'], '@wildshard/sdk': sdk.version, three: sdk.peerDependencies['three'] });
    expect(manifest.devDependencies).toBeUndefined();
    expect(Object.keys(manifest.dependencies)).not.toContain('@wildshard/sharddev');
    // Exact pins: no range operator on any of them.
    for (const spec of Object.values(manifest.dependencies)) expect(spec).not.toMatch(/^[\^~><=*]|latest/u);
    expect(readFileSync(resolve(repo, '.gitignore'), 'utf8')).toMatch(/^public\/shardfiles\/$/mu);
    expect(readFileSync(resolve(repo, 'README.md'), 'utf8')).not.toMatch(/product/u);
    // The template's own README (sharddev notes) is not copied into the shard source.
    expect(existsSync(resolve(repo, 'src/README.md'))).toBe(false);
  });

  it('no flag gives the sdk template: Mossgate at src/', async () => {
    const repo = resolve(scratch, 'default');
    await runCli(['new', repo]);
    expect(existsSync(resolve(repo, 'src/generators/generate.ts'))).toBe(true);
    expect(readFileSync(resolve(repo, 'README.md'), 'utf8')).toContain('Mossgate');
  });

  it('an unknown template refuses before writing, naming both', async () => {
    const repo = resolve(scratch, 'unknown');
    await expect(runCli(['new', repo, '--template', 'x'])).rejects.toThrow(/unknown template x.*--template sdk or --template blender/u);
    expect(existsSync(repo)).toBe(false);
    await expect(runCli(['new', repo, '--template'])).rejects.toThrow(/usage: wildshard new/u);
    expect(existsSync(repo)).toBe(false);
  });

  it('--template blender: the hand-written blender-template at src/, renamed, settled, and checked', async () => {
    const repo = resolve(scratch, 'blender');
    await runCli(['new', repo, 'clay-hall', '--template', 'blender']);
    // The source's real entry is its index: a shard file folder held by hand, no shard.config.ts and no TypeScript.
    expect(existsSync(resolve(repo, 'src/shard.json'))).toBe(true);
    expect(existsSync(resolve(repo, 'src/shard.config.ts'))).toBe(false);
    expect(existsSync(resolve(repo, 'src/shards'))).toBe(false);
    expect(existsSync(resolve(repo, 'tsconfig.json'))).toBe(false);
    for (const file of ['package.json', '.gitignore', '.npmrc', 'README.md', 'pnpm-workspace.yaml', 'GUIDE.md', '.claude/skills/wildshard/SKILL.md']) expect(existsSync(resolve(repo, file)), file).toBe(true);
    const manifest = JSON.parse(readFileSync(resolve(repo, 'package.json'), 'utf8')) as { name: string; dependencies?: unknown; devDependencies: Record<string, string> };
    expect(manifest.name).toBe('clay-hall');
    // J314: no sdk at runtime and no three.js; the CLI and shard-format only, pinned exactly as the sdk pins format.
    expect(manifest.dependencies).toBeUndefined();
    expect(manifest.devDependencies).toEqual({ '@wildshard/format': sdk.dependencies['@wildshard/format'], '@wildshard/sdk': sdk.version });
    expect(readFileSync(resolve(repo, 'README.md'), 'utf8')).toContain('hand-written');
    // Renamed everywhere a person holds JSON: no blender-template slug, path or name is left outside the baked blobs.
    expect(existsSync(resolve(repo, 'src/mounts/shardfiles/clay-hall/discovery.json'))).toBe(true);
    for (const file of ['shard.json', 'cook.json', 'sections/ui/level.json', 'mounts/shardfiles/clay-hall/discovery.json']) expect(readFileSync(resolve(repo, 'src', file), 'utf8'), file).not.toMatch(/blender-template|Blender Template/u);
    expect(findShardSource(repo)).toBe(resolve(repo, 'src'));
    expect(shardFolderName(resolve(repo, 'src'))).toBe('clay-hall');
    // Settled from the start: format admits the folder as it stands.
    expect(validateOutputProduct(resolve(repo, 'src')).shard.identity.slug).toBe('clay-hall');
    // check settles the source into the repo's built folder and passes; an edited section is settled again, not refused.
    const level = resolve(repo, 'src/sections/ui/level.json');
    writeFileSync(level, readFileSync(level, 'utf8').replace('"blurb":"Cross the high bridge', '"blurb":"Cross the long bridge'));
    const result = await checkProject(findShardSource(repo), undefined);
    expect(result.steps.map(step => [step.name, step.status])).toEqual([['lint', 'skip'], ['build', 'pass'], ['validate', 'pass'], ['prove', 'skip'], ['report', 'pass']]);
    expect(readdirSync(resolve(repo, 'public/shardfiles/clay-hall'))).toContain('shard.json');
    // build has nothing to build there and says so; check refuses a hand-written folder outside a repo's src/.
    await expect(runCli(['build', repo])).rejects.toThrow(/hand-written shard file .*run wildshard check/u);
    const loose = await checkProject(resolve(repo, 'public/shardfiles/clay-hall'), undefined);
    expect(loose.verdict).toBe('fail');
  });
});

describe('the verbs find a shard source at src/ or src/shards/<slug>/ (SA16)', () => {
  let scratch = '';
  const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  beforeAll(() => { mkdirSync('tmp', { recursive: true }); scratch = mkdtempSync(resolve('tmp', 'shard-source-')); });
  afterAll(() => { log.mockRestore(); rmSync(scratch, { recursive: true, force: true }); });

  it('finds src/, one src/shards/<slug>/, a source itself, and leaves several shards to the caller', () => {
    const single = resolve(scratch, 'single'), multi = resolve(scratch, 'multi'), two = resolve(scratch, 'two');
    newProject(resolve(single, 'src'), 'single');
    newProject(resolve(multi, 'src/shards/only'), 'only');
    newProject(resolve(two, 'src/shards/one'), 'one');
    newProject(resolve(two, 'src/shards/other'), 'other');
    expect(findShardSource(single)).toBe(resolve(single, 'src'));
    expect(findShardSource(resolve(single, 'src'))).toBe(resolve(single, 'src'));
    expect(findShardSource(multi)).toBe(resolve(multi, 'src/shards/only'));
    expect(findShardSource(two)).toBe(two);
    expect(shardOutputRoot(resolve(single, 'src'))).toBe(single);
    expect(shardOutputRoot(resolve(multi, 'src/shards/only'))).toBe(resolve(multi, 'src/shards/only'));
  });

  it('a src/ source is named by its manifest slug, not its repo folder (new <dir> <slug>)', async () => {
    const repo = resolve(scratch, 'folder-unlike-slug');
    await runCli(['new', repo, 'other-slug']);
    expect(shardFolderName(resolve(repo, 'src'))).toBe('other-slug');
    expect(shardFolderName(resolve(scratch, 'single'))).toBe('single');
  });

  it('build finds the shard at either layout', async () => {
    for (const [repo, slug, source] of [['layout-src', 'at-src', 'src'], ['layout-shards', 'at-shards', 'src/shards/at-shards']] as const) {
      const root = resolve(scratch, repo);
      newProject(resolve(root, source), slug);
      const out = resolve(scratch, `${repo}-out`);
      await runCli(['build', root, out, '--folder-only']);
      expect(readdirSync(out)).toContain('shard.json');
    }
  });
});
