// oxlint-disable-next-line import/no-nodejs-modules -- `new` and `update` own only a shard repo's agent files.
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, symlinkSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve files beneath the shard repo and the installed sdk.
import { dirname, isAbsolute, posix, resolve } from 'node:path';
// `.ts`: updatePins.ts and migrations.ts load this module straight under Node (the migration gate).
import { AGENT_SYNC_LOCAL_SPEC, syncSessionHook, usesAgentSync } from './sessionHook.ts';

// SHARD-AUTHORING SA28 (J314 Q7, Q8, Q27): the agent files of a shard repo. `new` and `update` both run
// `syncAgentFiles`: GUIDE.md and the four skills are the sdk's and are rewritten from the installed sdk; the
// `.agents/skills` links, AGENTS.md and CLAUDE.md are written when missing and otherwise left as the author keeps them.
// Ask A8: a repo on repo-kit's agent-sync (`.agents/hooks.json`) keeps skills the other way round, real folders in
// `.agents/skills/` that `pnpm agents:sync` links from `.claude/skills/`, so there update writes the folders there and
// never touches `.claude/skills/`. `update --guide <path>` keeps GUIDE.md elsewhere (`docs/GUIDE.md`), recorded in
// package.json so `upgrade` and `migrate` keep it there too.

/** The installed sdk's package root: GUIDE.md, `skills/` and package.json ship there (`files`). */
export const SDK_ROOT: string = resolve(import.meta.dirname, '../..');

/** SA13 (J314): the author's manual at the package root; `new` and `update` copy it into the repo. */
export const GUIDE_SOURCE: string = resolve(SDK_ROOT, 'GUIDE.md');

/** SA14, SA27 (J314 Q6): the core `wildshard` skill and its three siblings, at the package's `skills/`. */
export const SKILLS = ['wildshard', 'wildshard-mockup-to-model', 'wildshard-goldens', 'wildshard-upgrade'] as const;
export type SkillName = (typeof SKILLS)[number];
/** A skill's file in the installed sdk (or in `root`, another sdk). */
export const skillSource = (name: SkillName, root: string = SDK_ROOT): string => resolve(root, `skills/${name}/SKILL.md`);
/** Where a repo keeps a skill: Claude Code lists project skills from `.claude/skills/<name>/SKILL.md`. */
export const skillFile = (name: SkillName): string => `.claude/skills/${name}/SKILL.md`;
/** Codex lists project skills from `.agents/skills/<name>/`: a link to the Claude Code folder, so both read one copy. */
export const skillLink = (name: SkillName): string => `.agents/skills/${name}`;
/** The link's target, relative to `.agents/skills/`, so the repo keeps working wherever it is cloned. */
export const skillLinkTarget = (name: SkillName): string => `../../.claude/skills/${name}`;
/** A8: where an agent-sync repo keeps a skill: a real folder in `.agents/skills/`, which sync links for Claude Code. */
export const agentSkillFile = (name: SkillName): string => `.agents/skills/${name}/SKILL.md`;
/** The core `wildshard` skill (SA14). */
export const SKILL_SOURCE: string = skillSource('wildshard');
export const SKILL_FILE: string = skillFile('wildshard');

export const AGENTS_FILE = 'AGENTS.md';
export const CLAUDE_FILE = 'CLAUDE.md';
/** Where GUIDE.md goes unless the repo says otherwise. */
export const DEFAULT_GUIDE = 'GUIDE.md';
/** How a repo keeps its agent files. `default`: real skill folders in `.claude/skills/`, linked from `.agents/skills/`.
 * `agent-sync` (A8): repo-kit's, real folders in `.agents/skills/`, and hooks only in `.agents/hooks.local.json`. */
export type AgentLayout = 'default' | 'agent-sync';
export const agentLayout = (project: string): AgentLayout => (usesAgentSync(project) ? 'agent-sync' : 'default');

/** The repo's AGENTS.md as `new` (or `update`, when it is missing) writes it (Q8): read the guide first; where the
 * skills are. */
export function agentsText(guide: string = DEFAULT_GUIDE, layout: AgentLayout = 'default'): string {
  const skills = layout === 'default'
    ? `- The skills are in \`.claude/skills/\`: \`wildshard\` (the loop, in order), \`wildshard-mockup-to-model\`,
  \`wildshard-goldens\` and \`wildshard-upgrade\`. \`.agents/skills/\` links to the same folders, for Codex.`
    : `- The skills are in \`.agents/skills/\`: \`wildshard\` (the loop, in order), \`wildshard-mockup-to-model\`,
  \`wildshard-goldens\` and \`wildshard-upgrade\`. \`pnpm agents:sync\` links them from \`.claude/skills/\`, for Claude Code.`;
  return `# AGENTS.md

This is a Wildshard shard repo: its shard source is at \`src/\`.

- Read \`${guide}\` first. It is the author's manual: the loop, the shard source layout, budgets, and every refusal
  with its fix.
${skills}
- \`wildshard update\` rewrites \`${guide}\` and those four skills from the installed sdk, so never edit them here.
  It leaves this file alone once you change it: add your own rules below.
`;
}
/** The repo's AGENTS.md as `new` writes it. */
export const AGENTS_TEXT: string = agentsText();
/** Claude Code reads CLAUDE.md; it imports AGENTS.md so both agents read one file. */
export const CLAUDE_TEXT = '@AGENTS.md\n';
/** Every AGENTS.md text an earlier sdk wrote. `update` replaces an untouched copy of one of these and leaves any other
 * text, which the author wrote. When AGENTS_TEXT changes, add the old text here. */
const PAST_AGENTS_TEXTS: readonly string[] = [];

/** What `syncAgentFiles` did to one file. `left` is a file the author changed, kept as it is. */
export type AgentFileAction = 'added' | 'updated' | 'unchanged' | 'left';
/** `note`: why a file was `left`, when it is not the author's edit (a hook file that is not valid JSON). */
export interface AgentFileChange { readonly file: string; readonly action: AgentFileAction; readonly note?: string }

/** Write `text` to `file` unless it already holds it; the sdk's files are always the sdk's. */
function writeOwned(project: string, file: string, text: Buffer): AgentFileAction {
  const path = resolve(project, file);
  if (!existsSync(path)) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); return 'added'; }
  if (readFileSync(path).equals(text)) return 'unchanged';
  writeFileSync(path, text);
  return 'updated';
}

/** Write `text` to `file` only when it is missing, or still one of the sdk's own `past` texts. */
function writeAuthored(project: string, file: string, text: string, past: readonly string[]): AgentFileAction {
  const path = resolve(project, file);
  if (!existsSync(path)) { writeFileSync(path, text); return 'added'; }
  const now = readFileSync(path, 'utf8');
  if (now === text) return 'unchanged';
  if (!past.includes(now)) return 'left';
  writeFileSync(path, text);
  return 'updated';
}

/** Link `.agents/skills/<name>` to the Claude Code skill folder, unless something of the author's is there. */
function writeLink(project: string, name: SkillName): AgentFileAction {
  const path = resolve(project, skillLink(name)), target = skillLinkTarget(name);
  let stat;
  try { stat = lstatSync(path); } catch { stat = undefined; }
  if (stat === undefined) { mkdirSync(dirname(path), { recursive: true }); symlinkSync(target, path, 'dir'); return 'added'; }
  return stat.isSymbolicLink() && readlinkSync(path) === target ? 'unchanged' : 'left';
}

/** `lstat`, or undefined when nothing is there. */
function lstatOf(path: string): ReturnType<typeof lstatSync> | undefined {
  try { return lstatSync(path); } catch { return undefined; }
}

/** A8: an agent-sync repo's skill, a real folder in `.agents/skills/<name>/`. A link there (the default layout's, from
 * before the repo took agent-sync) is left, with the move that fixes it; `.claude/skills/` is sync's and never touched. */
function writeAgentSkill(project: string, name: SkillName, text: Buffer): AgentFileChange {
  const file = agentSkillFile(name), folder = resolve(project, skillLink(name));
  if (lstatOf(folder)?.isSymbolicLink() === true) {
    const claude = `.claude/skills/${name}`;
    return { file, action: 'left', note: `${skillLink(name)} is a link to ${readlinkSync(folder)}, but agent-sync keeps skills as real folders there: rm ${skillLink(name)} && git mv ${claude} ${skillLink(name)}, then wildshard update and pnpm agents:sync` };
  }
  return { file, action: writeOwned(project, file, text) };
}

type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
/** The package.json field update reads the guide's path from: `"wildshard": { "guide": "docs/GUIDE.md" }`, beside the
 * migration stamp (migrations.ts STAMP_FIELD). */
const GUIDE_FIELD = 'wildshard';

/** A guide path as `--guide` takes it: relative, inside the repo, a `.md` file; returned in its plain posix form. */
export function guidePath(path: string): string {
  const plain = posix.normalize(path.replaceAll('\\', '/'));
  if (path === '' || isAbsolute(path) || plain.startsWith('../') || plain === '..' || !plain.endsWith('.md') || plain.endsWith('/.md')) throw new Error(`update: --guide ${path} must be a .md file inside the repo, as a relative path (docs/GUIDE.md)`);
  return plain;
}

/** The repo's guide path: package.json's `"wildshard": { "guide" }`, else GUIDE.md at the root. */
export function readGuide(project: string): string {
  const file = resolve(project, 'package.json');
  if (!existsSync(file)) return DEFAULT_GUIDE;
  let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(file, 'utf8')); } catch { return DEFAULT_GUIDE; }
  const field = isRecord(parsed) ? parsed[GUIDE_FIELD] : undefined, guide = isRecord(field) ? field['guide'] : undefined;
  if (guide === undefined) return DEFAULT_GUIDE;
  if (typeof guide !== 'string') throw new Error(`update: ${file}: "${GUIDE_FIELD}": { "guide": ... } must be a path, not ${JSON.stringify(guide)}`);
  return guidePath(guide);
}

/** Record `guide` in package.json (GUIDE.md, the default, drops the key); only that key changes, and the indent stays. */
function writeGuideField(project: string, guide: string): AgentFileAction {
  const file = resolve(project, 'package.json'), text = readFileSync(file, 'utf8'), parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed)) throw new Error(`update: ${file} is not a JSON object`);
  const field = parsed[GUIDE_FIELD];
  if (field !== undefined && !isRecord(field)) throw new Error(`update: ${file}: "${GUIDE_FIELD}" is not an object`);
  const { guide: was, ...rest } = field ?? {};
  if ((was ?? DEFAULT_GUIDE) === guide) return 'unchanged';
  const next = guide === DEFAULT_GUIDE ? rest : { ...rest, guide };
  if (Object.keys(next).length === 0) Reflect.deleteProperty(parsed, GUIDE_FIELD);
  else parsed[GUIDE_FIELD] = next;
  const indent = /^\{\r?\n([ \t]+)"/u.exec(text)?.[1] ?? 2;
  writeFileSync(file, `${JSON.stringify(parsed, null, indent)}${text.endsWith('\n') ? '\n' : ''}`);
  return 'updated';
}

/**
 * SA28: `new` and `update`. Rewrite the guide and the four skills from the sdk at `root` (the installed one), and write
 * the `.agents/skills` links, AGENTS.md and CLAUDE.md when missing. SDK 0.5.0 M5: and register the SessionStart
 * `wildshard status --brief` hook once (sessionHook.ts). Touches nothing else: a file whose bytes already match is not
 * rewritten, and an AGENTS.md, CLAUDE.md or link the author changed is left as it is. A8: the guide goes where
 * package.json says (readGuide); an agent-sync repo gets its skills as real folders in `.agents/skills/` and no links.
 */
export function syncAgentFiles(project: string, root: string = SDK_ROOT, pastAgentsTexts: readonly string[] = PAST_AGENTS_TEXTS): readonly AgentFileChange[] {
  const guide = readGuide(project), layout = agentLayout(project);
  const changes: AgentFileChange[] = [{ file: guide, action: writeOwned(project, guide, readFileSync(resolve(root, 'GUIDE.md'))) }];
  if (layout === 'agent-sync') for (const name of SKILLS) changes.push(writeAgentSkill(project, name, readFileSync(skillSource(name, root))));
  else {
    for (const name of SKILLS) changes.push({ file: skillFile(name), action: writeOwned(project, skillFile(name), readFileSync(skillSource(name, root))) });
    for (const name of SKILLS) changes.push({ file: skillLink(name), action: writeLink(project, name) });
  }
  // An untouched AGENTS.md this sdk wrote for the default guide, either layout, moves with them (update adds the text for
  // the guide's old path when --guide moves it).
  const agents = agentsText(guide, layout), past = [...pastAgentsTexts, AGENTS_TEXT, agentsText(DEFAULT_GUIDE, 'agent-sync')].filter(text => text !== agents);
  changes.push({ file: AGENTS_FILE, action: writeAuthored(project, AGENTS_FILE, agents, past) });
  changes.push({ file: CLAUDE_FILE, action: writeAuthored(project, CLAUDE_FILE, CLAUDE_TEXT, []) });
  changes.push(...syncSessionHook(project));
  return changes;
}

/** The sdk version at `root`, for update's first line. */
function sdkVersion(root: string): string {
  const parsed: unknown = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  return typeof parsed === 'object' && parsed !== null && 'version' in parsed && typeof parsed.version === 'string' ? parsed.version : 'unknown';
}

/** A shard repo is a folder whose package.json lists `@wildshard/sdk` (`new` writes it; a blender repo as a dev dependency)
 * or `@wildshard/sharddev`, the name the org's shard repos list it under (a GitHub pin, or an `npm:@wildshard/sdk` alias). */
export function assertShardRepo(project: string): void {
  const file = resolve(project, 'package.json');
  let parsed: unknown;
  try { parsed = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined; }
  catch (error) { throw new Error(`update: ${project} is not a shard repo: its package.json is not valid JSON (${error instanceof Error ? error.message : String(error)})`, { cause: error }); }
  const fields: unknown[] = typeof parsed === 'object' && parsed !== null
    ? [Reflect.get(parsed, 'dependencies'), Reflect.get(parsed, 'devDependencies')] : [];
  if (!fields.some(field => typeof field === 'object' && field !== null && (Object.hasOwn(field, '@wildshard/sdk') || Object.hasOwn(field, '@wildshard/sharddev')))) throw new Error(`update: ${project} is not a shard repo: its package.json does not list @wildshard/sdk or @wildshard/sharddev (or it has none)`);
}

/** What `updateShardRepo` takes besides the repo. `guide` (`--guide`): where GUIDE.md goes, recorded in package.json. */
export interface UpdateOptions { readonly guide?: string }

/** `wildshard update [dir] [--guide <path>]`: sync the agent files of the shard repo at `project`, and say what changed,
 * one line each. */
export function updateShardRepo(project: string, root: string = SDK_ROOT, options: UpdateOptions = {}): string[] {
  assertShardRepo(project);
  const moved: AgentFileChange[] = [], past = [...PAST_AGENTS_TEXTS];
  if (options.guide !== undefined) {
    const guide = guidePath(options.guide), was = readGuide(project);
    past.push(agentsText(was, agentLayout(project)));
    moved.push({ file: 'package.json', action: writeGuideField(project, guide) });
    // The copy at the old path is the sdk's; it is left for the author to delete, since git shows it.
    if (was !== guide && existsSync(resolve(project, was))) moved.push({ file: was, action: 'left', note: `the guide now lives at ${guide}: delete this copy` });
  }
  const changes = [...moved, ...syncAgentFiles(project, root, past)], guide = readGuide(project);
  const lines = [`wildshard update: ${guide} and the skills from @wildshard/sdk ${sdkVersion(root)}`];
  for (const { file, action, note } of changes) {
    if (action === 'left') lines.push(`  left ${file}: ${note ?? 'you changed it, so update kept yours'}`);
    else if (action !== 'unchanged') lines.push(`  ${action} ${file}${file === 'package.json' ? `: "wildshard": { "guide": "${guide}" }, so update, upgrade and migrate keep it there` : ''}`);
  }
  const touched = changes.filter(change => change.action === 'added' || change.action === 'updated');
  lines.push(touched.length === 0 ? '  already up to date' : `  ${String(touched.length)} file${touched.length === 1 ? '' : 's'} written; nothing else touched`);
  // agent-sync writes .claude/settings.json, .codex/hooks.json and the .claude/skills links; until it runs, a new hook
  // is only in the spec and a new skill has no Claude Code link (and agent-sync --check says so).
  const hook = touched.some(change => change.file === AGENT_SYNC_LOCAL_SPEC);
  const skills = touched.some(change => change.action === 'added' && change.file.startsWith('.agents/skills/'));
  if (hook || skills) {
    const what = [hook ? `${AGENT_SYNC_LOCAL_SPEC} has the SessionStart hook, and sync writes it into .claude/settings.json and .codex/hooks.json` : '', skills ? 'sync links the new .agents/skills folders from .claude/skills' : ''].filter(Boolean);
    lines.push(`  run pnpm agents:sync: ${what.join('; ')}`);
  }
  return lines;
}
