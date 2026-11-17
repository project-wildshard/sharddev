#!/usr/bin/env node
// Build author tools against the same public contract as the game; pnpm pack uses these portable JS modules.
import { build } from 'vite';
import { join, relative, resolve } from 'node:path';
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { rapierAlias } from '@wildshard/engine/vite/rapier.ts';
import { assertHeavyLease } from '@wildshard/engine/scripts/heavy-lane-lease.mjs';
import { shardfileValidationRevision } from '@wildshard/engine/scripts/shardfile-validation-revision.mjs';
import { SDK_EXTERNALS } from './sdk-externals.mjs';

// This package also compiles the two real app clients; acquire the build lane before generation or type emission.
assertHeavyLease('build');
const root = resolve(import.meta.dirname, '..');
process.chdir(root);
execFileSync('node', ['scripts/gen.mjs', '--inputs-only'], { cwd: root, stdio: 'inherit' });
// P1-F4: the package is @wildshard/sharddev; the host stays @wildshard/sdk until P3 and ships bundled inside it.
const layers = ['sharddev', 'sdk'].map(layer => ({ layer, manifest: JSON.parse(readFileSync(resolve(root, `src/${layer}/package.json`), 'utf8')) }));
const modules = layers.flatMap(({ layer, manifest }) => Object.entries(manifest.exports).map(([specifier, target]) => {
  if (!specifier.startsWith('./') || typeof target !== 'string' || !target.endsWith('.ts')) throw new Error('SDK workspace exports must name defining TypeScript modules');
  return { layer, name: specifier.slice(2), source: resolve(root, `src/${layer}`, target), declaration: target.slice(2, -3) };
}));
await build({ configFile: false, publicDir: false, resolve: { alias: rapierAlias }, logLevel: 'warn', define: { __SHARDFILE_VALIDATOR__: JSON.stringify(shardfileValidationRevision(root)) }, build: { outDir: resolve(root, 'src/sharddev', 'dist') /* build output, git-ignored: check-paths only checks committed paths */, emptyOutDir: true, minify: false, lib: {
  entry: Object.fromEntries([...modules.map(({ name, source }) => [name, source]), ['cli', resolve(root, 'src/sharddev/cli.ts')], ['headlessWorker', resolve(root, 'src/sdk/bake/headlessWorker.ts')]]), formats: ['es'], fileName: (_format, name) => `${name}.js`,
}, rolldownOptions: { platform: 'node', external: SDK_EXTERNALS } } });

// Ship declarations without requiring the repository's internal workspace packages.
execFileSync('pnpm', ['exec', 'tsc', '-b', '--force', 'tsconfig.layers.json'], { cwd: root, stdio: 'inherit' });
const seen = new Set();
// SF79 publishes some modules under an older specifier (`./shardfile/moverRuntime` → `./plugin/mover.ts`): a declaration
// is emitted at, and points to, the module its layer's exports name, never a path built from the specifier.
const layerExports = new Map();
function defining(layer, module) {
  if (!layerExports.has(layer)) layerExports.set(layer, JSON.parse(readFileSync(resolve(root, `src/${layer}/package.json`), 'utf8')).exports ?? {});
  const target = layerExports.get(layer)[`./${module}`];
  return typeof target === 'string' && target.startsWith('./') && target.endsWith('.ts') && !target.endsWith('.d.ts') ? target.slice(2, -3) : module;
}
function declaration(layer, module) {
  const key = `${layer}/${module}`;
  if (seen.has(key)) return;
  seen.add(key);
  const source = resolve(root, `.tsc-layers/${layer}/src/${layer}/${module}.d.ts`);
  const output = resolve(root, `src/sharddev/dist/types/${key}.d.ts`);
  // Ambient defining leaves are compiler inputs, so tsc does not emit a second copy of them.
  let text = readFileSync(existsSync(source) ? source : resolve(root, `src/${layer}/${module}.d.ts`), 'utf8');
  // Relative import declarations are illegal inside ambient modules; the equivalent type query remains portable.
  if (key === 'engine/client/types/n8ao') text = text.replace("import type { Renderer } from '@wildshard/engine/render/renderer';", "type Renderer = import('@wildshard/engine/render/renderer').Renderer;");
  // @wildshard/format stays a package import: the SDK depends on the shardfile repo's own files.
  text = text.replaceAll(/(['"])@wildshard\/(engine|game|sdk|sharddev)\/([^'"]+)\1/gu, (_match, quote, dependencyLayer, specifier) => {
    const dependency = defining(dependencyLayer, specifier);
    declaration(dependencyLayer, dependency);
    const from = resolve(root, `src/sharddev/dist/types/${layer}`, module, '..');
    const to = resolve(root, `src/sharddev/dist/types/${dependencyLayer}/${dependency}`);
    // Public declarations may only refer to packaged files or third-party dependencies.
    return `${quote}${relative(from, to).replaceAll('\\', '/')}${quote}`;
  });
  // Relative declaration imports remain in the same copied module tree.
  // Doc comments may quote example imports (game/client/shard/manifest.ts: `import('./look/render')`); only code is scanned.
  const code = text.replaceAll(/\/\*[\s\S]*?\*\//gu, '').replaceAll(/^\s*\/\/.*$/gmu, '');
  for (const match of code.matchAll(/(?:from\s*|import\s*\()(['"])(\.[^'"]+)\1/gu)) {
    const dependency = relative(resolve(root, `src/${layer}`), resolve(root, `src/${layer}`, module, '..', match[2]));
    if (!dependency.startsWith('..')) declaration(layer, dependency.replace(/\.js$/u, ''));
  }
  if (/from\s*['"]n8ao['"]/u.test(text)) {
    declaration('engine', 'types/n8ao');
    // declaration() above generates this packaged output; only src/sdk is a committed input path.
    const vendor = relative(resolve(output, '..'), resolve(root, 'src/sharddev', 'dist', 'types/engine/types/n8ao.d.ts')).replaceAll('\\', '/');
    text = `/// <reference path="${vendor}" />\n${text}`;
  }
  mkdirSync(resolve(output, '..'), { recursive: true }); writeFileSync(output, text);
}
for (const module of modules) declaration(module.layer, module.declaration);

// Both clients use the normal Game bundle. Author dev is a separate compiled mode, never enabled by requests. They build
// through the app build script, as every app build does (its generators, tables, boot bank and worker, D24), with the
// repo's config minus the public/ copy; the hidden source maps its checks read do not ship.
for (const [mode, folder] of [['production', 'client'], ['devserver', 'client-devserver']]) {
  const outDir = resolve(root, `src/sharddev/dist/${folder}`), config = resolve(root, 'tmp', `sdk-${folder}.vite.mjs`);
  mkdirSync(resolve(root, 'tmp'), { recursive: true });
  writeFileSync(config, `import { mergeConfig } from 'vite';\nimport base from ${JSON.stringify(resolve(root, 'vite.config.ts'))};\n`
    + `export default async env => mergeConfig(typeof base === 'function' ? await base(env) : base, { build: { copyPublicDir: false } });\n`);
  execFileSync(process.execPath, ['scripts/build-app.mjs', '--mode', mode, '--config', config, '--outDir', outDir, '--emptyOutDir'], { cwd: root, stdio: 'inherit' });
  rmSync(config, { force: true });
  for (const entry of readdirSync(outDir, { recursive: true, withFileTypes: true })) if (entry.isFile() && entry.name.endsWith('.map')) rmSync(join(entry.parentPath, entry.name));
  for (const entry of ['fonts', 'favicon.png', 'apple-touch-icon.png', 'manifest.webmanifest', 'basis/r186', 'assets/physics', 'assets/sfx/best', 'assets/music/piano', 'assets/music/orchestral', 'assets/music/folk']) cpSync(resolve(root, 'public', entry), resolve(root, `src/sharddev/dist/${folder}`, entry), { recursive: true });
}

// Ship retained readable author inputs, not one-time baked outputs or workspace symlinks.
const template = resolve(root, 'src/sharddev', 'dist', 'author-template');
cpSync(resolve(root, 'scripts/docs/author-project'), template, { recursive: true });
// The host ships bundled in this package until P3, so a packed project names one package.
for (const name of readdirSync(template, { recursive: true, encoding: 'utf8' })) {
  const file = resolve(template, name);
  if (/\.(?:ts|mjs)$/u.test(name)) writeFileSync(file, readFileSync(file, 'utf8').replaceAll('@wildshard/engine/host/', '@wildshard/sharddev/'));
}
