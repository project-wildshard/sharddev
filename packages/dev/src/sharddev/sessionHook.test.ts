// oxlint-disable-next-line import/no-nodejs-modules -- Real scratch shard repos, and the hook and agent-sync run as processes.
import { spawnSync } from 'node:child_process';
// oxlint-disable-next-line import/no-nodejs-modules -- Scaffold shard repos into a scratch folder.
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve the package root and scratch projects.
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SDK_ROOT, SKILLS, skillLink, updateShardRepo } from '../../../sdk/src/sharddev/agentFiles';
import { readStamp } from '../../../sdk/src/sharddev/migrations';
import { writeShardRepo } from '../../../sdk/src/sharddev/newProject';
import { AGENT_SYNC_LOCAL_SPEC, CLAUDE_SETTINGS, CODEX_HOOKS, STATUS_COMMAND, STATUS_SCRIPT } from '../../../sdk/src/sharddev/sessionHook';

// SDK 0.5.0 plan M5: `new` and `update` give a shard repo's agents a SessionStart hook running `wildshard status --brief`,
// merged into the repo's own hooks and never duplicated; a repo on repo-kit's agent-sync gets it in its own spec. `new`
// stamps the repo at its sdk's version.
const ROOT = resolve(import.meta.dirname, '../..');
const AGENT_SYNC = resolve(ROOT, '../../src/scripts/.kit/agent-sync.mjs');
const SDK_VERSION = (JSON.parse(readFileSync(resolve(SDK_ROOT, 'package.json'), 'utf8')) as { version: string }).version;
const CLAUDE_HANDLER = { type: 'command', command: STATUS_COMMAND, timeout: 10 };
const CODEX_HANDLER = { ...CLAUDE_HANDLER, statusMessage: 'Checking for a pending sdk migration' };

const readJson = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'));
const writeJson = (file: string, value: unknown): void => { mkdirSync(resolve(file, '..'), { recursive: true }); writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
/** Every handler, in every tool's SessionStart groups, that runs the status hook. */
const statusHandlers = (hooks: unknown): unknown[] => ((hooks as { SessionStart?: { hooks: { command: string }[] }[] }).SessionStart ?? [])
  .flatMap(group => group.hooks).filter(handler => handler.command.includes('wildshard status --brief'));

describe('the SessionStart status hook (M5)', () => {
  let scratch = '';
  beforeEach(() => { mkdirSync(resolve(ROOT, 'tmp'), { recursive: true }); scratch = mkdtempSync(resolve(ROOT, 'tmp', 'session-hook-')); });
  afterEach(() => { rmSync(scratch, { recursive: true, force: true }); });

  it('new writes it for Claude Code and Codex, and stamps the repo at its sdk', () => {
    const project = resolve(scratch, 'my-shard');
    writeShardRepo(project, 'my-shard', { empty: true });
    expect(readJson(resolve(project, CLAUDE_SETTINGS))).toEqual({ hooks: { SessionStart: [{ hooks: [CLAUDE_HANDLER] }] } });
    expect(readJson(resolve(project, CODEX_HOOKS))).toEqual({ hooks: { SessionStart: [{ hooks: [CODEX_HANDLER] }] } });
    expect(readStamp(project)).toBe(SDK_VERSION);
    // A second sync (update) writes nothing.
    expect(updateShardRepo(project).at(-1)).toBe('  already up to date');
  });

  it('update keeps the repo\'s own hooks and settings, adds the hook once, and folds a duplicate', () => {
    const project = resolve(scratch, 'old-shard');
    writeShardRepo(project, 'old-shard', { empty: true });
    const own = { type: 'command', command: 'bash "$CLAUDE_PROJECT_DIR/scripts/brief.sh"' };
    const guard = { matcher: 'Bash', hooks: [{ type: 'command', command: 'node scripts/guard.mjs' }] };
    writeJson(resolve(project, CLAUDE_SETTINGS), { permissions: { allow: ['Bash(pnpm:*)'] }, hooks: { SessionStart: [{ hooks: [own] }], PreToolUse: [guard] } });
    writeJson(resolve(project, CODEX_HOOKS), { hooks: { SessionStart: [{ hooks: [own] }, { hooks: [{ type: 'command', command: 'wildshard status --brief' }] }, { hooks: [{ type: 'command', command: 'pnpm exec wildshard status --brief' }] }] } });

    const lines = updateShardRepo(project);

    expect(lines).toContain(`  updated ${CLAUDE_SETTINGS}`);
    expect(lines).toContain(`  updated ${CODEX_HOOKS}`);
    expect(readJson(resolve(project, CLAUDE_SETTINGS))).toEqual({ permissions: { allow: ['Bash(pnpm:*)'] }, hooks: { SessionStart: [{ hooks: [own] }, { hooks: [CLAUDE_HANDLER] }], PreToolUse: [guard] } });
    // An older spelling becomes the current one in place; the second copy goes, and its group with it.
    expect(readJson(resolve(project, CODEX_HOOKS))).toEqual({ hooks: { SessionStart: [{ hooks: [own] }, { hooks: [CODEX_HANDLER] }] } });
    for (const file of [CLAUDE_SETTINGS, CODEX_HOOKS]) expect(statusHandlers((readJson(resolve(project, file)) as { hooks: unknown }).hooks)).toHaveLength(1);
    expect(updateShardRepo(project).at(-1)).toBe('  already up to date');
  });

  it('leaves a hook file that is not valid JSON as it is, and says so', () => {
    const project = resolve(scratch, 'broken');
    writeShardRepo(project, 'broken', { empty: true });
    writeFileSync(resolve(project, CLAUDE_SETTINGS), '{ "hooks": ');
    const lines = updateShardRepo(project);
    expect(readFileSync(resolve(project, CLAUDE_SETTINGS), 'utf8')).toBe('{ "hooks": ');
    expect(lines).toContain(`  left ${CLAUDE_SETTINGS}: it is not valid JSON, so no SessionStart hook was added; add \`${STATUS_COMMAND}\` there by hand`);
  });

  it('a repo on agent-sync gets it in .agents/hooks.local.json, which agent-sync renders for both tools', () => {
    const project = resolve(scratch, 'org-shard');
    writeShardRepo(project, 'org-shard', { empty: true });
    rmSync(resolve(project, '.claude/settings.json'));
    rmSync(resolve(project, '.codex'), { recursive: true });
    // The org's layout (repo-kit MA2): each skill is a folder in .agents/skills/, linked from .claude/skills/.
    for (const name of SKILLS) {
      rmSync(resolve(project, skillLink(name)));
      renameSync(resolve(project, `.claude/skills/${name}`), resolve(project, skillLink(name)));
      symlinkSync(`../../.agents/skills/${name}`, resolve(project, `.claude/skills/${name}`), 'dir');
    }
    writeJson(resolve(project, '.agents/hooks.json'), { hooks: [] });
    const mine = { event: 'PreToolUse', tools: 'shell', script: '.agents/hooks/mine.sh' };
    mkdirSync(resolve(project, '.agents/hooks'));
    writeFileSync(resolve(project, '.agents/hooks/mine.sh'), '#!/usr/bin/env bash\n');
    writeJson(resolve(project, AGENT_SYNC_LOCAL_SPEC), { hooks: [mine] });

    const lines = updateShardRepo(project);

    expect(lines).toContain(`  added ${STATUS_SCRIPT}`);
    expect(lines).toContain(`  updated ${AGENT_SYNC_LOCAL_SPEC}`);
    expect(lines.at(-1)).toMatch(/^ {2}run pnpm agents:sync: /u);
    const entry = { event: 'SessionStart', script: STATUS_SCRIPT, status: 'Checking for a pending sdk migration', timeout: 10 };
    expect(readJson(resolve(project, AGENT_SYNC_LOCAL_SPEC))).toEqual({ hooks: [mine, entry] });
    expect(statSync(resolve(project, STATUS_SCRIPT)).mode & 0o111).not.toBe(0);
    // update never writes the files sync owns.
    expect(() => statSync(resolve(project, CLAUDE_SETTINGS))).toThrow();
    expect(updateShardRepo(project).at(-1)).toBe('  already up to date');

    // The org's sync (this repo's copy of repo-kit's) accepts the spec and writes the hook into both tools' files.
    const sync = spawnSync(process.execPath, [AGENT_SYNC, '--root', project], { encoding: 'utf8' });
    expect(sync.status, sync.stderr).toBe(0);
    const claude = readJson(resolve(project, CLAUDE_SETTINGS)) as { hooks: { SessionStart: unknown } };
    expect(claude.hooks.SessionStart).toEqual([{ hooks: [{ type: 'command', command: `bash "$CLAUDE_PROJECT_DIR/${STATUS_SCRIPT}"`, timeout: 10 }] }]);
    const codex = readJson(resolve(project, CODEX_HOOKS)) as { hooks: { SessionStart: unknown } };
    expect(codex.hooks.SessionStart).toEqual([{ hooks: [{ type: 'command', command: `bash "$(git rev-parse --show-toplevel)/${STATUS_SCRIPT}"`, timeout: 10, statusMessage: 'Checking for a pending sdk migration' }] }]);
  });

  it('never fails a session start: with no wildshard to run, the hook exits 0 and prints nothing', () => {
    const project = resolve(scratch, 'not-installed');
    writeShardRepo(project, 'not-installed', { empty: true });
    writeJson(resolve(project, '.agents/hooks.json'), { hooks: [] });
    updateShardRepo(project);
    // A pnpm that cannot find the command, as pnpm says before `pnpm install`.
    const bin = resolve(scratch, 'bin');
    mkdirSync(bin);
    writeFileSync(resolve(bin, 'pnpm'), '#!/bin/sh\necho "ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command \\"wildshard\\" not found" >&2\nexit 254\n', { mode: 0o755 });
    const env = { ...process.env, PATH: `${bin}:/usr/bin:/bin` };
    for (const [shell, args] of [['bash', [resolve(project, STATUS_SCRIPT)]], ['sh', ['-c', STATUS_COMMAND]]] as const) {
      const done = spawnSync(shell, args, { cwd: resolve(project, 'src'), encoding: 'utf8', env });
      expect([done.status, done.stdout, done.stderr]).toEqual([0, '', '']);
    }
  });
});
