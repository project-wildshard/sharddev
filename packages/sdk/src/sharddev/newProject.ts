// oxlint-disable-next-line import/no-nodejs-modules -- Scaffolding owns only a fresh author directory.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Asks npm which sdk and cli releases a new repo can install.
import { execFileSync } from 'node:child_process';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve files beneath the new project root.
import { resolve } from 'node:path';
import { encodeCanonicalJson } from './immutable';
import { authorCard } from './authorManifest';
import { writeHandwrittenSource } from './handwritten';
import { syncAgentFiles } from './agentFiles';
import { AUTHOR_LINT_CONFIG } from './authorLint';

/**
 * SA39 (J319): generators may install any npm package, so a dependency's install scripts run only when listed here.
 * pnpm 10 runs none by default. `allowBuilds` is the list our pinned pnpm 10.34.9 reads and `pnpm approve-builds` writes;
 * pnpm 10.21 ignores it and so runs none at all. Nothing a new shard installs needs a script today: the list starts empty.
 * The pnpm pin itself is in the `package.json` SA16 writes. Proved by hand (SA39 receipt): an unlisted postinstall
 * never ran and `pnpm ignored-builds` named it; `esbuild: true` let esbuild's run.
 */
export const INSTALL_SCRIPT_POLICY = `packages:
  - .

# Install scripts (SA39): a dependency runs its preinstall, install or postinstall
# script only when it is listed \`true\` below. Wildshard's own packages need none.
# pnpm skips any other package's script and names it after \`pnpm install\`; allow
# one with \`pnpm approve-builds\` (or \`name: true\` here) only if you trust it.
# pnpm 10.34 or later reads this list; pnpm 10.0 to 10.33 runs no script at all;
# pnpm 9, npm and yarn run every script, so install with pnpm 10.34 or later.
allowBuilds: {}
`;

/** Write the project's pnpm install-script allowlist. */
function writeInstallScriptPolicy(project: string): void {
  writeFileSync(resolve(project, 'pnpm-workspace.yaml'), INSTALL_SCRIPT_POLICY);
}

/** SA16 (J314, J317): `new --template <name>`. `sdk` is the Template (sharddev's `_template`, Mossgate's gameplay);
 * `scene` (AP37a) is Mossgate Hollow's three.js scene module (`src/shards/mossgate`, AP15), the shape every template
 * moves to (AP36). SS5 (J341): a shard is TypeScript three.js scene source, and Blender makes the models it loads. */
export const TEMPLATES = ['sdk', 'scene'] as const;
export type TemplateName = (typeof TEMPLATES)[number];
/** What `writeShardRepo` can still lay out. `blender` is the retired hand-written shape (shard-format's
 * `blender-template`, a shard file folder held by hand): `new` refuses it, but repos made that way still check and upload,
 * so tests keep making one to prove that. */
export type RepoShape = TemplateName | 'blender';
/** The template `new` makes with no flag. */
export const DEFAULT_TEMPLATE: TemplateName = 'sdk';
/** J317: a repo with one shard keeps its shard source at `src/`. */
export const SHARD_SOURCE_FOLDER = 'src';

/** The template named by `--template`, or a refusal, thrown before anything is written. */
export function templateNamed(name: string): TemplateName {
  if (name === 'blender') throw new Error('new: --template blender is retired (J341): a shard is TypeScript three.js scene source, and Blender makes the .glb models that code loads; leave out --template. Repos made with it still check and upload');
  const found = TEMPLATES.find(template => template === name);
  if (found === undefined) throw new Error(`new: unknown template ${name}: leave out --template, or pass --template sdk or --template scene`);
  return found;
}

function assertTarget(project: string, slug: string): void {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(slug) || existsSync(project)) throw new Error('new requires a fresh directory and kebab-case slug');
}

/** The installed sdk's own package.json: its version and the exact specs it pins for engine, shard-format and three. */
const SDK_PACKAGE: string = resolve(import.meta.dirname, '../../package.json');
interface SdkPackage { readonly version: string; readonly node: string; readonly dependencies: Readonly<Record<string, string>> }
function sdkPackage(): SdkPackage {
  const parsed: unknown = JSON.parse(readFileSync(SDK_PACKAGE, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null || !('version' in parsed) || typeof parsed.version !== 'string'
    || !('dependencies' in parsed) || typeof parsed.dependencies !== 'object' || parsed.dependencies === null) throw new Error('new: the installed @wildshard/sdk has no package.json version');
  const dependencies: Record<string, string> = {};
  for (const [name, spec] of Object.entries(parsed.dependencies)) if (typeof spec === 'string') dependencies[name] = spec;
  // SDK-SPLIT SP10: a new repo pins @wildshard/cli (the `wildshard` command, which brings build, upload, dev and the
  // engine) at the sdk's own version (D5, one release version), never the engine directly.
  dependencies['@wildshard/cli'] = parsed.version;
  // SA8: `three` is the sdk's peer, pinned exact; a repo lists it at that pin like the others (dependencies win, as in updatePins).
  const peers: unknown = 'peerDependencies' in parsed ? parsed.peerDependencies : undefined;
  if (typeof peers === 'object' && peers !== null) for (const [name, spec] of Object.entries(peers)) if (typeof spec === 'string') dependencies[name] ??= spec;
  const node = 'engines' in parsed && typeof parsed.engines === 'object' && parsed.engines !== null && 'node' in parsed.engines && typeof parsed.engines.node === 'string' ? parsed.engines.node : undefined;
  if (node === undefined) throw new Error('new: the installed @wildshard/sdk names no Node engine');
  return { version: parsed.version, node, dependencies };
}
/** What a shard repo lists besides the sdk library (grill Q12, Q13; SDK-SPLIT SP10): the CLI, shard-format and `three`
 * (sdk's peer). Each is pinned exactly as the installed sdk pins it, so the repo installs one copy. The engine comes in
 * through the CLI (dev's local game and sim tests); the repo never pins it. */
export const REPO_DEPENDENCIES = ['@wildshard/cli', '@wildshard/format', 'three'] as const;

/** What a hand-written repo lists (J314): no code imports anything, so the CLI (`@wildshard/cli`, for `wildshard check`
 * and `upload`), shard-format (`shard-format pack` and `validate`) and the sdk (the release `update --pins` reads), as dev
 * dependencies; no three. */
export const HANDWRITTEN_DEPENDENCIES = ['@wildshard/cli', '@wildshard/format'] as const;

/** The versions npm lists for a package, or undefined when the registry can't be read (offline). */
export type PublishedVersions = (name: string) => readonly string[] | undefined;
const listed = new Map<string, readonly string[] | undefined>();
function registryVersions(name: string): readonly string[] | undefined {
  if (!listed.has(name)) {
    let versions: readonly string[] | undefined;
    try {
      const parsed: unknown = JSON.parse(execFileSync('pnpm', ['view', name, 'versions', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30_000 }));
      versions = Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : typeof parsed === 'string' ? [parsed] : undefined;
    } catch { versions = undefined; }
    listed.set(name, versions);
  }
  return listed.get(name);
}
function newer(a: string, b: string): number {
  const parts = (version: string): number[] => version.split(/[.-]/u).slice(0, 3).map(Number);
  const [x, y] = [parts(a), parts(b)];
  for (let index = 0; index < 3; index++) if ((x[index] ?? 0) !== (y[index] ?? 0)) return (x[index] ?? 0) - (y[index] ?? 0);
  return 0;
}
/** The release a new repo pins the sdk and the cli at (TEMPLATE-E2E TC-NE5): the running sdk's own version when npm has
 * both at it, else the newest release npm has both at. A source checkout's version may be one npm never got (the cli first
 * shipped at 0.4.0, so a starter made on 0.3.9 pinned a cli nobody could install). Offline, the sdk's version stands. */
export function releasePin(version: string, sdkVersions: readonly string[] | undefined, cliVersions: readonly string[] | undefined): string {
  if (sdkVersions === undefined || cliVersions === undefined) return version;
  const both = sdkVersions.filter(each => cliVersions.includes(each) && !each.includes('-'));
  if (both.includes(version)) return version;
  // A version newer than every sdk on npm is a release being cut (its own publish brings both packages), not a gap.
  if (sdkVersions.every(each => newer(version, each) > 0)) return version;
  const latest = [...both].sort(newer).at(-1);
  if (latest === undefined) throw new Error(`new: npm has no release of both @wildshard/sdk and @wildshard/cli to pin (this sdk is ${version})`);
  return latest;
}

/** A new repo's package.json: the shard's slug, SA39's pnpm pin, and each Wildshard package pinned exactly. */
export function repoPackageJson(slug: string, template: RepoShape = DEFAULT_TEMPLATE, published: PublishedVersions = registryVersions, scene: boolean = template !== 'blender'): string {
  const sdk = sdkPackage(), release = releasePin(sdk.version, published('@wildshard/sdk'), published('@wildshard/cli'));
  const dependencies: Record<string, string> = { '@wildshard/sdk': release };
  for (const name of template === 'blender' ? HANDWRITTEN_DEPENDENCIES : REPO_DEPENDENCIES) {
    const spec = name === '@wildshard/cli' ? release : sdk.dependencies[name];
    if (spec === undefined) throw new Error(`new: the installed @wildshard/sdk does not pin ${name}`);
    dependencies[name] = spec;
  }
  const sorted = Object.fromEntries(Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b)));
  // AP22, AP37b: a scene-module repo gets `pnpm watch` (each saved edit swapped into the running page); the Template is one
  // too now (AP36). The retired hand-written shape and a bare `--empty` source have no scene to watch.
  const scripts = scene ? { check: 'wildshard check .', watch: 'wildshard watch .' } : { check: 'wildshard check .' };
  // `version` is what `wildshard upload` sends (provenance.ts reads the nearest package.json).
  return `${JSON.stringify({ name: slug, version: '0.0.1', private: true, type: 'module', packageManager: 'pnpm@10.34.9',
    engines: { node: sdk.node }, scripts, [template === 'blender' ? 'devDependencies' : 'dependencies']: sorted }, null, 2)}\n`;
}

const TSCONFIG = `${JSON.stringify({
  // The author build bundles src/ (extensionless relative imports), as sharddev's own tsconfig does.
  compilerOptions: { target: 'esnext', module: 'esnext', moduleResolution: 'bundler', strict: true, noEmit: true, skipLibCheck: true,
    resolveJsonModule: true, allowImportingTsExtensions: true },
  include: ['src/**/*.ts'],
}, null, 2)}\n`;
const GITIGNORE = `node_modules/
# Build output: the built folder and <slug>.shardfile. Never commit it.
public/shardfiles/
public/assets/*/map/
tmp/
.DS_Store
`;
// Exact versions for every package an author adds, and refuse a Node older than the sdk's.
const NPMRC = `save-exact=true
engine-strict=true
`;

const HANDWRITTEN_LAYOUT = `- \`src/\` is the shard source, written by hand: a shard file folder.
  \`shard.json\` is its index, \`sections/\` the JSON you edit, \`blobs/\` the
  baked files (Blender models, textures, scripts) named by their hash, and
  \`mounts/\` what the boot reads first. \`wildshard check .\`
  runs \`shard-format pack\`, which settles every hash and size the sections
  measure, and validates the whole folder. A changed blob is a new file under
  its new hash, with every row that names it updated.
- \`package.json\` pins \`@wildshard/cli\` (the \`wildshard\` command), the sdk
  and shard-format exactly; nothing here imports code, so no three.js. Its
  \`version\` is the version \`wildshard upload\` sends.`;

function repoReadme(slug: string, template: RepoShape, empty: boolean): string {
  const handwritten = template === 'blender' && !empty;
  const world = empty ? 'a bare shard source (`--empty`)' : template === 'sdk' ? 'the Template, Mossgate\'s gameplay on a three.js scene module'
    : template === 'scene' ? 'Mossgate Hollow, a three.js scene module (`--template scene`)' : 'the hand-written Blender template (`blender-template`)';
  const files = empty ? '`data/`, `generators/`,\n  `behaviour/` and `assets/`' : template === 'scene'
    ? '`identity.json` (the slug and name)\n  and `generators/` (`world.ts` is the scene; `wildshard watch .` shows each save)'
    : '`data/` (the gameplay rows),\n  `generators/` (`scene.ts` is the world; `wildshard watch .` shows each save), `behaviour/`, `assets/` and\n  `data/card.json` (the card)';
  const layout = handwritten ? HANDWRITTEN_LAYOUT : `- \`src/\` is the shard source: \`shard.config.ts\` (the build entry), ${files}.
- \`package.json\` pins \`@wildshard/cli\` (the \`wildshard\` command), the
  \`@wildshard/sdk\` library, shard-format and \`three\` exactly; its \`version\`
  is the version \`wildshard upload\` sends.`;
  return `# ${slug}

A Wildshard **shard source**, started by \`wildshard new\` from ${world}.
\`wildshard check .\` builds it into one **shard file**, and \`wildshard upload\`
sends that file to a channel.

Start with \`GUIDE.md\`, the author's manual: section 1 is the loop (new, dev,
check, hero, upload), section 2 this layout. The \`wildshard\` skill in
\`.claude/skills/\` gives an agent the same loop; its siblings there make a
model from a picture (\`wildshard-mockup-to-model\`), refresh the hero and
proof tape (\`wildshard-goldens\`) and move to a newer sdk
(\`wildshard-upgrade\`).

\`\`\`sh
pnpm install
pnpm exec wildshard dev .
pnpm exec wildshard check .
\`\`\`

${layout}
- \`public/shardfiles/\` is build output. Never edit or commit it.
`;
}

/** The sdk's own author lint config (shipped in the package), and where a shard repo finds the sdk's lint plugins. */
const SDK_AUTHOR_LINT: string = resolve(import.meta.dirname, '../../.oxlintrc.author.json');
const REPO_LINT_PLUGINS = './node_modules/@wildshard/sdk/lint/';

/**
 * TEMPLATE-E2E TC-NE4 (NEW-SHARD-E2E F4): a new repo carries `.oxlintrc.author.json`, so `wildshard check .` lints from
 * the first command instead of skipping. It is the sdk's own config with the plugin paths under the installed sdk and the
 * Template's `src/shards/<slug>/` globs at `src/`; oxlint comes with the sdk (`authorLintPlan` finds it there).
 */
export function repoAuthorLint(): string {
  let text = readFileSync(SDK_AUTHOR_LINT, 'utf8');
  const swap = (from: string | RegExp, to: string): void => {
    const next = text.replaceAll(from, to);
    if (next === text) throw new Error(`new: the sdk's ${AUTHOR_LINT_CONFIG} no longer holds ${String(from)}`);
    text = next;
  };
  // Its schema lives in the sdk's own oxlint, which a repo does not list.
  swap(/^\s*"\$schema": [^\n]*\n/gmu, '');
  swap('"./lint/', `"${REPO_LINT_PLUGINS}`);
  swap('src/shards/*/', 'src/');
  return text;
}

/** Write the repo files around a shard source at `src/`: package.json, tsconfig, ignores, README, and the agent files
 * (GUIDE.md, the four skills, their `.agents/skills` links, AGENTS.md and CLAUDE.md; SA28). */
function writeRepoFiles(project: string, slug: string, template: RepoShape, empty: boolean): void {
  writeFileSync(resolve(project, 'package.json'), repoPackageJson(slug, empty ? DEFAULT_TEMPLATE : template, registryVersions, !empty && template !== 'blender'));
  // A hand-written repo holds no TypeScript to check.
  if (template !== 'blender' || empty) writeFileSync(resolve(project, 'tsconfig.json'), TSCONFIG);
  writeFileSync(resolve(project, '.gitignore'), GITIGNORE);
  writeFileSync(resolve(project, '.npmrc'), NPMRC);
  writeFileSync(resolve(project, 'README.md'), repoReadme(slug, template, empty));
  writeInstallScriptPolicy(project);
  if (template !== 'blender' || empty) writeFileSync(resolve(project, AUTHOR_LINT_CONFIG), repoAuthorLint());
  syncAgentFiles(project);
}

/** Copy the shipped teaching world into `source`; generation and gameplay remain authored there. */
function writeReferenceSource(source: string, slug: string): void {
  // The host-owned CLI bundle defines dirname as its installed source directory.
  const template = resolve(import.meta.dirname, '../shards/_template');
  cpSync(template, source, { recursive: true, errorOnExist: true, force: false,
    filter: from => !/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(from) && from !== resolve(template, 'card') && from !== resolve(template, 'hero.json')
      // The template's README is sharddev's own notes; the repo gets a README of its own (SA16).
      && from !== resolve(template, 'README.md')
      // A checkout's built Template output (gitignored, under public/) is Template's; build output goes to the repo root.
      && from !== resolve(template, 'public') });
  // TEMPLATE-E2E TC-NE5: the starter's proof tape (the chest) lives beside this module, not in the template, so adding
  // or editing it never makes the Template's captured hero stale; `check .` plays it from the repo's src/proof.json.
  cpSync(resolve(import.meta.dirname, 'starter-proof.json'), resolve(source, 'proof.json'));
  // ONE-FORMAT OF6b: data/card.json is the card's one home; no manifest.json copy is written.
  const card: unknown = JSON.parse(readFileSync(resolve(source, 'data/card.json'), 'utf8'));
  if (typeof card !== 'object' || card === null || Array.isArray(card)) throw new Error('Reference project card is missing');
  // The template's card is Mossgate's own in-engine hero (template/card/): a new project wears a generated card until its
  // author captures one, never another shard's art.
  const art = authorCard(slug, 1);
  // UP5 (2026-11-13): the boot loads `shardfile`; Template's path booted a file this project never builds and hung.
  const manifest = encodeCanonicalJson({ ...card, slug, name: slug, status: 'experimental', card: { thumb: art, portrait: art, landscape: art }, shardfile: `/shardfiles/${slug}/shard.json` }).replaceAll('/assets/_template/', `/assets/${slug}/`);
  writeFileSync(resolve(source, 'data/card.json'), manifest);
  // AP37b: the Template reads its identity from data/identity.json (its scene module's describe() and the build alike), so
  // the project's own slug, name and author replace it there; the revision and seed stay the Template's.
  const identity: unknown = JSON.parse(readFileSync(resolve(source, 'data/identity.json'), 'utf8'));
  if (typeof identity !== 'object' || identity === null || Array.isArray(identity)) throw new Error('Reference project identity is missing');
  writeFileSync(resolve(source, 'data/identity.json'), encodeCanonicalJson({ ...identity, slug, name: slug, author: 'Local author' }));
}

/** AP37a: copy Mossgate Hollow's scene module (AP15) into `source` under this project's identity. Its only source is
 * three.js: `generators/world.ts` builds the scene, `wildshard build` compiles it, `wildshard watch` streams each save. */
function writeSceneSource(source: string, slug: string): void {
  // The host-owned CLI bundle defines dirname as its installed source directory.
  const scene = resolve(import.meta.dirname, '../shards/mossgate');
  cpSync(scene, source, { recursive: true, errorOnExist: true, force: false,
    filter: from => !/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(from) && from !== resolve(scene, 'public') });
  writeFileSync(resolve(source, 'identity.json'), encodeCanonicalJson({ slug, name: slug, author: 'Local author', revision: 1, seed: 357 }));
  writeFileSync(resolve(source, 'generators/shard.ts'), `import { defineShard } from '@wildshard/sdk/scene/shard';\nimport identity from '../identity.json' with { type: 'json' };\nimport { buildMossgate } from './world';\n\n/** This shard: the scene \`world.ts\` builds, under this project's identity. */\nexport const shard = defineShard(identity, buildMossgate);\n`);
  writeFileSync(resolve(source, 'shard.config.ts'), `// The shard is one three.js scene module: \`generators/world.ts\`. \`wildshard build\` runs it as the generator;\n// \`wildshard watch\` reads its describe() and streams each saved edit to a running page.\nimport { shard } from './generators/shard';\n\nexport const generate: typeof shard = shard;\n// oxlint-disable-next-line import/no-default-export -- The author CLI executes this project entry.\nexport default generate;\n`);
}

/** Write the runtime-free bare shard source (`new --empty`) into `source`. */
function writeEmptySource(source: string, slug: string): void {
  for (const folder of ['generators', 'data', 'behaviour', 'assets']) mkdirSync(resolve(source, folder), { recursive: true });
  const identity = encodeCanonicalJson({ slug, name: slug, author: 'Local author', revision: 1, seed: 1 }).trim();
  // TC-NE4: build-time TypeScript lives in generators/ (the author lint refuses it in data/, which holds JSON rows).
  writeFileSync(resolve(source, 'generators/card.ts'), `/** Build-time identity; add authored level metadata here as the world grows. */\nexport const IDENTITY = ${identity};\n`);
  writeFileSync(resolve(source, 'generators/product.ts'), `import { emptyShardfile } from '@wildshard/sdk/author';\nimport { IDENTITY } from './card';\n\n/** Build-only declaration; the CLI emits its platform sections as JSON. */\nconst WORLD = emptyShardfile(IDENTITY);\n// oxlint-disable-next-line import/no-default-export -- The documented build entry imports this declaration.\nexport default WORLD;\n`);
  writeFileSync(resolve(source, 'generators/output.ts'), `import type { ProjectOutput } from '@wildshard/sdk/projectOutput';\n\n/** Build-only named blobs and platform sections, read automatically by the CLI. */\nexport const output = {} satisfies ProjectOutput;\n`);
  writeFileSync(resolve(source, 'shard.config.ts'), `import declared from './generators/product';\n\n/** The build entry: the bare shard file \`generators/product.ts\` declares. */\nexport const product: typeof declared = declared;\n// oxlint-disable-next-line import/no-default-export -- The author CLI loads this build entry.\nexport default product;\n`);
}

/** The bare shard source alone at `source`, with no repo around it (sdk API; tests build it in place). */
export function writeEmptyShardSource(source: string, slug: string): void {
  assertTarget(source, slug);
  writeEmptySource(source, slug);
}

/** `wildshard new <dir> [slug] [--template sdk|scene] [--empty]` (and the retired `blender` shape, for tests): a whole single-shard repo, its shard source at `src/`. */
export function writeShardRepo(project: string, slug: string, options: { readonly template?: RepoShape; readonly empty?: boolean } = {}): void {
  const template = options.template ?? DEFAULT_TEMPLATE;
  assertTarget(project, slug);
  mkdirSync(project, { recursive: true });
  const source = resolve(project, SHARD_SOURCE_FOLDER);
  try {
    if (options.empty === true) writeEmptySource(source, slug);
    else if (template === 'blender') writeHandwrittenSource(source, slug);
    else if (template === 'scene') writeSceneSource(source, slug);
    else writeReferenceSource(source, slug);
    writeRepoFiles(project, slug, template, options.empty === true);
  } catch (error) {
    // A refused `new` leaves no half-written repo, so running it again names the real cause, not `new-target`.
    rmSync(project, { recursive: true, force: true });
    throw error;
  }
}

/** `new <dir>`: the reference world as a whole repo. */
export function writeReferenceProject(project: string, slug: string): void { writeShardRepo(project, slug); }

/** `new <dir> --empty`: the bare shard source as a whole repo. */
export function writeNewProject(project: string, slug: string): void { writeShardRepo(project, slug, { empty: true }); }
