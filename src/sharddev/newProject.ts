// oxlint-disable-next-line import/no-nodejs-modules -- Scaffolding owns only a fresh author directory.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve files beneath the new project root.
import { resolve } from 'node:path';
import { encodeCanonicalJson } from '@wildshard/engine/host/immutable';
import { authorCard } from './authorManifest';

/** Copy the shipped teaching world; generation and gameplay remain authored there. */
export function writeReferenceProject(project: string, slug: string): void {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(slug) || existsSync(project)) throw new Error('new requires a fresh directory and kebab-case slug');
  // The trusted CLI bundle defines dirname as its installed source directory.
  const template = resolve(import.meta.dirname, '../shards/_template');
  cpSync(template, project, { recursive: true, errorOnExist: true, force: false,
    filter: source => !/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(source) && source !== resolve(template, 'card') });
  const card: unknown = JSON.parse(readFileSync(resolve(project, 'manifest.json'), 'utf8'));
  if (typeof card !== 'object' || card === null || Array.isArray(card)) throw new Error('Reference project manifest is missing');
  // The template's card is Mossgate's own in-engine hero (template/card/): a new project wears a generated card until its
  // author captures one, never another shard's art.
  const art = authorCard(slug, 1);
  const manifest = encodeCanonicalJson({ ...card, slug, name: slug, status: 'experimental', card: { thumb: art, portrait: art, landscape: art } }).replaceAll('/assets/_template/', `/assets/${slug}/`);
  writeFileSync(resolve(project, 'manifest.json'), manifest);
  writeFileSync(resolve(project, 'data/card.json'), manifest);
  writeFileSync(resolve(project, 'data/identity.json'), encodeCanonicalJson({ slug, name: slug, author: 'Local author' }));
  writeFileSync(resolve(project, 'shard.config.ts'), `import { generate as reference } from './generators/generate';\nimport { BUILD_OPTIONS } from './generators/buildOptions';\nimport identity from './data/identity.json' with { type: 'json' };\nimport type { GeneratedProject, ProjectGenerationContext } from '@wildshard/sharddev/projectGeneration';\n\n/** Author this world's data and generators; the identity belongs to this project. */\nexport async function generate(context: ProjectGenerationContext): Promise<GeneratedProject> {\n  const product = await reference(context);\n  return { ...product, shard: { ...product.shard, identity: { ...product.shard.identity, ...identity } } };\n}\n\n// oxlint-disable-next-line import/no-default-export -- The author CLI loads this documented generation entry.\nexport default generate;\nexport const buildOptions: typeof BUILD_OPTIONS = { ...BUILD_OPTIONS };\n`);
}

/** Write the runtime-free reference layout. An existing directory is never changed. */
export function writeNewProject(project: string, slug: string): void {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(slug) || existsSync(project)) throw new Error('new requires a fresh directory and kebab-case slug');
  for (const folder of ['generators', 'data', 'behaviour', 'assets']) mkdirSync(resolve(project, folder), { recursive: true });
  const identity = encodeCanonicalJson({ slug, name: slug, author: 'Local author', revision: 1, seed: 1 }).trim();
  writeFileSync(resolve(project, 'data/card.ts'), `/** Build-time identity; add authored level metadata here as the world grows. */\nexport const IDENTITY = ${identity};\n`);
  writeFileSync(resolve(project, 'data/world.ts'), `import { emptyShardfile } from '@wildshard/sharddev/author';\nimport { IDENTITY } from './card';\n\n/** Build-only declaration; the CLI emits its platform sections as JSON. */\nexport const WORLD = emptyShardfile(IDENTITY);\n`);
  writeFileSync(resolve(project, 'generators/product.ts'), `import { WORLD } from '../data/world';\n\n// oxlint-disable-next-line import/no-default-export -- The documented build entry imports this declaration.\nexport default WORLD;\n`);
  writeFileSync(resolve(project, 'generators/output.ts'), `import type { ProjectOutput } from '@wildshard/sharddev/projectOutput';\n\n/** Build-only named blobs and platform sections, read automatically by the CLI. */\nexport const output = {} satisfies ProjectOutput;\n`);
  writeFileSync(resolve(project, 'shard.config.ts'), `import product from './generators/product';\n\n// oxlint-disable-next-line import/no-default-export -- The author CLI loads this build entry.\nexport default product;\n`);
  writeFileSync(resolve(project, 'README.md'), `# ${slug}

Build with \`wildshard build <project> <output> --product-only\`, then
\`wildshard validate <output>\`. The output is a v2 index, schema-checked JSON
sections and hash-named blobs. In this repository use \`out/<slug>/\`.

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
