// oxlint-disable-next-line import/no-nodejs-modules -- Scaffold shard repos and a fake newer sdk into a scratch folder.
import { appendFileSync, cpSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve the package root and scratch projects.
import { relative, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AGENTS_FILE, AGENTS_TEXT, CLAUDE_FILE, CLAUDE_TEXT, GUIDE_SOURCE, SDK_ROOT, SKILLS, skillFile, skillLink, skillLinkTarget, skillSource, syncAgentFiles, updateShardRepo } from './agentFiles';
import { projectPerformancePolicy } from './performancePolicy';
import type { Shardfile } from '@wildshard/format/shardSchema';
import { writeShardRepo } from './newProject';
import { runCli } from './cli';

// SHARD-AUTHORING SA28 (J314 Q7, Q8, Q27): `new` and `update` write the agent files; `update` after an sdk bump
// rewrites exactly GUIDE.md and the four skills and keeps every author edit.
const ROOT = resolve(import.meta.dirname, '../..');
const OWNED = ['GUIDE.md', ...SKILLS.map(skillFile)].toSorted();

/** Every file under `folder` by its repo path: a file's text, a link's target. */
function snapshot(folder: string): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name), name = relative(folder, path);
      if (entry.isSymbolicLink()) files.set(name, `link -> ${readlinkSync(path)}`);
      else if (entry.isDirectory()) walk(path);
      else files.set(name, readFileSync(path, 'utf8'));
    }
  };
  walk(folder);
  return files;
}
const changed = (before: Map<string, string>, after: Map<string, string>): string[] =>
  [...new Set([...before.keys(), ...after.keys()])].filter(name => before.get(name) !== after.get(name)).toSorted();

/** A newer sdk: this package's GUIDE.md and skills, each with a line the installed copy lacks, and a higher version. */
function newerSdk(at: string): string {
  mkdirSync(at, { recursive: true });
  writeFileSync(resolve(at, 'package.json'), JSON.stringify({ name: '@wildshard/sdk', version: '9.9.9' }));
  writeFileSync(resolve(at, 'GUIDE.md'), `${readFileSync(GUIDE_SOURCE, 'utf8')}\nA paragraph the newer sdk added.\n`);
  for (const name of SKILLS) {
    mkdirSync(resolve(at, `skills/${name}`), { recursive: true });
    writeFileSync(skillSource(name, at), `${readFileSync(skillSource(name), 'utf8')}\n- A rule the newer sdk added.\n`);
  }
  return at;
}

describe('wildshard update and the agent files (SA28)', () => {
  let scratch = '';
  beforeEach(() => { mkdirSync(resolve(ROOT, 'tmp'), { recursive: true }); scratch = mkdtempSync(resolve(ROOT, 'tmp', 'agent-files-')); });
  afterEach(() => { rmSync(scratch, { recursive: true, force: true }); });

  it.each([['sdk', false], ['sdk', true], ['blender', false]] as const)('new --template %s (empty: %s) writes the guide, the skills, their links, AGENTS.md and CLAUDE.md', (template, empty) => {
    const project = resolve(scratch, 'my-shard');
    writeShardRepo(project, 'my-shard', { template, empty });
    expect(readFileSync(resolve(project, 'GUIDE.md'), 'utf8')).toBe(readFileSync(GUIDE_SOURCE, 'utf8'));
    for (const name of SKILLS) {
      const skill = readFileSync(skillSource(name), 'utf8');
      expect(readFileSync(resolve(project, skillFile(name)), 'utf8')).toBe(skill);
      // Codex reads `.agents/skills/<name>/SKILL.md`: a relative link to the same folder, so a clone keeps it.
      expect(lstatSync(resolve(project, skillLink(name))).isSymbolicLink()).toBe(true);
      expect(readlinkSync(resolve(project, skillLink(name)))).toBe(skillLinkTarget(name));
      expect(readFileSync(resolve(project, skillLink(name), 'SKILL.md'), 'utf8')).toBe(skill);
    }
    expect(readFileSync(resolve(project, AGENTS_FILE), 'utf8')).toBe(AGENTS_TEXT);
    expect(readFileSync(resolve(project, CLAUDE_FILE), 'utf8')).toBe('@AGENTS.md\n');
    expect(AGENTS_TEXT).toMatch(/Read `GUIDE\.md` first/u);
    expect(AGENTS_TEXT).toMatch(/skills are in `\.claude\/skills\/`/u);
  });

  it('after an sdk bump changes exactly GUIDE.md and the four skills, and every author edit elsewhere survives', () => {
    const project = resolve(scratch, 'my-shard');
    writeShardRepo(project, 'my-shard');
    // The author's own work: shard source, README, package.json, a rule of their own in AGENTS.md, a file of their own.
    appendFileSync(resolve(project, 'src/data/identity.json'), '\n');
    appendFileSync(resolve(project, 'README.md'), '\nMy notes.\n');
    writeFileSync(resolve(project, 'package.json'), readFileSync(resolve(project, 'package.json'), 'utf8').replace('"0.0.1"', '"0.4.0"'));
    appendFileSync(resolve(project, AGENTS_FILE), '- Keep the river on the east side.\n');
    writeFileSync(resolve(project, 'NOTES.md'), 'mine\n');
    const before = snapshot(project), sdk = newerSdk(resolve(scratch, 'sdk-9.9.9'));

    const lines = updateShardRepo(project, sdk);

    const after = snapshot(project);
    expect(changed(before, after)).toEqual(OWNED);
    expect(after.get('GUIDE.md')).toBe(readFileSync(resolve(sdk, 'GUIDE.md'), 'utf8'));
    for (const name of SKILLS) expect(after.get(skillFile(name))).toBe(readFileSync(skillSource(name, sdk), 'utf8'));
    expect(after.get(AGENTS_FILE)).toBe(`${AGENTS_TEXT}- Keep the river on the east side.\n`);
    expect(lines).toEqual([
      'wildshard update: GUIDE.md and the skills from @wildshard/sdk 9.9.9',
      '  updated GUIDE.md',
      ...SKILLS.map(name => `  updated ${skillFile(name)}`),
      '  left AGENTS.md: you changed it, so update kept yours',
      '  5 files written; nothing else touched',
    ]);
  });

  it('a second update writes nothing', () => {
    const project = resolve(scratch, 'my-shard');
    writeShardRepo(project, 'my-shard', { empty: true });
    const before = snapshot(project);
    const { version } = JSON.parse(readFileSync(resolve(SDK_ROOT, 'package.json'), 'utf8')) as { version: string };
    expect(updateShardRepo(project)).toEqual([`wildshard update: GUIDE.md and the skills from @wildshard/sdk ${version}`, '  already up to date']);
    expect(changed(before, snapshot(project))).toEqual([]);
  });

  it('adds the agent files a repo made before SA28 lacks, and keeps a CLAUDE.md or link the author changed', () => {
    const project = resolve(scratch, 'old-shard');
    writeShardRepo(project, 'old-shard', { template: 'blender' });
    rmSync(resolve(project, AGENTS_FILE));
    rmSync(resolve(project, '.agents'), { recursive: true });
    writeFileSync(resolve(project, CLAUDE_FILE), '@AGENTS.md\n\nMy Claude notes.\n');
    const lines = updateShardRepo(project);
    expect(readFileSync(resolve(project, AGENTS_FILE), 'utf8')).toBe(AGENTS_TEXT);
    expect(readFileSync(resolve(project, CLAUDE_FILE), 'utf8')).toBe('@AGENTS.md\n\nMy Claude notes.\n');
    for (const name of SKILLS) expect(readlinkSync(resolve(project, skillLink(name)))).toBe(skillLinkTarget(name));
    expect(lines).toContain('  added AGENTS.md');
    expect(lines).toContain('  left CLAUDE.md: you changed it, so update kept yours');
    expect(CLAUDE_TEXT).toBe('@AGENTS.md\n');
  });

  it('keeps a link the author replaced, and replaces an AGENTS.md an earlier sdk wrote that nobody touched', () => {
    const project = resolve(scratch, 'my-shard');
    writeShardRepo(project, 'my-shard', { empty: true });
    // A real folder where the link was, and a link pointed somewhere else: both the author's.
    rmSync(resolve(project, skillLink('wildshard')));
    mkdirSync(resolve(project, skillLink('wildshard')));
    writeFileSync(resolve(project, skillLink('wildshard'), 'SKILL.md'), 'mine\n');
    rmSync(resolve(project, skillLink('wildshard-goldens')));
    symlinkSync('../../elsewhere', resolve(project, skillLink('wildshard-goldens')), 'dir');
    const older = '# AGENTS.md\n\nWhat an earlier sdk wrote.\n';
    writeFileSync(resolve(project, AGENTS_FILE), older);
    const before = snapshot(project);
    const actions = new Map(syncAgentFiles(project, SDK_ROOT, [older]).map(change => [change.file, change.action]));
    expect(actions.get(skillLink('wildshard'))).toBe('left');
    expect(actions.get(skillLink('wildshard-goldens'))).toBe('left');
    expect(actions.get(AGENTS_FILE)).toBe('updated');
    expect(changed(before, snapshot(project))).toEqual([AGENTS_FILE]);
    expect(readFileSync(resolve(project, AGENTS_FILE), 'utf8')).toBe(AGENTS_TEXT);
    // Without the older text on the sdk's list, the same file is the author's.
    writeFileSync(resolve(project, AGENTS_FILE), older);
    expect(new Map(syncAgentFiles(project).map(change => [change.file, change.action])).get(AGENTS_FILE)).toBe('left');
  });

  it('a new repo with a first-party slug still gets the outside policy, though new wrote it an AGENTS.md', () => {
    const project = resolve(scratch, 'driftwood-isle'), source = { identity: { slug: 'driftwood-isle' } } as Pick<Shardfile, 'identity'>;
    writeShardRepo(project, 'driftwood-isle');
    expect(projectPerformancePolicy(resolve(project, 'src'), source, project)).toBe('refuse');
    // The gate is the first-party package name, which `new` never writes.
    writeFileSync(resolve(project, 'package.json'), JSON.stringify({ name: '@wildshard/shard-driftwood' }));
    expect(projectPerformancePolicy(resolve(project, 'src'), source, project)).toBe('warn');
  });

  it('runs as `wildshard update [dir]` and refuses a folder that is not a shard repo', async () => {
    const project = resolve(scratch, 'my-shard');
    writeShardRepo(project, 'my-shard', { empty: true });
    rmSync(resolve(project, 'GUIDE.md'));
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    try {
      await runCli(['update', project]);
      expect(info).toHaveBeenCalledWith('  added GUIDE.md');
    } finally { info.mockRestore(); }
    expect(readFileSync(resolve(project, 'GUIDE.md'), 'utf8')).toBe(readFileSync(GUIDE_SOURCE, 'utf8'));
    cpSync(resolve(project, 'src'), resolve(scratch, 'loose'), { recursive: true });
    await expect(runCli(['update', resolve(scratch, 'loose')])).rejects.toThrow(/is not a shard repo[\s\S]*\[update-target\] fix: .*GUIDE\.md#update-target/u);
    await expect(runCli(['update', project, 'extra'])).rejects.toThrow(/usage: wildshard update \[dir\]/u);
    await expect(runCli(['update', '-x'])).rejects.toThrow(/usage: wildshard update \[dir\]/u);
    // The org's shard repos list the sdk as @wildshard/sharddev (a GitHub pin, or NP8's npm:@wildshard/sdk alias): a shard repo too.
    for (const spec of ['github:project-wildshard/sharddev#ab4bbda4134eaacd99dff4086043ad2c84735386', 'npm:@wildshard/sdk@0.2.5']) {
      writeFileSync(resolve(project, 'package.json'), JSON.stringify({ name: 'my-shard', dependencies: { '@wildshard/sharddev': spec } }));
      await expect(runCli(['update', project])).resolves.toBeUndefined();
    }
    writeFileSync(resolve(project, 'package.json'), '{ not json');
    await expect(runCli(['update', project])).rejects.toThrow(/package\.json is not valid JSON[\s\S]*\[update-target\]/u);
  });
});
