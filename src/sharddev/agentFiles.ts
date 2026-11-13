// oxlint-disable-next-line import/no-nodejs-modules -- `new` and `update` own only a shard repo's agent files.
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, symlinkSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve files beneath the shard repo and the installed sdk.
import { dirname, resolve } from 'node:path';

// SHARD-AUTHORING SA28 (J314 Q7, Q8, Q27): the agent files of a shard repo. `new` and `update` both run
// `syncAgentFiles`: GUIDE.md and the four skills are the sdk's and are rewritten from the installed sdk; the
// `.agents/skills` links, AGENTS.md and CLAUDE.md are written when missing and otherwise left as the author keeps them.

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
/** The core `wildshard` skill (SA14). */
export const SKILL_SOURCE: string = skillSource('wildshard');
export const SKILL_FILE: string = skillFile('wildshard');

export const AGENTS_FILE = 'AGENTS.md';
export const CLAUDE_FILE = 'CLAUDE.md';
/** The repo's AGENTS.md as `new` writes it (Q8): read the guide first; the skills are in `.claude/skills/`. */
export const AGENTS_TEXT = `# AGENTS.md

This is a Wildshard shard repo: its shard source is at \`src/\`.

- Read \`GUIDE.md\` first. It is the author's manual: the loop, the shard source layout, budgets, and every refusal
  with its fix.
- The skills are in \`.claude/skills/\`: \`wildshard\` (the loop, in order), \`wildshard-mockup-to-model\`,
  \`wildshard-goldens\` and \`wildshard-upgrade\`. \`.agents/skills/\` links to the same folders, for Codex.
- \`wildshard update\` rewrites \`GUIDE.md\` and those four skills from the installed sdk, so never edit them here.
  It leaves this file alone once you change it: add your own rules below.
`;
/** Claude Code reads CLAUDE.md; it imports AGENTS.md so both agents read one file. */
export const CLAUDE_TEXT = '@AGENTS.md\n';
/** Every AGENTS.md text an earlier sdk wrote. `update` replaces an untouched copy of one of these and leaves any other
 * text, which the author wrote. When AGENTS_TEXT changes, add the old text here. */
const PAST_AGENTS_TEXTS: readonly string[] = [];

/** What `syncAgentFiles` did to one file. `left` is a file the author changed, kept as it is. */
export type AgentFileAction = 'added' | 'updated' | 'unchanged' | 'left';
export interface AgentFileChange { readonly file: string; readonly action: AgentFileAction }

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

/**
 * SA28: `new` and `update`. Rewrite GUIDE.md and the four skills from the sdk at `root` (the installed one), and write
 * the `.agents/skills` links, AGENTS.md and CLAUDE.md when missing. Touches nothing else: a file whose bytes already
 * match is not rewritten, and an AGENTS.md, CLAUDE.md or link the author changed is left as it is.
 */
export function syncAgentFiles(project: string, root: string = SDK_ROOT, pastAgentsTexts: readonly string[] = PAST_AGENTS_TEXTS): readonly AgentFileChange[] {
  const changes: AgentFileChange[] = [{ file: 'GUIDE.md', action: writeOwned(project, 'GUIDE.md', readFileSync(resolve(root, 'GUIDE.md'))) }];
  for (const name of SKILLS) changes.push({ file: skillFile(name), action: writeOwned(project, skillFile(name), readFileSync(skillSource(name, root))) });
  for (const name of SKILLS) changes.push({ file: skillLink(name), action: writeLink(project, name) });
  changes.push({ file: AGENTS_FILE, action: writeAuthored(project, AGENTS_FILE, AGENTS_TEXT, pastAgentsTexts) });
  changes.push({ file: CLAUDE_FILE, action: writeAuthored(project, CLAUDE_FILE, CLAUDE_TEXT, []) });
  return changes;
}

/** The sdk version at `root`, for update's first line. */
function sdkVersion(root: string): string {
  const parsed: unknown = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  return typeof parsed === 'object' && parsed !== null && 'version' in parsed && typeof parsed.version === 'string' ? parsed.version : 'unknown';
}

/** A shard repo is a folder whose package.json lists `@wildshard/sdk` (`new` writes it; a blender repo as a dev dependency). */
function assertShardRepo(project: string): void {
  const file = resolve(project, 'package.json');
  let parsed: unknown;
  try { parsed = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined; }
  catch (error) { throw new Error(`update: ${project} is not a shard repo: its package.json is not valid JSON (${error instanceof Error ? error.message : String(error)})`, { cause: error }); }
  const fields: unknown[] = typeof parsed === 'object' && parsed !== null
    ? [Reflect.get(parsed, 'dependencies'), Reflect.get(parsed, 'devDependencies')] : [];
  if (!fields.some(field => typeof field === 'object' && field !== null && Object.hasOwn(field, '@wildshard/sdk'))) throw new Error(`update: ${project} is not a shard repo: its package.json does not list @wildshard/sdk (or it has none)`);
}

/** `wildshard update [dir]`: sync the agent files of the shard repo at `project`, and say what changed, one line each. */
export function updateShardRepo(project: string, root: string = SDK_ROOT): string[] {
  assertShardRepo(project);
  const changes = syncAgentFiles(project, root);
  const lines = [`wildshard update: GUIDE.md and the skills from @wildshard/sdk ${sdkVersion(root)}`];
  for (const { file, action } of changes) {
    if (action === 'left') lines.push(`  left ${file}: you changed it, so update kept yours`);
    else if (action !== 'unchanged') lines.push(`  ${action} ${file}`);
  }
  const touched = changes.filter(change => change.action === 'added' || change.action === 'updated').length;
  lines.push(touched === 0 ? '  already up to date' : `  ${String(touched)} file${touched === 1 ? '' : 's'} written; nothing else touched`);
  return lines;
}
