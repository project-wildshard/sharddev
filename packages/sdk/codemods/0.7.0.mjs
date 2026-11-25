// SDK 0.7.0 (meta QA 11-25 rows 69 and 70): Node 26. The SDK's engine is strip-only from here, so a shard repo moves its
// Node cap from <25 to <27 and stops passing --experimental-transform-types, which Node 26 refuses. The internal
// re-export `@wildshard/sdk/internal/engine/game/looks/speciesBook` left with the engine's packed species catalogue (FP20).
// - `wildshard migrate` and `upgrade` move package.json's engines.node `<25` to `<27` and drop the flag from its scripts.
// - Any other file that passes the flag (workflow, script, test) or imports the removed re-export is a manual step.
/* oxlint-disable node/no-sync, import/no-nodejs-modules -- A codemod is a one-shot synchronous edit of the shard repo on disk. */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

export const title = 'Node 26: engines.node moves to <27 and --experimental-transform-types goes';
export const guide = 'migrate-0-7-0';

const FLAG = '--experimental-transform-types';
const GONE = '@wildshard/sdk/internal/engine/game/looks/speciesBook';
const SKIP = new Set(['node_modules', '.git', 'tmp', 'out', 'dist', 'project', '.worktrees']);
const TEXT = /\.(?:[cm]?[jt]s|tsx|json|ya?ml|sh|py)$/u;
const posix = path => path.split(sep).join('/');

/** Every text file under the repo a shard's tooling runs, minus history and outputs. */
function files(root, dir = root, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files(root, path, out);
    else if (entry.isFile() && TEXT.test(entry.name) && statSync(path).size < 2_000_000) out.push(path);
  }
  return out;
}

function manifest(root) {
  const file = join(root, 'package.json');
  if (!existsSync(file)) return undefined;
  const text = readFileSync(file, 'utf8');
  return { file, text, parsed: JSON.parse(text) };
}

/** Why the repo is not migrated: a Node cap below 26, or the flag in its package.json scripts. */
export function pending({ project }) {
  const found = manifest(resolve(project));
  if (found === undefined) return undefined;
  const reasons = [];
  const range = found.parsed?.engines?.node;
  if (typeof range === 'string' && /<\s*25\b/u.test(range)) reasons.push(`package.json engines.node "${range}" caps Node below 26`);
  const scripts = Object.entries(found.parsed?.scripts ?? {}).filter(([, line]) => typeof line === 'string' && line.includes(FLAG)).map(([name]) => name);
  if (scripts.length > 0) reasons.push(`package.json scripts ${scripts.join(', ')} pass ${FLAG}, which Node 26 refuses`);
  return reasons.length === 0 ? undefined : `${reasons.join('; ')}; sdk 0.7.0 runs on Node 26`;
}

// oxlint-disable-next-line import/no-default-export -- migrate and upgrade load release codemods by their default export.
export default function codemod({ project }) {
  const root = resolve(project), lines = [], manual = [];
  const found = manifest(root);
  if (found !== undefined) {
    let text = found.text;
    const range = found.parsed?.engines?.node;
    if (typeof range === 'string' && /<\s*25\b/u.test(range)) {
      const next = text.replace(/("node"\s*:\s*"[^"]*)<\s*25\b/u, '$1<27');
      if (next !== text) { text = next; lines.push(`package.json: engines.node now caps Node below 27`); }
      else manual.push(`package.json: engines.node "${range}": move its cap to <27 by hand`);
    }
    const flagged = text.split('\n').map(line => (line.includes(FLAG) ? line.replaceAll(` ${FLAG}`, '').replaceAll(`${FLAG} `, '') : line)).join('\n');
    if (flagged !== text) { text = flagged; lines.push(`package.json: scripts stop passing ${FLAG}`); }
    if (text !== found.text) writeFileSync(found.file, text);
  }
  for (const file of files(root)) {
    const rel = posix(relative(root, file));
    if (rel === 'package.json') continue;
    const text = readFileSync(file, 'utf8');
    if (text.includes(FLAG)) manual.push(`${rel}: passes ${FLAG}, which Node 26 refuses: drop it (GUIDE migrate-0-7-0)`);
    if (text.includes(GONE)) manual.push(`${rel}: imports ${GONE}, which 0.7.0 removed with the engine's packed species catalogue`);
  }
  return { lines, manual };
}
