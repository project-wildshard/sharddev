// SDK 0.5.0 B1 (ask A7, plan opus-2026-11-24-sdk-migrate-static): a shard repo's `public/` moves into its source's
// `static/`. sdk 0.5.0 reads every file a shard mounts as `/<path>` from `<source>/static/<path>` (`shardStaticRoot`), where
// `<source>` is `src/` (single-shard repo) or `src/shards/<slug>/` (multi-shard). `wildshard migrate` and `upgrade` run it.
// It moves files and renames nothing a shard names, so every product's files are byte-identical.
// - `<source>/assets/public/` → `<source>/static/assets/<slug>/`, the slug `scripts/publish-public.mjs` copied it to (else
//   the source's identity slug).
// - Each committed file `public/<path>` → `<source>/static/<path>` (git sees a rename, so history follows). A repo with
//   several sources and committed `public/` files is refused: nothing says which source owns them.
// - Ignored files under `public/` are build output or publish-public's copies: they go, after each copy is checked
//   byte-identical to its source (a changed copy is refused, so no edit is lost). `public/` goes once it is empty.
// - `scripts/publish-public.mjs` goes, with its `node scripts/publish-public.mjs && ` script prefix; the lint scripts'
//   `--ignore-pattern 'public/**'`, the `public/` lines in `.gitignore` (and `out/` is ignored) and `public/|` in
//   `ci.yml`'s watched paths go too; a `.gitattributes` row for `public/` names the source's `static/`.
// - A map input (`data/map.json`, `look/map.json`) naming a moved file follows it; one naming a path that never existed
//   in the repo stays byte-for-byte (the map hash covers map.json's bytes and each input's path).
// - What it cannot edit safely (scripts, tests, workflows outside `src/` that still name `public/…`) comes back as manual
//   steps. It plans every move before it touches anything, so a refusal leaves the repo as it was.
/* oxlint-disable node/no-sync, import/no-nodejs-modules -- A codemod is a one-shot synchronous edit of the shard repo on disk. */
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

export const title = 'Shard assets move from public/ into src/static/';
export const guide = 'migrate-0-5-0';

const PUBLISH = 'scripts/publish-public.mjs';
const MARKERS = ['public/assets', 'public/programs', PUBLISH];
const posix = path => path.split(sep).join('/');

/** Why the repo is still in the old layout: a `public/assets/`, `public/programs/` or publish-public script. */
export function pending({ project }) {
  const root = resolve(project), found = MARKERS.filter(path => existsSync(join(root, path)));
  if (found.length === 0) return undefined;
  return `${found.join(', ')} still ${found.length === 1 ? 'exists' : 'exist'}; sdk 0.5.0 reads a shard's files from its source's static/ (src/static/ or src/shards/<slug>/static/)`;
}

function git(root, args, input) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 30, ...(input === undefined ? { stdio: ['ignore', 'pipe', 'pipe'] } : { input }) });
  } catch (error) {
    const said = error instanceof Error && 'stderr' in error ? String(error.stderr).trim() : String(error);
    throw new Error(`git ${args.slice(0, 2).join(' ')} failed in ${root}: ${said}`, { cause: error });
  }
}
const listed = (root, args) => git(root, ['ls-files', '-z', ...args]).split('\0').filter(Boolean);
/** Paths to git on stdin (one call for thousands of files). */
const gitPaths = (root, args, paths) => { if (paths.length > 0) git(root, [...args, '--pathspec-from-file=-', '--pathspec-file-nul'], `${paths.join('\0')}\0`); };

const readJson = file => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return undefined; } };
const slugIn = value => typeof value === 'object' && value !== null && typeof value.slug === 'string' ? value.slug : undefined;

/** A source's own slug, as `shardFolderName` reads it: a hand-written `shard.json`'s identity, the card, `identity.json`. */
function identitySlug(root, dir) {
  const index = readJson(join(dir, 'shard.json'));
  return slugIn(index?.identity) ?? slugIn(readJson(join(dir, 'manifest.json'))) ?? slugIn(readJson(join(dir, 'data/card.json')))
    ?? slugIn(readJson(join(dir, 'identity.json'))) ?? root.split(sep).at(-1);
}

/** The repo's shard sources, as the sdk finds them: `src/` (with `shard.config.ts`, or a hand-written `shard.json`), else
 * each `src/shards/<slug>/` with a `shard.config.ts`. */
function shardSources(root) {
  const src = join(root, 'src');
  if (existsSync(join(src, 'shard.config.ts')) || existsSync(join(src, 'shard.json'))) return [{ rel: 'src', dir: src, slug: identitySlug(root, src) }];
  const shards = join(src, 'shards');
  if (!existsSync(shards)) return [];
  return readdirSync(shards, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && existsSync(join(shards, entry.name, 'shard.config.ts')))
    .map(entry => ({ rel: `src/shards/${entry.name}`, dir: join(shards, entry.name), slug: entry.name }));
}

/** What `scripts/publish-public.mjs` copied: `{ tree, target }` per slug it lists (repo-relative), or undefined when it is
 * not the script `new` wrote (`for (const slug of [...]) { const tree = ...; cpSync(tree, ...) }`). */
function publishCopies(text) {
  const loop = /for\s*\(\s*const\s+(\w+)\s+of\s+\[([^\]]*)\]/u.exec(text);
  const tree = /const\s+tree\s*=\s*(`[^`]*`|"[^"]*"|'[^']*')/u.exec(text);
  const target = /cpSync\(\s*tree\s*,\s*(`[^`]*`|"[^"]*"|'[^']*')/u.exec(text);
  if (loop === null || tree === null || target === null) return undefined;
  const fill = (literal, slug) => literal.slice(1, -1).replaceAll(`\${${loop[1]}}`, slug).replace(/\/+$/u, '');
  const slugs = [...loop[2].matchAll(/(["'])([^"']+)\1/gu)].map(match => match[2]);
  return slugs.map(slug => ({ tree: fill(tree[1], slug), target: fill(target[1], slug) }));
}

const sameBytes = (a, b) => readFileSync(a).equals(readFileSync(b));
const under = (path, folder) => path === folder || path.startsWith(`${folder}/`);
const listOf = (paths, most = 8) => paths.slice(0, most).join(', ') + (paths.length > most ? ` and ${String(paths.length - most)} more` : '');

/** The `"from": "<input>"` key of a map.json (it must name one of its inputs). */
const fromKey = input => new RegExp(`("from"\\s*:\\s*)${JSON.stringify(input).replaceAll(/[.*+?^${}()|[\]\\/]/gu, '\\$&')}`, 'u');

/** The span of the `"inputs": [...]` array in a JSON text, or undefined. */
function inputsSpan(text) {
  const key = /"inputs"\s*:\s*\[/u.exec(text);
  if (key === null) return undefined;
  let depth = 0, quoted = false;
  for (let at = key.index + key[0].length - 1; at < text.length; at += 1) {
    const char = text[at];
    if (quoted) { if (char === '\\') at += 1; else if (char === '"') quoted = false; continue; }
    if (char === '"') quoted = true;
    else if (char === '[') depth += 1;
    else if (char === ']' && (depth -= 1) === 0) return { start: key.index, end: at + 1 };
  }
  return undefined;
}

// Text outside the sources that may still name the old layout. Each pattern matches a whole path token; `now` says
// what that path is after the move (`home`: the one source's folder; `trees`: each source's assets/public and slug).
const TOKEN = String.raw`[\w./*$\{\}<>-]*`;
// Where a repo path starts: not inside a longer path, or after `../` steps, or after `${x}/` / `{x}/` (sdk-migrate F2).
const AFTER = String.raw`(?:(?<![\w/.-])|(?<=(?:^|[^\w.])(?:\.\.?\/)+)|(?<=\}\/))`;
const STALE = [
  { pattern: new RegExp(`${TOKEN}publish-public${TOKEN}`, 'u'), now: () => 'publish-public.mjs is gone (sdk 0.5.0 reads <source>/static/); drop this step' },
  { pattern: new RegExp(`${TOKEN}public/shardfiles${TOKEN}`, 'u'), now: () => 'build output is out/<slug> now; point it there' },
  { pattern: new RegExp(String.raw`${TOKEN}assets/public\b${TOKEN}`, 'u'), now: (token, { trees }) => {
    const tree = trees.find(row => token.startsWith(row.tree));
    return tree === undefined ? 'that folder is <source>/static/assets/<slug>/ now; point it there'
      : `now ${tree.source.rel}/static/assets/${tree.slug}${token.slice(tree.tree.length)}; point it there, or drop a check of the old copy`;
  } },
  // Only a path this repo's public/ held: `resolve(engine, 'public/assets/physics/rapier.wasm')` is the engine's. After
  // `../` steps too: a generator's `'../../../public/assets/x.glb'` (sdk-migrate F2, the R3 roll).
  { pattern: new RegExp(String.raw`${AFTER}public/(?:assets|programs)\b${TOKEN}`, 'u'), held: true, now: (token, { home }) => `now ${home}/static/${token.slice('public/'.length)}; point it there, or drop a check of the old copy` },
  { pattern: /(?<![\w/.-])public\/\*\*/u, now: (_, { home }) => `public/ is gone; drop it, or name ${home}/static/**` },
  // sdk-migrate F2 (t16 and the R3 roll): the folder read through a template, as a bare path segment, by its length, or
  // stripped by a regex: `public${url}`, `resolve(root, 'public', url)`, `path.slice('public'.length)`, `/^public\//`.
  { pattern: new RegExp(String.raw`${AFTER}public\$\{[^}]*\}`, 'u'), now: (_, { home }) => `reads ${home}/static now; point it there` },
  // Driftwood 479efa4: a check that pins the sdk at 0.4.x (`/0\.4\.\d+/`) refuses 0.5.
  { pattern: /0\\\.4\\\.\\d\+/u, now: () => 'pins the sdk at 0.4.x; take any exact version' },
  { pattern: /(['"`])public\1(?=\.length|\s*[,)\]])/u, now: (_, { home }) => `the folder is ${home}/static now (src/ already lists it); point it there, or drop it` },
  { pattern: /\^public\\\//u, now: (_, { home }) => `the folder is ${home}/static now; match that` },
  // An ignore or watch list naming the folder itself (`.oxlintrc.author.json`: `"ignorePatterns": [..., "public/"]`).
  { pattern: /(['"`])public\/\1/u, now: (_, { home }) => `public/ is gone; drop it, or name ${home}/static/` },
];
const SCAN_SKIP = new Set(['out', 'node_modules', '.git', '.worktrees', 'tmp', 'project', 'public', 'dist', '.cache']);
// GUIDE.md and the skills are stamped from the sdk and repo-kit (the sdk's describe this very move); plans and changelogs
// are history.
const NOT_SCANNED = /^(?:src\/(?:.*\/)?(?:static|out)\/.*|(?:src\/)?(?:scripts|test)\/\.kit\/.*|kit\/.*|GUIDE\.md|\.(?:claude|agents)\/skills\/.*|docs\/plans\/.*|CHANGELOG[^/]*)$/u;
/** A file with more hits than this is one manual step: a target list naming a hundred models is one edit. */
const PER_FILE = 3;

/** Each line outside the sources that still names the old layout: `<file>:<line>: names <what>: <what to do>`. */
function staleReferences(root, context) {
  const steps = [];
  for (const file of listed(root, ['--cached'])) {
    if (SCAN_SKIP.has(file.split('/')[0]) || NOT_SCANNED.test(file) || !existsSync(join(root, file))) continue;
    const stat = lstatSync(join(root, file));
    if (!stat.isFile() || stat.size > 4_000_000) continue;
    const bytes = readFileSync(join(root, file));
    if (bytes.includes(0)) continue;
    const hits = [];
    // An assetGlobs list names mounted files, which keep their names: blank it (line breaks kept) before the scan.
    const text = bytes.toString('utf8').replaceAll(/"?assetGlobs"?\s*:\s*\[[^\]]*\]/gu, span => span.replaceAll(/[^\n]/gu, ' '));
    text.split('\n').forEach((line, index) => {
      for (const { pattern, held, now } of STALE) {
        const token = pattern.exec(line)?.[0];
        if (token === undefined) continue;
        const literal = token.split(/[$<*{]/u)[0].replace(/\/+$/u, '').replace(/^(?:\.\.?\/)+/u, '');
        // Held: the repo's public/ had it, or had its `public/assets/<folder>/` (a build output it ignores, as a test
        // pin or a map's scene pool names it: sdk-migrate F2); the engine's `public/assets/physics/` never was.
        const parts = literal.split('/'), folder = `${parts.slice(0, 4).join('/')}/`;
        const copied = context.trees.some(row => literal === row.target || literal.startsWith(`${row.target}/`));
        if (held === true && !copied && !context.before.some(path => path.startsWith(literal) || (parts.length > 4 && path.startsWith(folder)))) continue;
        hits.push(`${file}:${String(index + 1)}: names ${token.length > 70 ? `${token.slice(0, 70)}…` : token}: ${now(token, context)}`);
        break;
      }
    });
    if (hits.length <= PER_FILE) steps.push(...hits);
    else steps.push(`${hits[0]} (and ${String(hits.length - 1)} more lines in this file)`);
  }
  return steps;
}

/** Remove the empty folders under `dir` (and `dir`, when it ends up empty). */
function pruneEmpty(dir) {
  if (!existsSync(dir) || !lstatSync(dir).isDirectory()) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) if (entry.isDirectory()) pruneEmpty(join(dir, entry.name));
  if (readdirSync(dir).length === 0) rmdirSync(dir);
}

/** Edit `file` (repo-relative) with `edit`, when it exists; true when it changed. */
function editText(root, file, edit) {
  const path = join(root, file);
  if (!existsSync(path)) return false;
  const before = readFileSync(path, 'utf8'), after = edit(before);
  if (after === before) return false;
  writeFileSync(path, after);
  return true;
}

// oxlint-disable-next-line import/no-default-export -- migrate and upgrade load release codemods by their default export.
export default function codemod({ project }) {
  const root = resolve(project), lines = [], manual = [];
  const fired = pending({ project: root }) !== undefined;
  const sources = shardSources(root);
  const refuse = why => { throw new Error(`0.5.0 (public/ → static/): ${why}; nothing was changed`); };

  // 1. Plan. Which slug each source's assets/public was published under.
  const publish = join(root, PUBLISH), copies = existsSync(publish) ? publishCopies(readFileSync(publish, 'utf8')) : [];
  if (copies === undefined) lines.push(`${PUBLISH} is not the script \`new\` wrote; each assets/public/ goes to static/assets/<its slug>/`);
  const trees = sources.map(source => {
    const tree = `${source.rel}/assets/public`, targets = (copies ?? []).filter(copy => copy.tree === tree).map(copy => copy.target);
    if (targets.length > 1) refuse(`${PUBLISH} copies ${tree}/ to ${targets.join(' and ')}; a move keeps one name, so move it by hand`);
    const target = targets[0] ?? `public/assets/${source.slug}`;
    if (!/^public\/assets\/[^/]+$/u.test(target)) refuse(`${PUBLISH} copies ${tree}/ to ${target}, not public/assets/<slug>; move it by hand`);
    return { source, tree, target, slug: target.slice('public/assets/'.length) };
  });

  const moves = new Map(), drops = [], tracked = new Set(listed(root, ['--cached', '--', 'public', ...trees.map(row => row.tree)]));
  const into = (from, to) => {
    if (!existsSync(join(root, from))) refuse(`${from} is committed but not on disk; restore it or commit its deletion first`);
    const clash = [...moves].find(([, planned]) => planned === to)?.[0] ?? (existsSync(join(root, to)) ? to : undefined);
    if (clash === undefined) { moves.set(from, to); return; }
    if (sameBytes(join(root, from), join(root, clash))) { drops.push(from); return; }
    refuse(`${from} and ${clash} both belong at ${to} and differ; keep one and run migrate again`);
  };
  for (const { tree, source, slug } of trees) {
    for (const file of listed(root, ['--cached', '--others', '--', tree])) into(file, `${source.rel}/static/assets/${slug}/${file.slice(tree.length + 1)}`);
  }
  const committed = [...tracked].filter(file => under(file, 'public')).sort();
  if (committed.length > 0 && sources.length !== 1) {
    refuse(sources.length === 0
      ? `public/ holds committed files (${listOf(committed)}) but the repo has no shard source (src/shard.config.ts or src/shards/<slug>/shard.config.ts)`
      : `public/ holds committed files (${listOf(committed)}) and the repo has ${String(sources.length)} shard sources (${sources.map(row => row.rel).join(', ')}); move each into its source's static/ by hand`);
  }
  for (const file of committed) into(file, `${sources[0].rel}/static/${file.slice('public/'.length)}`);

  // Uncommitted files under public/: ignored ones are build output or publish-public's copies; others are the author's.
  const loose = listed(root, ['--others', '--exclude-standard', '--', 'public']);
  if (loose.length > 0) refuse(`public/ holds files git does not track or ignore (${listOf(loose)}); commit or delete them first`);
  const ignored = listed(root, ['--others', '--ignored', '--exclude-standard', '--', 'public']), changed = [];
  for (const file of ignored) {
    const copy = trees.find(row => under(file, row.target));
    const origin = copy === undefined ? undefined : join(root, copy.tree, file.slice(copy.target.length + 1));
    if (origin !== undefined && existsSync(origin) && !sameBytes(origin, join(root, file))) changed.push(`${file} (from ${relative(root, origin)})`);
  }
  if (changed.length > 0) refuse(`these copies publish-public made differ from their source, so deleting them could lose an edit: ${listOf(changed)}; copy what you want to keep into the source (or delete the copy) and run migrate again`);

  // Map inputs naming a file or folder that moves follow it; any other input stays exactly as written.
  const homeOf = path => {
    const copy = trees.find(row => under(path, row.target));
    if (copy !== undefined) return `${copy.source.rel}/static/assets/${copy.slug}${path.slice(copy.target.length)}`;
    return sources.length === 1 ? `${sources[0].rel}/static/${path.slice('public/'.length)}` : undefined;
  };
  const destinations = [...moves.values()], maps = [];
  for (const source of sources) for (const name of ['data/map.json', 'look/map.json']) {
    const file = join(source.dir, name), parsed = existsSync(file) ? readJson(file) : undefined;
    if (!Array.isArray(parsed?.inputs)) continue;
    const renames = new Map();
    for (const input of parsed.inputs) {
      if (typeof input !== 'string' || !/^(?:\.\.\/){1,3}public\//u.test(input)) continue;
      const path = posix(relative(root, resolve(source.dir, input)));
      // sdk-migrate F2/F3: Sky Reach's `../../../public/…` resolves past the repo from its source, so nothing here can
      // place it, and a build without it quietly drops the file. Name it.
      if (path.startsWith('../')) { manual.push(`${source.rel}/${name}: map input ${input} names public/, which is gone; point it at its file under ${source.rel}/static/`); continue; }
      if (!under(path, 'public') || !existsSync(join(root, path))) continue;
      const home = homeOf(path);
      if (home === undefined || !destinations.some(to => under(to, home))) {
        manual.push(`${source.rel}/${name}: map input ${input} names a file this move deletes (build output); rebake the map or drop the input`);
        continue;
      }
      renames.set(input, posix(relative(source.dir, join(root, home))));
    }
    if (renames.size > 0) maps.push({ file, rel: `${source.rel}/${name}`, renames, from: typeof parsed.from === 'string' ? parsed.from : undefined });
  }

  // 2. Move: the files first (rename, then one git rm --cached and one git add for all), then what is left goes.
  const byFolder = new Map();
  for (const [from, to] of moves) {
    mkdirSync(dirname(join(root, to)), { recursive: true });
    renameSync(join(root, from), join(root, to));
    const top = from.split('/').slice(0, from.startsWith('public/assets/') ? 3 : 2).join('/');
    const folder = from.startsWith('public/') ? top === from ? dirname(from) : top : trees.find(row => under(from, row.tree))?.tree ?? dirname(from);
    const row = byFolder.get(folder) ?? { to: to.slice(0, to.length - (from.length - folder.length)), count: 0 };
    row.count += 1;
    byFolder.set(folder, row);
  }
  const movedTracked = [...moves].filter(([from]) => tracked.has(from));
  gitPaths(root, ['rm', '--cached', '-q'], movedTracked.map(([from]) => from));
  gitPaths(root, ['add', '-f'], movedTracked.map(([, to]) => to));
  gitPaths(root, ['rm', '-q', '-f'], drops.filter(file => tracked.has(file)));
  for (const file of drops) rmSync(join(root, file), { force: true });
  for (const [folder, { to, count }] of [...byFolder].sort(([a], [b]) => a.localeCompare(b))) lines.push(`moved ${folder}/ → ${to}/ (${String(count)} file${count === 1 ? '' : 's'})`);
  if (drops.length > 0) lines.push(`dropped ${String(drops.length)} duplicate${drops.length === 1 ? '' : 's'} of a file already in place: ${listOf(drops)}`);
  for (const file of ignored) rmSync(join(root, file), { force: true });
  if (ignored.length > 0) lines.push(`deleted ${String(ignored.length)} ignored file${ignored.length === 1 ? '' : 's'} under public/ (build output and publish-public's copies)`);
  for (const { tree } of trees) pruneEmpty(join(root, tree));
  if (existsSync(join(root, 'public'))) {
    pruneEmpty(join(root, 'public'));
    if (existsSync(join(root, 'public'))) {
      const left = readdirSync(join(root, 'public'), { recursive: true, withFileTypes: true }).filter(entry => !entry.isDirectory()).map(entry => posix(relative(root, join(entry.parentPath, entry.name))));
      throw new Error(`0.5.0 (public/ → static/): public/ still holds ${listOf(left)} after the move; move or delete each, then run migrate again`);
    }
    lines.push('removed public/');
  }

  // 3. The scaffolding that served public/.
  if (existsSync(publish)) {
    if (listed(root, ['--cached', '--', PUBLISH]).length > 0) git(root, ['rm', '-q', '-f', '--', PUBLISH]);
    else rmSync(publish);
    lines.push(`deleted ${PUBLISH}`);
  }
  const pkgEdits = [];
  if (editText(root, 'package.json', text => {
    const next = text.replaceAll(/node scripts\/publish-public\.mjs\s*&&\s*/gu, () => { pkgEdits.push('drops node scripts/publish-public.mjs &&'); return ''; })
      .replaceAll(/ --ignore-pattern (?:'public\/\*\*'|\\"public\/\*\*\\")/gu, () => { pkgEdits.push("drops --ignore-pattern 'public/**'"); return ''; });
    JSON.parse(next);
    return next;
  })) lines.push(`package.json: ${[...new Set(pkgEdits)].join('; ')}`);
  const ignoreEdits = [];
  editText(root, '.gitignore', text => {
    const rows = text.split('\n'), kept = rows.filter(row => {
      const pattern = row.trim().replace(/^!/u, '').replace(/^\//u, '');
      if (!pattern.startsWith('#') && (pattern === 'public' || pattern.startsWith('public/'))) { ignoreEdits.push(row.trim()); return false; }
      return true;
    });
    if (!kept.some(row => /^\/?out\/?$/u.test(row.trim()))) {
      if (kept.at(-1) === '') kept.splice(-1, 0, 'out/'); else kept.push('out/');
      ignoreEdits.push('+out/');
    }
    return kept.join('\n');
  });
  if (ignoreEdits.length > 0) lines.push(`.gitignore: ${ignoreEdits.map(row => row.startsWith('+') ? `adds ${row.slice(1)}` : `drops ${row}`).join(', ')}`);
  if (editText(root, '.github/workflows/ci.yml', text => text.split('\n').map(row => row.includes('watched=') ? row.replaceAll('|public/|', '|') : row).join('\n'))) {
    lines.push('.github/workflows/ci.yml: public/ leaves the watched paths');
  }
  // `.gitattributes` rows for public/ (`public/** -whitespace`) follow the files to their one source's static/.
  const home = sources.length === 1 ? `${sources[0].rel}/static/` : undefined;
  if (home !== undefined && editText(root, '.gitattributes', text => text.split('\n').map(row => row.replace(/^\/?public\//u, home)).join('\n'))) {
    lines.push(`.gitattributes: public/ rows now name ${home}`);
  }

  // 4. Map inputs, as planned: only the input strings change, the rest of map.json keeps its bytes.
  for (const { file, rel, renames, from } of maps) {
    editText(root, relative(root, file), text => {
      const span = inputsSpan(text);
      if (span === undefined) return text;
      let inputs = text.slice(span.start, span.end), rest = text.slice(span.end), head = text.slice(0, span.start);
      for (const [old, now] of renames) {
        inputs = inputs.replaceAll(JSON.stringify(old), JSON.stringify(now));
        if (from === old) [head, rest] = [head, rest].map(part => part.replace(fromKey(old), `$1${JSON.stringify(now)}`));
      }
      return head + inputs + rest;
    });
    const sample = [...renames][0];
    lines.push(`${rel}: ${String(renames.size)} map input${renames.size === 1 ? '' : 's'} follow${renames.size === 1 ? 's' : ''} the move (${sample[0]} → ${sample[1]}${renames.size > 1 ? ', …' : ''}); the map's input hash (the product's map tilesHash) changes, its image does not`);
  }

  // 5. What is left for the author: every line outside the sources that still names the old layout.
  const before = [...committed, ...ignored];
  if (fired || lines.length > 0) manual.push(...staleReferences(root, { home: sources.length === 1 ? sources[0].rel : '<source>', trees, before }));
  return { lines, manual };
}
