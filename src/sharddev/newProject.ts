// oxlint-disable-next-line import/no-nodejs-modules -- Scaffolding owns only a fresh author directory.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve files beneath the new project root.
import { resolve } from 'node:path';
import { encodeCanonicalJson } from './immutable';
import { authorCard } from './authorManifest';

/**
 * SA39 (J319): generators may install any npm package, so a dependency's install scripts run only when listed here.
 * pnpm 10 runs none by default. `allowBuilds` is the list our pinned pnpm 10.34.9 reads and `pnpm approve-builds` writes;
 * pnpm 10.21 ignores it and so runs none at all. Nothing a new shard installs needs a script today: the list starts empty.
 * The pnpm pin itself belongs in the `package.json` SA16 writes. Proved by hand (SA39 receipt): an unlisted postinstall
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

/** SA13 (J314): the author's manual at the package root, shipped by `files`; `new` copies it into every project. */
export const GUIDE_SOURCE: string = resolve(import.meta.dirname, '../../GUIDE.md');

/** SA14 (J314): the `wildshard` skill at the package's `skills/`, shipped by `files`; `new` copies it for Claude Code. */
export const SKILL_SOURCE: string = resolve(import.meta.dirname, '../../skills/wildshard/SKILL.md');
/** Where a project keeps the skill: Claude Code lists project skills from `.claude/skills/<name>/SKILL.md`. */
export const SKILL_FILE = '.claude/skills/wildshard/SKILL.md';

/** Copy the installed sdk's GUIDE.md and `wildshard` skill into the project, byte for byte. */
function writeGuide(project: string): void {
  cpSync(GUIDE_SOURCE, resolve(project, 'GUIDE.md'));
  mkdirSync(resolve(project, '.claude/skills/wildshard'), { recursive: true });
  cpSync(SKILL_SOURCE, resolve(project, SKILL_FILE));
}

/** Copy the shipped teaching world; generation and gameplay remain authored there. */
export function writeReferenceProject(project: string, slug: string): void {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(slug) || existsSync(project)) throw new Error('new requires a fresh directory and kebab-case slug');
  // The trusted CLI bundle defines dirname as its installed source directory.
  const template = resolve(import.meta.dirname, '../shards/_template');
  cpSync(template, project, { recursive: true, errorOnExist: true, force: false,
    filter: source => !/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(source) && source !== resolve(template, 'card') && source !== resolve(template, 'hero.json')
      // A checkout's built Template output (gitignored) is Template's, never the new project's.
      && source !== resolve(template, 'public/shardfiles') });
  const card: unknown = JSON.parse(readFileSync(resolve(project, 'manifest.json'), 'utf8'));
  if (typeof card !== 'object' || card === null || Array.isArray(card)) throw new Error('Reference project manifest is missing');
  // The template's card is Mossgate's own in-engine hero (template/card/): a new project wears a generated card until its
  // author captures one, never another shard's art.
  const art = authorCard(slug, 1);
  // UP5 (2026-11-13): the boot loads `shardfile`; Template's path booted a file this project never builds and hung.
  const manifest = encodeCanonicalJson({ ...card, slug, name: slug, status: 'experimental', card: { thumb: art, portrait: art, landscape: art }, shardfile: `/shardfiles/${slug}/shard.json` }).replaceAll('/assets/_template/', `/assets/${slug}/`);
  writeFileSync(resolve(project, 'manifest.json'), manifest);
  writeFileSync(resolve(project, 'data/card.json'), manifest);
  writeFileSync(resolve(project, 'data/identity.json'), encodeCanonicalJson({ slug, name: slug, author: 'Local author' }));
  writeFileSync(resolve(project, 'shard.config.ts'), `import { generate as reference } from './generators/generate';\nimport { BUILD_OPTIONS } from './generators/buildOptions';\nimport identity from './data/identity.json' with { type: 'json' };\nimport type { GeneratedProject, ProjectGenerationContext } from '@wildshard/sdk/projectGeneration';\n\n/** Author this world's data and generators; the identity belongs to this project. */\nexport async function generate(context: ProjectGenerationContext): Promise<GeneratedProject> {\n  const product = await reference(context);\n  return { ...product, shard: { ...product.shard, identity: { ...product.shard.identity, ...identity } } };\n}\n\n// oxlint-disable-next-line import/no-default-export -- The author CLI loads this documented generation entry.\nexport default generate;\nexport const buildOptions: typeof BUILD_OPTIONS = { ...BUILD_OPTIONS };\n`);
  writeInstallScriptPolicy(project);
  writeGuide(project);
}

/** Write the runtime-free reference layout. An existing directory is never changed. */
export function writeNewProject(project: string, slug: string): void {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(slug) || existsSync(project)) throw new Error('new requires a fresh directory and kebab-case slug');
  for (const folder of ['generators', 'data', 'behaviour', 'assets']) mkdirSync(resolve(project, folder), { recursive: true });
  const identity = encodeCanonicalJson({ slug, name: slug, author: 'Local author', revision: 1, seed: 1 }).trim();
  writeFileSync(resolve(project, 'data/card.ts'), `/** Build-time identity; add authored level metadata here as the world grows. */\nexport const IDENTITY = ${identity};\n`);
  writeFileSync(resolve(project, 'data/world.ts'), `import { emptyShardfile } from '@wildshard/sdk/author';\nimport { IDENTITY } from './card';\n\n/** Build-only declaration; the CLI emits its platform sections as JSON. */\nexport const WORLD = emptyShardfile(IDENTITY);\n`);
  writeFileSync(resolve(project, 'generators/product.ts'), `import { WORLD } from '../data/world';\n\n// oxlint-disable-next-line import/no-default-export -- The documented build entry imports this declaration.\nexport default WORLD;\n`);
  writeFileSync(resolve(project, 'generators/output.ts'), `import type { ProjectOutput } from '@wildshard/sdk/projectOutput';\n\n/** Build-only named blobs and platform sections, read automatically by the CLI. */\nexport const output = {} satisfies ProjectOutput;\n`);
  writeInstallScriptPolicy(project);
  writeGuide(project);
  writeFileSync(resolve(project, 'shard.config.ts'), `import product from './generators/product';\n\n// oxlint-disable-next-line import/no-default-export -- The author CLI loads this build entry.\nexport default product;\n`);
  writeFileSync(resolve(project, 'README.md'), `# ${slug}

Build with \`wildshard build <project> <output> --shardfile-only\`, then
\`wildshard validate <output>\`. The output is a v2 index, schema-checked JSON
sections and hash-named blobs, and the build writes the shard file you upload,
\`<slug>.shardfile\`, beside it. In this repository use \`out/<slug>/\`.

- \`shard.config.ts\` is the build entry; \`generators/product.ts\` assembles
  the declaration from data rows.
- \`data/\` is build-time TypeScript: identity/card, layouts, quests, rows and
  schemas. It never ships as executable code.
- \`generators/\` produces immutable assets and section data at build time.
- \`generators/output.ts\` declares registered named blobs and platform
  sections. The CLI reads its \`output\` export automatically.
- \`behaviour/\` holds AssemblyScript sources; \`assets/\` holds source assets.

This project has no runtime TypeScript. Use admitted platform rows and WASM
behaviour; executable build logic belongs in \`generators/\`. Keep the
\`shard.config.ts\` entry declaration-only. Check authored JSON at its source
intake; keep standalone product interfaces in plain committed files. Read
the shipped data contract in SHARDFILE.md.

For a complete playable reference, see \`src/shards/_template/\` in the
Wildshard repository: terrain and props are generated from data, its map is
painted from those same products, and \`behaviour/boss.as\` makes encounter
decisions through ABI v1 at at most 10 Hz. Its headless example is
\`test/scripts/_template-boss.test.ts\`; it loads published Wasm bytes and
checks phase changes, timers, stop/restart and logical save continuation.

After each content slice, build and validate. Keep decoded/GPU/wire costs
truthful, respect the reported graph/script budgets, and add playable content
before publishing. The empty declaration is a starting point, not a finished world.
`);
}
