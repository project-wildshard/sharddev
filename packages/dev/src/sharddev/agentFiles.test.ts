// oxlint-disable-next-line import/no-nodejs-modules -- repo-kit's agent-sync runs as a process.
import { spawnSync } from 'node:child_process';
// oxlint-disable-next-line import/no-nodejs-modules -- Scaffold shard repos and a fake newer sdk into a scratch folder.
import { appendFileSync, cpSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve the package root and scratch projects.
import { relative, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AGENTS_FILE, AGENTS_TEXT, CLAUDE_FILE, CLAUDE_TEXT, GUIDE_SOURCE, SDK_ROOT, SKILLS, agentSkillFile, agentsText, readGuide, skillFile, skillLink, skillLinkTarget, skillSource, syncAgentFiles, updateShardRepo } from '../../../sdk/src/sharddev/agentFiles';
import { projectPerformancePolicy } from '../../../sdk/src/sharddev/performancePolicy';
import type { Shardfile } from '@wildshard/format/shardSchema';
import { writeShardRepo } from '../../../sdk/src/sharddev/newProject';
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

  it.each([['scene', false], ['scene', true], ['blender', false]] as const)('new --template %s (empty: %s) writes the guide, the skills, their links, AGENTS.md and CLAUDE.md', (template, empty) => {
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
    appendFileSync(resolve(project, 'src/identity.json'), '\n');
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

  it('a new repo with a built-in slug still gets the outside policy, though new wrote it an AGENTS.md', () => {
    const project = resolve(scratch, 'driftwood-isle'), source = { identity: { slug: 'driftwood-isle' } } as Pick<Shardfile, 'identity'>;
    writeShardRepo(project, 'driftwood-isle');
    expect(projectPerformancePolicy(resolve(project, 'src'), source, project)).toBe('refuse');
    // The gate is the built-in package name, which `new` never writes.
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

  // Ask A8: a repo on repo-kit's agent-sync keeps skills as real folders in .agents/skills/, which sync links from
  // .claude/skills/, and its hooks in .agents/hooks.json; update follows that layout, and `--guide` moves GUIDE.md.
  /** An org shard repo as repo-kit stamps it: a hooks spec, a skill of its own linked by sync, and an AGENTS.md. */
  function orgRepo(name: string): string {
    const project = resolve(scratch, name);
    mkdirSync(resolve(project, '.agents/skills/grill-me'), { recursive: true });
    mkdirSync(resolve(project, '.claude/skills'), { recursive: true });
    writeFileSync(resolve(project, 'package.json'), `${JSON.stringify({ name, private: true, dependencies: { '@wildshard/sdk': '0.4.12' } }, null, 2)}\n`);
    writeFileSync(resolve(project, AGENTS_FILE), '# AGENTS.md\n\nThe org\'s rules.\n');
    writeFileSync(resolve(project, CLAUDE_FILE), CLAUDE_TEXT);
    writeFileSync(resolve(project, '.agents/hooks.json'), `${JSON.stringify({ hooks: [] }, null, 2)}\n`);
    writeFileSync(resolve(project, '.agents/skills/grill-me/SKILL.md'), '---\nname: grill-me\ndescription: mine\n---\n');
    symlinkSync('../../.agents/skills/grill-me', resolve(project, '.claude/skills/grill-me'), 'dir');
    return project;
  }
  const AGENT_SYNC = resolve(ROOT, '../../src/scripts/.kit/agent-sync.mjs');
  const agentSync = (project: string, ...args: string[]): ReturnType<typeof spawnSync> => spawnSync(process.execPath, [AGENT_SYNC, '--root', project, ...args], { encoding: 'utf8' });

  it('in an agent-sync repo writes the skills as real .agents/skills folders, never touches .claude/, and sync --check passes once synced', () => {
    const project = orgRepo('org-shard');
    const before = snapshot(project);

    const lines = updateShardRepo(project);

    const after = snapshot(project), touched = changed(before, after);
    // Nothing under .claude/: no skill folders, no links, no settings.json hooks (.agents/hooks.json owns them).
    expect(touched.filter(file => file.startsWith('.claude/'))).toEqual([]);
    expect(touched).toEqual(['.agents/hooks.local.json', '.agents/hooks/wildshard-status.sh', 'GUIDE.md', ...SKILLS.map(agentSkillFile)].toSorted());
    for (const name of SKILLS) {
      expect(lstatSync(resolve(project, skillLink(name))).isDirectory()).toBe(true);
      expect(after.get(agentSkillFile(name))).toBe(readFileSync(skillSource(name), 'utf8'));
    }
    expect(lines).toContain(`  added ${agentSkillFile('wildshard')}`);
    expect(lines.at(-1)).toMatch(/^ {2}run pnpm agents:sync: .*sync links the new \.agents\/skills folders from \.claude\/skills$/u);
    expect(after.get(AGENTS_FILE)).toBe('# AGENTS.md\n\nThe org\'s rules.\n');

    // repo-kit's sync links them; then its check is green and a second update writes nothing.
    expect(agentSync(project, '--check').status).not.toBe(0);
    const sync = agentSync(project);
    expect(sync.status, String(sync.stderr)).toBe(0);
    for (const name of SKILLS) expect(readlinkSync(resolve(project, `.claude/skills/${name}`))).toBe(`../../.agents/skills/${name}`);
    const check = agentSync(project, '--check');
    expect(check.status, `${String(check.stdout)}${String(check.stderr)}`).toBe(0);
    const synced = snapshot(project);
    expect(updateShardRepo(project).at(-1)).toBe('  already up to date');
    expect(changed(synced, snapshot(project))).toEqual([]);
    expect(agentSync(project, '--check').status).toBe(0);
  });

  // sdk-migrate F1 (t16, Driftwood's 0.5.0 upgrade): a repo with its own agents:sync script gets it run, so its own
  // check passes straight after update instead of refusing .claude/settings.json and .codex/hooks.json as out of date.
  it('in an agent-sync repo with an agents:sync script, update runs it and sync --check passes at once', () => {
    const project = orgRepo('org-shard-synced');
    const pkg = JSON.parse(readFileSync(resolve(project, 'package.json'), 'utf8')) as Record<string, unknown>;
    writeFileSync(resolve(project, 'package.json'), `${JSON.stringify({ ...pkg, scripts: { 'agents:sync': `node ${JSON.stringify(AGENT_SYNC)} --root .` } }, null, 2)}\n`);

    const lines = updateShardRepo(project);

    expect(lines.at(-1)).toMatch(/^ {2}ran pnpm agents:sync: /u);
    for (const name of SKILLS) expect(readlinkSync(resolve(project, `.claude/skills/${name}`))).toBe(`../../.agents/skills/${name}`);
    const check = agentSync(project, '--check');
    expect(check.status, `${String(check.stdout)}${String(check.stderr)}`).toBe(0);
  });

  it('in an agent-sync repo writes AGENTS.md for that layout when it is missing, and leaves a default-layout link with its fix', () => {
    const project = orgRepo('org-old');
    rmSync(resolve(project, AGENTS_FILE));
    symlinkSync(skillLinkTarget('wildshard-goldens'), resolve(project, skillLink('wildshard-goldens')), 'dir');
    const lines = updateShardRepo(project);
    expect(readFileSync(resolve(project, AGENTS_FILE), 'utf8')).toBe(agentsText('GUIDE.md', 'agent-sync'));
    expect(agentsText('GUIDE.md', 'agent-sync')).toMatch(/skills are in `\.agents\/skills\/`/u);
    const link = skillLink('wildshard-goldens');
    expect(lines).toContain(`  left ${agentSkillFile('wildshard-goldens')}: ${link} is a link to ${skillLinkTarget('wildshard-goldens')}, but agent-sync keeps skills as real folders there: rm ${link} && git mv .claude/skills/wildshard-goldens ${link}, then wildshard update and pnpm agents:sync`);
    expect(lstatSync(resolve(project, '.claude/skills/wildshard-goldens'), { throwIfNoEntry: false })).toBeUndefined();
  });

  it('--guide docs/GUIDE.md writes the guide there, records it, and later updates keep it there', async () => {
    const project = resolve(scratch, 'my-shard');
    writeShardRepo(project, 'my-shard', { empty: true });
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    let lines: string[];
    try {
      await runCli(['update', project, '--guide', 'docs/GUIDE.md']);
      lines = info.mock.calls.map(call => String(call[0]));
    } finally { info.mockRestore(); }
    expect(readFileSync(resolve(project, 'docs/GUIDE.md'), 'utf8')).toBe(readFileSync(GUIDE_SOURCE, 'utf8'));
    expect(readGuide(project)).toBe('docs/GUIDE.md');
    expect((JSON.parse(readFileSync(resolve(project, 'package.json'), 'utf8')) as { wildshard: unknown }).wildshard).toEqual({ migrated: expect.any(String), guide: 'docs/GUIDE.md' });
    expect(lines[0]).toMatch(/^wildshard update: docs\/GUIDE\.md and the skills from/u);
    expect(lines).toContain('  left GUIDE.md: the guide now lives at docs/GUIDE.md: delete this copy');
    expect(lines).toContain('  added docs/GUIDE.md');
    // The untouched AGENTS.md new wrote moves with the guide; the old root copy stays until the author deletes it.
    expect(readFileSync(resolve(project, AGENTS_FILE), 'utf8')).toBe(agentsText('docs/GUIDE.md'));
    rmSync(resolve(project, 'GUIDE.md'));
    // A plain update (as upgrade and migrate run it) reads the path back and writes no root GUIDE.md.
    const sdk = newerSdk(resolve(scratch, 'sdk-9.9.9'));
    expect(updateShardRepo(project, sdk)).toContain('  updated docs/GUIDE.md');
    expect(lstatSync(resolve(project, 'GUIDE.md'), { throwIfNoEntry: false })).toBeUndefined();
    // --guide GUIDE.md moves it back and drops the key.
    updateShardRepo(project, sdk, { guide: 'GUIDE.md' });
    expect((JSON.parse(readFileSync(resolve(project, 'package.json'), 'utf8')) as { wildshard: Record<string, unknown> }).wildshard['guide']).toBeUndefined();
    expect(readFileSync(resolve(project, AGENTS_FILE), 'utf8')).toBe(AGENTS_TEXT);
    for (const bad of ['/abs/GUIDE.md', '../GUIDE.md', 'docs/GUIDE.txt']) expect(() => updateShardRepo(project, sdk, { guide: bad })).toThrow(/--guide .* must be a \.md file inside the repo/u);
    for (const args of [['--guide'], ['--guide', '--pins'], ['--guide=a.md', '--guide=b.md'], ['--guide=a.md', '--pins']]) await expect(runCli(['update', project, ...args])).rejects.toThrow(/usage: wildshard update \[dir\] \[--guide <path>\]/u);
  });
});
