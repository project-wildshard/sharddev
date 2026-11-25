// SDK 0.6.0 (plan opus-2026-11-24-sdk-migrate-static F3, ask A7): build-shards refuses a map input that names no file.
// A map's settings (`<source>/data/map.json`, else `<source>/look/map.json`) list its "inputs": the files and folders
// whose bytes its tilesHash covers. The hash skips an input that names nothing, so a typo or a moved path (Sky Reach's
// `../../../public/…` after the 0.5.0 move) built a map that ignored it without a word. 0.6.0 refuses it, naming it.
// - `wildshard migrate` and `upgrade` drop each input that names no file or folder. The map was already baked without
//   it, so the map reads the same bytes; map.json's own bytes change, so its tilesHash moves (a manual line says so).
// - An input it cannot drop safely (map.json's `from` names it, or the edit does not parse back) is a manual step.
/* oxlint-disable node/no-sync, import/no-nodejs-modules -- A codemod is a one-shot synchronous edit of the shard repo on disk. */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

export const title = 'A map input must name a file: build-shards refuses one that names nothing';
export const guide = 'migrate-0-6-0';

const posix = path => path.split(sep).join('/');

/** Each shard source's map settings (data/map.json wins over look/map.json, as the map hash reads them). */
function mapSettings(root) {
  const sources = [join(root, 'src')];
  const shards = join(root, 'src/shards');
  if (existsSync(shards)) for (const entry of readdirSync(shards, { withFileTypes: true })) if (entry.isDirectory()) sources.push(join(shards, entry.name));
  return sources.flatMap(source => {
    const file = ['data/map.json', 'look/map.json'].map(name => join(source, name)).find(path => existsSync(path));
    if (file === undefined) return [];
    let parsed;
    try { parsed = JSON.parse(readFileSync(file, 'utf8')); } catch { return []; }
    if (!Array.isArray(parsed?.inputs)) return [];
    const missing = parsed.inputs.filter(input => typeof input === 'string' && !existsSync(resolve(source, input)));
    return missing.length === 0 ? [] : [{ file, rel: posix(relative(root, file)), parsed, missing }];
  });
}

/** Why the repo is not migrated: a map input that names no file. */
export function pending({ project }) {
  const found = mapSettings(resolve(project));
  if (found.length === 0) return undefined;
  return `${found.map(row => `${row.rel} lists ${row.missing.join(', ')}`).join('; ')}, which name no file; sdk 0.6.0 refuses a map input that names nothing`;
}

/** `text` without the array element `input` inside its `"inputs": [...]`, or undefined when that is not one clean cut. */
function dropInput(text, input) {
  const quoted = JSON.stringify(input).replaceAll(/[.*+?^${}()|[\]\\/]/gu, '\\$&');
  const key = /"inputs"\s*:\s*\[/u.exec(text);
  if (key === null) return undefined;
  const start = key.index + key[0].length, end = text.indexOf(']', start);
  if (end < 0) return undefined;
  const span = text.slice(start, end);
  // The element and the comma after it (with its line, when it has one), else the comma before it (the last element).
  const before = span.replace(new RegExp(`(?:\\n[ \\t]*)?${quoted}\\s*,[ \\t]*`, 'u'), '');
  const cut = before !== span ? before : span.replace(new RegExp(`\\s*,\\s*${quoted}`, 'u'), '');
  return cut === span ? undefined : `${text.slice(0, start)}${cut}${text.slice(end)}`;
}

// oxlint-disable-next-line import/no-default-export -- migrate and upgrade load release codemods by their default export.
export default function codemod({ project }) {
  const lines = [], manual = [];
  for (const { file, rel, parsed, missing } of mapSettings(resolve(project))) {
    let text = readFileSync(file, 'utf8');
    const dropped = [];
    for (const input of missing) {
      if (parsed.from === input) { manual.push(`${rel}: "from" names map input ${input}, which names no file; point both at the world GLB`); continue; }
      const next = dropInput(text, input);
      let inputs;
      try { inputs = next === undefined ? undefined : JSON.parse(next).inputs; } catch { inputs = undefined; }
      if (!Array.isArray(inputs) || inputs.includes(input)) { manual.push(`${rel}: map input ${input} names no file; point it at its file or drop it`); continue; }
      text = next;
      dropped.push(input);
    }
    if (dropped.length === 0) continue;
    writeFileSync(file, text);
    lines.push(`${rel}: dropped map input(s) naming no file: ${dropped.join(', ')}`);
    manual.push(`${rel}: its bytes changed, so the map's tilesHash moves; build-shards names a stale baked map: rebake it (GUIDE migrate-0-6-0)`);
  }
  return { lines, manual };
}
