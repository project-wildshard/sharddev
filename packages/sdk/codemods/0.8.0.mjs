// SDK 0.8.0 (meta QA 11-25 row 139): the SDK repins to engine 0.1.96, which deleted `legacySlot` from its melee profile
// (FORMAT-PRUNE FP22e; shard-format already deleted `items.legacySlot`). Kit's `MeleeProfile` follows: the
// `legacySlot` field and its `Slot` type parameter go, so `MeleeProfile<Icon, Slot, Touch>` is `MeleeProfile<Icon, Touch>`.
// A weapon plays as its declared item id (`declared.<item id>`), never a closed engine slot name.
// - `wildshard migrate` and `upgrade` drop each `legacySlot: '<name>',` line from code that imports @wildshard, and
//   rewrite a one-line `MeleeProfile<A, B, C>` to `MeleeProfile<A, C>` in code that imports kit's melee profile.
// - Any other mention of `legacySlot` (a read, a Pick, a JSON row) is a manual step naming its file and line.
/* oxlint-disable node/no-sync, import/no-nodejs-modules -- A codemod is a one-shot synchronous edit of the shard repo on disk. */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

export const title = 'Kit MeleeProfile drops legacySlot and its Slot type parameter (engine 0.1.96)';
export const guide = 'migrate-0-8-0';

const SKIP = new Set(['node_modules', '.git', 'tmp', 'out', 'dist', 'project', '.worktrees']);
const CODE = /\.(?:[cm]?[jt]s|tsx)$/u;
const TEXT = /\.(?:[cm]?[jt]s|tsx|json)$/u;
const WILDSHARD = /from\s+['"]@wildshard\//u;
const KIT_MELEE = /['"]@wildshard\/(?:kit|sdk)\/[^'"]*meleeProfile(?:\.ts)?['"]/u;
// A whole line that sets legacySlot to a string literal: `legacySlot: 'sword',`.
const SLOT_LINE = /^[ \t]*legacySlot[ \t]*:[ \t]*(['"`])[^'"`\n]*\1[ \t]*,?[ \t]*\r?\n/gmu;
// A flat three-argument MeleeProfile type on one line: no nested generics, so the middle argument is the Slot.
const THREE = /\bMeleeProfile<([^<>,\n]+),([^<>,\n]+),([^<>,\n]+)>/gu;
const posix = path => path.split(sep).join('/');

/** Every code or JSON file under the repo a shard's tooling reads, minus history and outputs. */
function files(root, dir = root, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files(root, path, out);
    else if (entry.isFile() && TEXT.test(entry.name) && statSync(path).size < 2_000_000) out.push(path);
  }
  return out;
}

/** The file's text with every safe edit made, and what each edit did. */
function rewrite(path, text) {
  if (!CODE.test(path)) return { text, edits: [] };
  let next = text;
  const edits = [];
  if (WILDSHARD.test(next)) {
    const dropped = next.match(SLOT_LINE)?.length ?? 0;
    if (dropped > 0) { next = next.replaceAll(SLOT_LINE, ''); edits.push(`drops ${dropped} legacySlot line${dropped === 1 ? '' : 's'}`); }
  }
  if (KIT_MELEE.test(next)) {
    const typed = next.match(THREE)?.length ?? 0;
    if (typed > 0) { next = next.replaceAll(THREE, 'MeleeProfile<$1,$3>'); edits.push(`MeleeProfile drops its Slot type argument (${typed})`); }
  }
  return { text: next, edits };
}

/** Why the repo is not migrated: code this migration edits still sets legacySlot or passes MeleeProfile a Slot. */
export function pending({ project }) {
  const root = resolve(project), found = [];
  for (const file of files(root)) if (rewrite(file, readFileSync(file, 'utf8')).edits.length > 0) found.push(posix(relative(root, file)));
  return found.length === 0 ? undefined : `${found.join(', ')} still set legacySlot or pass MeleeProfile a Slot; sdk 0.8.0's MeleeProfile has neither`;
}

// oxlint-disable-next-line import/no-default-export -- migrate and upgrade load release codemods by their default export.
export default function codemod({ project }) {
  const root = resolve(project), lines = [], manual = [];
  for (const file of files(root)) {
    const rel = posix(relative(root, file)), before = readFileSync(file, 'utf8');
    const { text, edits } = rewrite(file, before);
    if (text !== before) { writeFileSync(file, text); lines.push(`${rel}: ${edits.join('; ')}`); }
    text.split('\n').forEach((line, index) => {
      if (line.includes('legacySlot')) manual.push(`${rel}:${index + 1}: names legacySlot, which 0.8.0 removed: a weapon plays as its declared item id (GUIDE migrate-0-8-0)`);
    });
  }
  return { lines, manual };
}
