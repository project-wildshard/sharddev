#!/usr/bin/env node
// E362 AG22: docs/SHARDS.md §2's tables (required files, allowed files, folders) are generated from
// lint/shard-layout.json — the rules scripts/check-shards.mjs enforces — so the how-to never drifts from the validator.
//   node scripts/gen-shard-layout-doc.mjs           rewrite the generated block
//   node scripts/gen-shard-layout-doc.mjs --check   fail when it is stale or an entry has no description
// A tree without docs/ (the Vercel tree) has nothing to check.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');
const OPEN = '<!-- generated:shard-layout (node scripts/gen-shard-layout-doc.mjs, from lint/shard-layout.json) -->';
const CLOSE = '<!-- /generated:shard-layout -->';

/** the block for a layout: three tables, every entry with its description; throws when one has none */
export function layoutBlock(layout) {
  const describe = layout.describe ?? {};
  const row = (name) => {
    const text = describe[name];
    if (typeof text !== 'string' || text.trim() === '') throw new Error(`lint/shard-layout.json: ${name} has no description (describe["${name}"])`);
    return `| \`${name}\` | ${text} |`;
  };
  const source = layout.sourceLayout;
  return [OPEN, '**Primary shard source layout**', '',
    'All source is build-time or erased declarations. Shipped behaviour is admitted WASM and data; primary shards have no runtime TypeScript.', '',
    '| Required file | What it holds |', '|---|---|', ...source.requiredFiles.map(row), '',
    '| Allowed file | What it holds |', '|---|---|', ...source.allowedFiles.map(row), '',
    '| Folder | What goes in it |', '|---|---|', ...source.folders.map(folder => row(`${folder}/`)), '',
    'Root erased `*.d.ts` / `*.d.json.ts` contracts and explicitly declared product discovery outputs are also admitted.', '',
    'Frozen legacy files keep their exact registered layout (**held for LD**). A `-legacy` suffix is not an exemption; the LEGACY entry and Developer buttons stay unchanged.', CLOSE].join('\n');
}

/** the doc with its block regenerated */
export function withLayout(doc, layout) {
  const s = doc.indexOf(OPEN), e = doc.indexOf(CLOSE);
  if (s === -1 || e === -1) throw new Error('docs/SHARDS.md: the generated:shard-layout markers are missing');
  return doc.slice(0, s) + layoutBlock(layout) + doc.slice(e + CLOSE.length);
}

function main(check) {
  const docPath = resolve(ROOT, 'docs/SHARDS.md');
  if (!existsSync(docPath)) return 0;
  const layout = JSON.parse(readFileSync(resolve(ROOT, 'lint/shard-layout.json'), 'utf8'));
  const doc = readFileSync(docPath, 'utf8'), next = withLayout(doc, layout);
  if (check) {
    if (next !== doc) { console.error('docs/SHARDS.md §2 is stale: run node scripts/gen-shard-layout-doc.mjs'); return 1; }
    return 0;
  }
  if (next !== doc) writeFileSync(docPath, next);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.exitCode = main(process.argv.includes('--check')); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
