// oxlint-disable-next-line import/no-nodejs-modules -- A written bundle replaces its output folder, as the old build did.
import { readFileSync, rmSync } from 'node:fs';
import { rolldown, type ExternalOption, type InputOptions, type OutputOptions, type RolldownOutput, type RolldownPluginOption } from 'rolldown';
import { viteJsonPlugin, viteResolvePlugin, viteTransformPlugin } from 'rolldown/experimental';

/** One library bundle (SDK-SPLIT SP9b): the sdk calls rolldown itself, with the options and the four native plugins
 * vite 8.3 composed for `build.lib` with `formats: ['es']`, so a config's bundled bytes, and the identity hashes made
 * from them, stay what they were under vite. Inside the author CLI, dev's launcher points `rolldown` at its input
 * recorder, which records every module this reads (the generation cache's receipts). */
export interface BundleOptions {
  /** The entry module, or several (each is its own output chunk). */
  readonly entry: string | readonly string[];
  /** The entry chunk's name without `.js`; several entries keep their own names. */
  readonly fileName?: string;
  readonly plugins?: readonly RolldownPluginOption[];
  readonly external?: ExternalOption;
  /** `node` for a bundle that runs in Node; module resolution stays the browser's either way, as vite's did. */
  readonly platform?: 'browser' | 'node';
  /** The syntax target; vite's default is Baseline Widely Available (2025-05-01). */
  readonly target?: string | readonly string[];
  /** Extra global replacements, applied with `import.meta.env`'s. */
  readonly define?: Readonly<Record<string, string>>;
  /** Code splitting off makes one chunk per entry. */
  readonly codeSplitting?: boolean;
  /** Write the chunks into this folder, emptied first; without it nothing is written. */
  readonly outDir?: string;
}

const BASELINE = ['chrome111', 'edge111', 'firefox114', 'safari16.4', 'ios16.4'];
const EXTENSIONS = ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'];
const ENV = { BASE_URL: '"/"', MODE: '"production"', DEV: 'false', PROD: 'true', SSR: 'false' };

/** `?raw` imports a file's text as its default export (vite's asset plugin did this). */
const raw: RolldownPluginOption = {
  name: 'wildshard-raw',
  resolveId: { order: 'pre', async handler(id, importer, options) {
    if (!id.endsWith('?raw')) return null;
    const resolved = await this.resolve(id.slice(0, -4), importer, { ...options, skipSelf: true });
    return resolved === null ? null : { id: `${resolved.id}?raw` };
  } },
  load(id) {
    return id.endsWith('?raw') ? `export default ${JSON.stringify(readFileSync(id.slice(0, -4), 'utf8'))}` : null;
  },
};

/** Bundle `entry` as an ES library the way the build always has. */
export async function bundle(options: BundleOptions): Promise<RolldownOutput> {
  const root = process.cwd();
  const define: Record<string, string> = { 'process.env.NODE_ENV': 'process.env.NODE_ENV', 'import.meta.hot': 'undefined' };
  for (const [key, value] of Object.entries(ENV)) define[`import.meta.env.${key}`] = value;
  Object.assign(define, options.define);
  define['import.meta.env'] = `{${Object.entries(ENV).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${JSON.stringify(key)}: ${value}`).join(', ')}}`;
  define['import.meta.env.*'] = 'undefined';
  const input: InputOptions = {
    input: typeof options.entry === 'string' ? options.entry : [...options.entry],
    preserveEntrySignatures: 'strict',
    platform: options.platform ?? 'browser',
    logLevel: 'silent',
    plugins: [...options.plugins ?? [], raw,
      viteResolvePlugin({
        resolveOptions: { isBuild: true, isProduction: true, asSrc: true, preferRelative: false, root, scan: false,
          mainFields: ['browser', 'module', 'jsnext:main', 'jsnext', 'main'], conditions: ['module', 'browser', 'development|production'],
          externalConditions: ['node', 'module-sync'], extensions: EXTENSIONS, tryIndex: true, preserveSymlinks: false, tsconfigPaths: false },
        environmentConsumer: 'client', environmentName: 'client', builtins: [], external: [], noExternal: [], dedupe: [],
        resolveSubpathImports: () => undefined,
      }),
      viteTransformPlugin({ root, include: /\.(m?ts|[jt]sx)$/u, exclude: /\.js$/u, isServerConsumer: false, transformOptions: { jsx: { development: false }, sourcemap: false } }),
      viteJsonPlugin({ namedExports: true, stringify: 'auto', minify: true }),
    ],
    transform: { target: typeof options.target === 'string' ? options.target : [...options.target ?? BASELINE], define },
    moduleTypes: { '.css': 'js' },
    experimental: { viteMode: true },
    ...options.external === undefined ? {} : { external: options.external },
  };
  const output: OutputOptions = {
    format: 'es', exports: 'auto', generatedCode: { preset: 'es2015' }, comments: { annotation: true, jsdoc: true, legal: true },
    minify: 'dce-only', topLevelVar: true, entryFileNames: options.fileName === undefined ? '[name].js' : `${options.fileName}.js`,
    chunkFileNames: '[name]-[hash].js', assetFileNames: '[name].[ext]',
    ...options.codeSplitting === undefined ? {} : { codeSplitting: options.codeSplitting },
  };
  const built = await rolldown(input);
  try {
    if (options.outDir === undefined) return await built.generate(output);
    rmSync(options.outDir, { recursive: true, force: true });
    return await built.write({ ...output, dir: options.outDir });
  } finally { await built.close(); }
}
