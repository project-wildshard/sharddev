// oxlint-disable-next-line import/no-nodejs-modules -- Real git temp repos: the codemod reads git ls-files and moves through git.
import { execFileSync } from 'node:child_process';
// oxlint-disable-next-line import/no-nodejs-modules -- Exercise a real temporary shard repo.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Keep fixtures inside the test's owned scratch folder.
import { dirname, join, resolve } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import codemod, { guide, pending, title } from '../codemods/0.5.0.mjs';

// SDK 0.5.0 B1 (ask A7): a shard repo's public/ moves into its source's static/, renaming nothing.
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

const git = (root: string, ...args: string[]): string => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
function write(root: string, files: Record<string, string>): void {
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), body);
  }
}
/** A git repo with `committed` committed, then `loose` written (ignored by its .gitignore). */
function repo(committed: Record<string, string>, loose: Record<string, string> = {}): string {
  const parent = resolve(process.env['VITEST_TMP_ROOT'] ?? 'tmp/vitest');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, 'static-move-codemod-'));
  roots.push(root);
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'test@example.invalid');
  git(root, 'config', 'user.name', 'test');
  git(root, 'config', 'commit.gpgsign', 'false');
  write(root, committed);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'shard');
  write(root, loose);
  return root;
}
const read = (root: string, path: string): string => readFileSync(join(root, path), 'utf8');
const status = (root: string): string => git(root, 'status', '--porcelain', '--untracked-files=all');
const run = (root: string): { lines: string[]; manual: string[] } => codemod({ project: root, from: '0.4.33', to: '0.5.0' });

const PUBLISH = (slug: string, tree: string): string => `// A gathered shard's published files, copied to the public URLs a build reads. The aliases are gitignored.
import { cpSync, existsSync } from 'node:fs';

for (const slug of ["${slug}"]) {
  const tree = \`${tree}\`;
  if (existsSync(tree)) cpSync(tree, \`public/assets/\${slug}\`, { recursive: true, force: true });
}
`;
const PACKAGE = `{
  "name": "@wildshard/shard-x",
  "scripts": {
    "lint": "node kit/scripts/lint.mjs --ignore-pattern 'tmp/**' --ignore-pattern 'public/**' --ignore-pattern 'scripts/**'",
    "build:shards": "node scripts/publish-public.mjs && wildshard build-shards"
  }
}
`;
const GITIGNORE = `node_modules/
out/
tmp/
public/assets/driftwood-isle/map/top.webp
/public/assets/driftwood-isle/entry-reads.json
/public/assets/driftwood-isle/
`;
const CI = `jobs:
  x:
    steps:
      - run: |
          watched='^(\\.github/workflows/ci\\.yml$|src/|test/|scripts/|public/|lint/|package\\.json$)'
`;

function driftwood(): string {
  return repo({
    'package.json': PACKAGE,
    '.gitignore': GITIGNORE,
    '.github/workflows/ci.yml': CI,
    '.gitattributes': 'public/** -whitespace\nsrc/**/*.json -whitespace\n',
    'scripts/publish-public.mjs': PUBLISH('driftwood-isle', 'src/assets/public'),
    'scripts/check.mjs': "const alias = 'public/assets/driftwood-isle/baked/x.bin';\nconsole.log(alias);\n",
    'scripts/targets.json': `${JSON.stringify(['a', 'b', 'c', 'd'].map(name => ({ name, file: 'public/assets/models/boat.glb' })), null, 1)}\n`,
    // The engine's own public/ (and another shard's paths) are not this repo's to move.
    'scripts/sim.mjs': "const wasm = resolve(engine, 'public/assets/physics/rapier.wasm');\nconst other = 'public/assets/baked/other-shard/terrain.bin';\n",
    'src/shard.config.ts': 'export default {};\n',
    'src/manifest.json': '{ "slug": "driftwood-isle", "assetGlobs": ["public/assets/models/**"] }\n',
    'src/data/map.json': '{\n  "why": "w",\n  "inputs": ["generators", "../public/assets/models/boat.glb"]\n}\n',
    'src/assets/public/baked/x.bin': 'baked-x',
    'public/assets/.gitkeep': '',
    'public/assets/baked/terrain.bin': 'terrain',
    'public/assets/models/boat.glb': 'boat',
    'public/programs/driftwood-isle.json': '{}\n',
  }, {
    'public/assets/driftwood-isle/baked/x.bin': 'baked-x',
    'public/assets/driftwood-isle/map/top.webp': 'webp',
    'public/assets/driftwood-isle/entry-reads.json': '[]',
  });
}

test('the migration names itself and its guide anchor', () => {
  expect(title).toBe('Shard assets move from public/ into src/static/');
  expect(guide).toBe('migrate-0-5-0');
});

test('a single-shard repo moves public/ and assets/public into src/static/', () => {
  const root = driftwood();
  expect(pending({ project: root })).toMatch(/public\/assets, public\/programs, scripts\/publish-public\.mjs/u);
  const { lines, manual } = run(root);
  // Committed files keep their path below static/; assets/public goes under its published slug.
  expect(read(root, 'src/static/assets/baked/terrain.bin')).toBe('terrain');
  expect(read(root, 'src/static/assets/models/boat.glb')).toBe('boat');
  expect(read(root, 'src/static/programs/driftwood-isle.json')).toBe('{}\n');
  expect(read(root, 'src/static/assets/driftwood-isle/baked/x.bin')).toBe('baked-x');
  expect(existsSync(join(root, 'src/static/assets/.gitkeep'))).toBe(true);
  expect(existsSync(join(root, 'public'))).toBe(false);
  expect(existsSync(join(root, 'src/assets/public'))).toBe(false);
  expect(existsSync(join(root, 'scripts/publish-public.mjs'))).toBe(false);
  // git sees renames, so history follows.
  expect(git(root, 'diff', '--cached', '--name-status', '-M')).toMatch(/^R100\tpublic\/assets\/models\/boat\.glb\tsrc\/static\/assets\/models\/boat\.glb$/mu);
  expect(git(root, 'diff', '--cached', '--name-status', '-M')).toMatch(/^R100\tsrc\/assets\/public\/baked\/x\.bin\tsrc\/static\/assets\/driftwood-isle\/baked\/x\.bin$/mu);
  // The scaffolding.
  const pkg = read(root, 'package.json');
  expect(pkg).toContain('"build:shards": "wildshard build-shards"');
  expect(pkg).toContain("--ignore-pattern 'tmp/**' --ignore-pattern 'scripts/**'");
  expect(pkg).not.toContain('public');
  expect(read(root, '.gitignore')).toBe('node_modules/\nout/\ntmp/\n');
  expect(read(root, '.gitattributes')).toBe('src/static/** -whitespace\nsrc/**/*.json -whitespace\n');
  expect(read(root, '.github/workflows/ci.yml')).toContain("watched='^(\\.github/workflows/ci\\.yml$|src/|test/|scripts/|lint/|package\\.json$)'");
  // The map input followed its file; the rest of map.json keeps its bytes. The card's names stay.
  expect(read(root, 'src/data/map.json')).toBe('{\n  "why": "w",\n  "inputs": ["generators", "static/assets/models/boat.glb"]\n}\n');
  expect(read(root, 'src/manifest.json')).toContain('public/assets/models/**');
  expect(lines.join('\n')).toMatch(/map input.*tilesHash/u);
  expect(lines).toContain('removed public/');
  // Each stale line outside src/ is a step; a file naming the old layout many times is one.
  expect(manual).toEqual([
    'scripts/check.mjs:1: names public/assets/driftwood-isle/baked/x.bin: now src/static/assets/driftwood-isle/baked/x.bin; point it there, or drop a check of the old copy',
    'scripts/targets.json:4: names public/assets/models/boat.glb: now src/static/assets/models/boat.glb; point it there, or drop a check of the old copy (and 3 more lines in this file)',
  ]);
  expect(lines).toContain('moved public/assets/ → src/static/assets/ (1 file)');
  // The tree holds only the move: nothing untracked is left behind.
  expect(status(root).split('\n').filter(line => line.startsWith('??'))).toEqual([]);
  expect(pending({ project: root })).toBeUndefined();
});

test('a multi-shard repo moves into its one source, and its map input follows', () => {
  const root = repo({
    'package.json': PACKAGE,
    '.gitignore': 'node_modules/\n/public/assets/open-plot-*/map/top.webp\n',
    'scripts/publish-public.mjs': PUBLISH('open-plots', 'src/shards/${slug}/assets/public'),
    'src/shards/open-plots/shard.config.ts': 'export default {};\n',
    'src/shards/open-plots/data/map.json': '{"why":"w","inputs":["shard.config.ts","../../../public/assets/open-plots","../../sharddev/bake/mapRaster.ts"]}\n',
    'public/assets/open-plots/rock.glb': 'rock',
    'public/assets/sfx/thin-ice/a.m4a': 'a',
    'public/assets/open-plot-thin-ice/entry-reads.json': '[1]',
  }, { 'public/assets/open-plot-thin-ice/map/top.webp': 'webp' });
  const { lines } = run(root);
  const home = 'src/shards/open-plots/static';
  expect(read(root, `${home}/assets/open-plots/rock.glb`)).toBe('rock');
  expect(read(root, `${home}/assets/sfx/thin-ice/a.m4a`)).toBe('a');
  expect(read(root, `${home}/assets/open-plot-thin-ice/entry-reads.json`)).toBe('[1]');
  expect(existsSync(join(root, 'public'))).toBe(false);
  expect(read(root, 'src/shards/open-plots/data/map.json')).toBe('{"why":"w","inputs":["shard.config.ts","static/assets/open-plots","../../sharddev/bake/mapRaster.ts"]}\n');
  expect(read(root, '.gitignore')).toBe('node_modules/\nout/\n');
  expect(lines.join('\n')).toContain('moved public/assets/open-plots/ → src/shards/open-plots/static/assets/open-plots/ (1 file)');
  expect(pending({ project: root })).toBeUndefined();
});

test('a map input naming a path that never existed in the repo stays byte-identical', () => {
  // Dunes, Nine Dragon, Sky Reach: three levels up from src/ is outside the repo.
  const map = '{\n  "why": "w",\n  "inputs": [\n    "generators",\n    "../../../public/assets/sunscar-dunes/models/horse.glb"\n  ]\n}\n';
  const root = repo({
    'package.json': PACKAGE,
    'src/shard.config.ts': 'export default {};\n',
    'src/identity.json': '{"slug":"sunscar-dunes"}\n',
    'src/data/map.json': map,
    'public/assets/baked/navmesh.bin': 'nav',
  });
  const { lines } = run(root);
  expect(read(root, 'src/data/map.json')).toBe(map);
  expect(lines.join('\n')).not.toMatch(/map input/u);
  expect(read(root, 'src/static/assets/baked/navmesh.bin')).toBe('nav');
});

test('a copy that differs from its source refuses and changes nothing', () => {
  const root = driftwood();
  write(root, { 'public/assets/driftwood-isle/baked/x.bin': 'edited by hand' });
  expect(() => run(root)).toThrow(/public\/assets\/driftwood-isle\/baked\/x\.bin \(from src\/assets\/public\/baked\/x\.bin\).*nothing was changed/u);
  expect(status(root)).toBe('');
  expect(read(root, 'public/assets/driftwood-isle/baked/x.bin')).toBe('edited by hand');
});

test('several sources with committed public/ files refuse, naming the files', () => {
  const root = repo({
    'src/shards/a/shard.config.ts': '', 'src/shards/b/shard.config.ts': '', 'public/assets/sfx/x.m4a': 'x',
  });
  expect(() => run(root)).toThrow(/public\/assets\/sfx\/x\.m4a.*2 shard sources \(src\/shards\/a, src\/shards\/b\)/u);
  expect(status(root)).toBe('');
});

test('a second run is a no-op with an empty report', () => {
  const root = driftwood();
  run(root);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'migrated');
  expect(pending({ project: root })).toBeUndefined();
  expect(run(root)).toEqual({ lines: [], manual: [] });
  expect(status(root)).toBe('');
});

test('a repo with only public/ gitignore lines loses them and keeps the rest', () => {
  // Brasscap, Mirror Salt: build output in public/shardfiles, nothing to move.
  const root = repo({
    'package.json': '{\n  "scripts": {}\n}\n',
    '.gitignore': 'out/\npublic/shardfiles/\npublic/assets/*/map/\n',
    'src/shard.config.ts': '',
  }, { 'public/shardfiles/x/shard.json': '{}' });
  expect(pending({ project: root })).toBeUndefined();
  const { lines } = run(root);
  expect(read(root, '.gitignore')).toBe('out/\n');
  expect(existsSync(join(root, 'public'))).toBe(false);
  expect(lines).toContain('.gitignore: drops public/shardfiles/, drops public/assets/*/map/');
});
