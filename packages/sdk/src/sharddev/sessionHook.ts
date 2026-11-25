// oxlint-disable-next-line import/no-nodejs-modules -- `new` and `update` write the shard repo's agent hook files.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve files beneath the shard repo.
import { dirname, resolve } from 'node:path';

// SDK 0.5.0 plan M5 (ask A7): a shard repo's agents hear about a pending migration when a session starts, before anyone
// asks. `new` and `update` register a SessionStart hook that runs `wildshard status --brief` (one line while a migration
// is pending, nothing otherwise) for Claude Code (`.claude/settings.json`) and Codex (`.codex/hooks.json`). It is merged
// into the repo's own hooks, never duplicated, and a file that is not valid JSON is left alone. A repo whose hooks come
// from repo-kit's agent-sync (`.agents/hooks.json`) gets it in `.agents/hooks.local.json`, the repo's own spec, with a
// script under `.agents/hooks/`: sync rewrites both tools' files from those specs, and its parity check refuses an
// inline command.

/** What the hook runs. `2>/dev/null || true`: pnpm without an installed `wildshard` (no `node_modules` yet) says nothing
 * and the session starts as usual; `status --brief` itself always exits 0. */
export const STATUS_COMMAND = 'pnpm exec wildshard status --brief 2>/dev/null || true';
/** How a handler is recognised as this hook, in any spelling an sdk wrote. */
const MARKER = 'wildshard status --brief';
const TIMEOUT = 10;
const STATUS_MESSAGE = 'Checking for a pending sdk migration';

export const CLAUDE_SETTINGS = '.claude/settings.json';
export const CODEX_HOOKS = '.codex/hooks.json';
/** repo-kit's agent-sync: the kit's spec, whose presence means the two files above are generated. */
export const AGENT_SYNC_SPEC = '.agents/hooks.json';
/** The repo's own spec beside it, which a kit stamp never replaces. */
export const AGENT_SYNC_LOCAL_SPEC = '.agents/hooks.local.json';
/** The script the local spec names (agent-sync runs only scripts under `.agents/hooks/`). */
export const STATUS_SCRIPT = '.agents/hooks/wildshard-status.sh';
export const STATUS_SCRIPT_TEXT = `#!/usr/bin/env bash
# Written by \`wildshard new\` and \`wildshard update\` (@wildshard/sdk), which rewrite it: at session start, one line when
# the installed sdk has a migration this repo has not run, nothing otherwise. It never fails a session start.
cd "$(dirname "$0")/../.." || exit 0
pnpm exec wildshard status --brief 2>/dev/null || true
`;

/** What happened to one hook file. `left`: it is not valid JSON (or not hooks), so nothing was added; `note` says why. */
export type HookFileAction = 'added' | 'updated' | 'unchanged' | 'left';
export interface HookFileChange { readonly file: string; readonly action: HookFileAction; readonly note?: string }

type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
const left = (file: string, why: string): HookFileChange => ({ file, action: 'left', note: `${why}, so no SessionStart hook was added; add \`${STATUS_COMMAND}\` there by hand` });

/** Parse a JSON object file, or say why it is not one. Missing: an empty object. */
function readObject(path: string): { readonly value: Json; readonly text: string | undefined } | string {
  if (!existsSync(path)) return { value: {}, text: undefined };
  const text = readFileSync(path, 'utf8');
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return 'it is not valid JSON'; }
  return isRecord(parsed) ? { value: parsed, text } : 'it is not a JSON object';
}

function writeText(path: string, before: string | undefined, after: string): HookFileAction {
  if (before === after) return 'unchanged';
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, after);
  return before === undefined ? 'added' : 'updated';
}

/** Merge the handler into one tool's `hooks` object (Claude's settings key, or Codex's whole file): the first handler
 * that runs `wildshard status --brief` becomes `handler`, any further one goes, and with none a new group is added. */
function mergeHooks(hooks: unknown, handler: Json): Json | string {
  if (hooks !== undefined && !isRecord(hooks)) return '"hooks" is not an object';
  const groups: unknown = hooks?.['SessionStart'] ?? [];
  if (!Array.isArray(groups)) return '"hooks.SessionStart" is not a list';
  let found = false;
  // A group left empty by dropping a duplicate goes too; the repo's own groups stay as they are.
  const next: unknown[] = groups.flatMap((group: unknown) => {
    const inner: unknown = isRecord(group) ? group['hooks'] : undefined;
    if (!isRecord(group) || !Array.isArray(inner)) return [group];
    const handlers = inner.flatMap((each: unknown) => {
      if (!isRecord(each) || typeof each['command'] !== 'string' || !each['command'].includes(MARKER)) return [each];
      if (found) return [];
      found = true;
      return [handler];
    });
    return handlers.length === 0 && inner.length > 0 ? [] : [{ ...group, hooks: handlers }];
  });
  if (!found) next.push({ hooks: [handler] });
  return { ...hooks, SessionStart: next };
}

/** Add the hook to a tool's file directly: `.claude/settings.json` (its `hooks` key; every other key stays) or
 * `.codex/hooks.json`. */
function writeToolHook(project: string, file: string, handler: Json): HookFileChange {
  const path = resolve(project, file), read = readObject(path);
  if (typeof read === 'string') return left(file, read);
  const hooks = mergeHooks(read.value['hooks'], handler);
  if (typeof hooks === 'string') return left(file, hooks);
  return { file, action: writeText(path, read.text, json({ ...read.value, hooks })) };
}

/** agent-sync's spec entry, `{ event, script, status, timeout }`, merged into `.agents/hooks.local.json` by its script. */
function writeLocalSpec(project: string): HookFileChange {
  const path = resolve(project, AGENT_SYNC_LOCAL_SPEC), read = readObject(path);
  if (typeof read === 'string') return left(AGENT_SYNC_LOCAL_SPEC, read);
  const entries: unknown = read.value['hooks'] ?? [];
  if (!Array.isArray(entries)) return left(AGENT_SYNC_LOCAL_SPEC, '"hooks" is not a list');
  const entry = { event: 'SessionStart', script: STATUS_SCRIPT, status: STATUS_MESSAGE, timeout: TIMEOUT };
  const ours = (each: unknown): boolean => isRecord(each) && each['script'] === STATUS_SCRIPT;
  const first = entries.findIndex(ours);
  const next = first === -1 ? [...entries, entry] : entries.flatMap((each: unknown, index) => (ours(each) ? (index === first ? [entry] : []) : [each]));
  return { file: AGENT_SYNC_LOCAL_SPEC, action: writeText(path, read.text, json({ ...read.value, hooks: next })) };
}

/** The script the local spec runs; the sdk's, rewritten when it differs. */
function writeScript(project: string): HookFileChange {
  const path = resolve(project, STATUS_SCRIPT);
  const action = writeText(path, existsSync(path) ? readFileSync(path, 'utf8') : undefined, STATUS_SCRIPT_TEXT);
  if (action !== 'unchanged') chmodSync(path, 0o755);
  return { file: STATUS_SCRIPT, action };
}

/** True when the repo's agent hooks are generated by repo-kit's agent-sync from `.agents/hooks.json`. */
export const usesAgentSync = (project: string): boolean => existsSync(resolve(project, AGENT_SYNC_SPEC));

/**
 * M5: register the SessionStart `wildshard status --brief` hook in the shard repo at `project`, once. With agent-sync,
 * in `.agents/hooks.local.json` (and its script); `pnpm agents:sync` then writes both tools' files. Otherwise in
 * `.claude/settings.json` and `.codex/hooks.json`, kept beside the repo's own hooks.
 */
export function syncSessionHook(project: string): readonly HookFileChange[] {
  if (usesAgentSync(project)) return [writeScript(project), writeLocalSpec(project)];
  return [
    writeToolHook(project, CLAUDE_SETTINGS, { type: 'command', command: STATUS_COMMAND, timeout: TIMEOUT }),
    writeToolHook(project, CODEX_HOOKS, { type: 'command', command: STATUS_COMMAND, timeout: TIMEOUT, statusMessage: STATUS_MESSAGE }),
  ];
}
