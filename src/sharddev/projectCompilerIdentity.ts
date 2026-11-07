// oxlint-disable-next-line import/no-nodejs-modules -- Compiler keys cover the installed tools' actual source bytes.
import { readdirSync, realpathSync, existsSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve only the pinned installed compiler dependency graph.
import { createRequire } from 'node:module';
// oxlint-disable-next-line import/no-nodejs-modules -- Package-relative names, never installation paths, enter the key.
import { dirname, resolve, relative } from 'node:path';
import { build } from 'vite';
import * as v from 'valibot';
import { encodeCanonicalJson, hashImmutableBytes } from '@wildshard/engine/host/immutable';
import { readBoundedFile } from './sourceReader';

const Package = v.object({ name: v.string(), version: v.string(), dependencies: v.optional(v.record(v.string(), v.string()), {}) });
const external = ['binaryen', 'assemblyscript/dist/asc.js'];
/** A bounded immutable build session owns its two identities. Production uses
 * the native bundler; a host may provide its own scoped bundling capability. */
export function createProjectCompilerIdentities(bundle: typeof build = build): {
  project: () => Promise<string>; rawAssemblyScript: () => Promise<string>;
} {
  let project: Promise<string> | undefined, raw: Promise<string> | undefined;
  return {
    project: () => { project ??= capture('project', bundle); return project; },
    rawAssemblyScript: () => { raw ??= capture('raw-assemblyscript', bundle); return raw; },
  };
}
const compilerIdentities = createProjectCompilerIdentities();

/** Hash a build tool's bundled implementation and installed external compiler closure.
 * This conservative identity is captured once per immutable CLI process; the product receipt still traces source reads. */
export function projectCompilerIdentity(): Promise<string> {
  return compilerIdentities.project();
}
/** Raw ASC storage retains both compiler entry implementations and the same
 * installed compiler/runtime/stdlib closure. Decision builders are outside this
 * role: their complete generated virtual sources and arguments key the raw memo,
 * while the full project identity above still binds their own implementation. */
export function rawAssemblyScriptCompilerIdentity(): Promise<string> {
  return compilerIdentities.rawAssemblyScript();
}
async function capture(role: 'project' | 'raw-assemblyscript', bundle: typeof build): Promise<string> {
  // The CLI defines the SDK directory when executing its bundle as a data URL.
  const require = createRequire(resolve(import.meta.dirname, 'package.json'));
  const compiler = require.resolve('@wildshard/sharddev/compileScript');
  const decisions = require.resolve('@wildshard/sharddev/buildDecisionScripts');
  const v2 = require.resolve('@wildshard/sharddev/compileScriptV2');
  const built = await bundle({ configFile: false, logLevel: 'silent', build: { write: false, minify: false,
    lib: { entry: role === 'project' ? [compiler, decisions, v2] : [compiler, v2], formats: ['es'] },
    rolldownOptions: { external: [/^node:/u, ...external] } } });
  const result = Array.isArray(built) ? built[0] : built;
  if (result === undefined || !('output' in result)) throw new Error('Missing generation compiler identity');
  const chunks = result.output.filter(row => row.type === 'chunk'), names = new Set(chunks.map(row => row.fileName));
  if (chunks.length === 0 || result.output.some(row => row.type !== 'chunk')
    || chunks.some(row => [...row.imports, ...row.dynamicImports].some(name => !names.has(name) && !name.startsWith('node:') && !external.includes(name)))) throw new Error('Unknown generation compiler dependency');
  const files: [string, string][] = chunks.map(row => [`sdk/${row.fileName}`, hashImmutableBytes(new TextEncoder().encode(row.code))]);
  files.push(...compilerPackageInputs([{ name: 'binaryen', from: compiler }, { name: 'assemblyscript', from: compiler, specifier: 'assemblyscript/dist/asc.js' }]));
  files.sort(([a, ah], [b, bh]) => a.localeCompare(b) || ah.localeCompare(bh));
  return hashImmutableBytes(new TextEncoder().encode(encodeCanonicalJson(role === 'project' ? { version: 1, files } : { version: 1, role, files })));
}

/** Capture actual runtime and standard-library files, including transitive installed compiler versions. */
export function compilerPackageInputs(packages: readonly { readonly name: string; readonly from: string; readonly specifier?: string }[]): readonly [string, string][] {
  const files: [string, string][] = [];
  const visited = new Set<string>(); let count = 0, total = 0;
  const packageInputs = (name: string, from: string, specifier = name): void => {
    let root = dirname(realpathSync(createRequire(from).resolve(specifier)));
    for (;;) {
      const path = resolve(root, 'package.json');
      if (existsSync(path) && v.parse(v.object({ name: v.optional(v.string()) }), JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readBoundedFile(path, 1_000_000)))).name === name) break;
      const parent = dirname(root); if (parent === root) throw new Error('Missing compiler package identity'); root = parent;
    }
    if (visited.has(root)) return; visited.add(root);
    const metadata = resolve(root, 'package.json'), pkg = v.parse(Package, JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readBoundedFile(metadata, 1_000_000))));
    const walk = (directory: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.name === 'node_modules') continue;
        const path = resolve(directory, entry.name);
        if (entry.isSymbolicLink()) throw new Error('Compiler package contains a symbolic source');
        if (entry.isDirectory()) walk(path);
        else if (entry.isFile() && /\.(?:[cm]?js|ts|wasm|json)$/u.test(entry.name)) {
          const bytes = readBoundedFile(path, 64_000_000); total += bytes.byteLength;
          if (++count > 10000 || total > 256_000_000) throw new Error('Compiler package identity exceeds bounds');
          files.push([`${pkg.name}@${pkg.version}/${relative(root, path).replaceAll('\\', '/')}`, hashImmutableBytes(bytes)]);
        }
      }
    };
    walk(root);
    for (const dependency of Object.keys(pkg.dependencies).sort()) packageInputs(dependency, metadata);
  };
  for (const row of packages) packageInputs(row.name, row.from, row.specifier);
  return files.sort(([a, ah], [b, bh]) => a.localeCompare(b) || ah.localeCompare(bh));
}
