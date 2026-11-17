#!/usr/bin/env node
// SDK-SPLIT SP9d2: compiles @wildshard/build's bin to dist/build.mjs at pack time, so an installed build needs no run-time
// bundle of the CLI and no format hook. The shard format, the sdk, upload and kit ship TypeScript, which Node will not
// strip under node_modules (J82), so they are inlined; every other package (three, sharp, rolldown, valibot, the script
// compilers) stays an import of the install.
//
// An inlined module keeps reading its own files (templates, wasm, the client folder): each `import.meta.dirname`,
// `.filename` and `.url` becomes that module's place in its installed package, found beside @wildshard/build at run time.
//
//   node scripts/compile.mjs [outfile]   (default dist/build.mjs)
import { build } from 'esbuild';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(process.argv[2] ?? join(ROOT, 'dist/build.mjs'));
/** npm aliases: the install folder a dependent finds a package under. */
const INSTALLED = new Map([['@wildshard/shard-format', '@wildshard/format']]);
// The shard file's validator revision is the engine's (format validationReceipt.ts): the engine client trusts a saved
// verdict only under its own revision. Dev builds take it from the engine dev pins (scripts/wildshard.mjs); the compiled
// build takes the same value at pack time, from that same engine, so build needs no engine to run.
const engine = createRequire(resolve(ROOT, '../dev/package.json')).resolve('@wildshard/engine/scripts/shardfile-validation-revision.mjs');
const { shardfileValidationRevision } = await import(pathToFileURL(engine).href);
const VALIDATOR = shardfileValidationRevision();
const INLINE = /^@wildshard\/(?:format|shard-format|sdk|upload|kit|build)(?:\/|$)/u;

/** @param {string} file @returns {{ name: string, root: string }} the nearest package.json above `file`. */
function owner(file) {
  for (let dir = dirname(file); dir !== dirname(dir); dir = dirname(dir)) {
    const manifest = join(dir, 'package.json');
    if (existsSync(manifest)) {
      const { name } = JSON.parse(readFileSync(manifest, 'utf8'));
      if (typeof name === 'string') return { name: INSTALLED.get(name) ?? name, root: dir };
    }
  }
  throw new Error(`compile: no package owns ${file}`);
}

/** @type {import('esbuild').Plugin} */
const placed = {
  name: 'wildshard-placed-meta',
  setup(context) {
    // Bare imports outside our TypeScript packages load from the install.
    context.onResolve({ filter: /^[^./]/ }, args => (INLINE.test(args.path) || args.path.startsWith('node:') ? undefined : { path: args.path, external: true }));
    context.onLoad({ filter: /\.(?:[cm]?ts|[cm]?js)$/ }, args => {
      const source = readFileSync(args.path, 'utf8');
      if (!/import\.meta\.(?:dirname|filename|url)\b/u.test(source)) return undefined;
      const { name, root } = owner(args.path);
      const place = `__wildshardPlace(${JSON.stringify(name)}, ${JSON.stringify(relative(root, args.path).split(sep).join('/'))})`;
      const contents = source.replaceAll(/import\.meta\.(dirname|filename|url)\b/gu, (_, key) => `${place}.${key}`);
      return { contents, loader: /\.[cm]?ts$/u.test(args.path) ? 'ts' : 'js', resolveDir: dirname(args.path) };
    });
  },
};

// The bundle's own place is dist/ inside @wildshard/build; every other package is found from there, as Node would.
const banner = `import { createRequire as __wildshardRequire } from 'node:module';
import { existsSync as __wildshardExists, realpathSync as __wildshardReal } from 'node:fs';
import { dirname as __wildshardDir, join as __wildshardJoin } from 'node:path';
import { fileURLToPath as __wildshardPath, pathToFileURL as __wildshardUrl } from 'node:url';
const __wildshardBuild = __wildshardDir(__wildshardDir(__wildshardPath(import.meta.url)));
const __wildshardRoots = new Map([['@wildshard/build', __wildshardBuild]]);
function __wildshardRoot(name) {
  let root = __wildshardRoots.get(name);
  if (root === undefined) {
    const found = (__wildshardRequire(__wildshardJoin(__wildshardBuild, 'package.json')).resolve.paths(name) ?? []).map(folder => __wildshardJoin(folder, name)).find(folder => __wildshardExists(__wildshardJoin(folder, 'package.json')));
    if (found === undefined) throw new Error(\`wildshard-build: \${name} is not installed beside @wildshard/build\`);
    root = __wildshardReal(found);
    __wildshardRoots.set(name, root);
  }
  return root;
}
function __wildshardPlace(name, file) {
  const filename = __wildshardJoin(__wildshardRoot(name), file);
  return { filename, dirname: __wildshardDir(filename), url: __wildshardUrl(filename).href };
}`;

const result = await build({
  stdin: { contents: "import { main } from './buildMain.ts';\nawait main();\n", resolveDir: join(ROOT, 'src/sharddev'), sourcefile: 'bin.ts', loader: 'ts' },
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  // The shard file's bytes must not depend on the compile: no minify, no renaming beyond what bundling needs.
  minify: false,
  legalComments: 'none',
  logLevel: 'warning',
  banner: { js: `#!/usr/bin/env node\n${banner}` },
  define: { __SHARDFILE_VALIDATOR__: JSON.stringify(VALIDATOR) },
  metafile: true,
  plugins: [placed],
});
/** The packages the bundle still imports; build's package.json must declare each, so they resolve beside it. */
const externals = [...new Set(Object.values(result.metafile.outputs).flatMap(output => output.imports
  .filter(row => row.external && !row.path.startsWith('node:'))
  .map(row => row.path.replace(/^((?:@[^/]+\/)?[^/]+).*$/u, '$1'))))].sort();
const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const undeclared = externals.filter(name => manifest.dependencies?.[name] === undefined && manifest.peerDependencies?.[name] === undefined);
if (undeclared.length > 0) throw new Error(`compile: build imports ${undeclared.join(', ')} at run time; declare them in packages/build/package.json`);
console.info(`compile: ${relative(process.cwd(), OUT)}; validator ${VALIDATOR.slice(0, 12)}; imports ${externals.join(', ')}`);
