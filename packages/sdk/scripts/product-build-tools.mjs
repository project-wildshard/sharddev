import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as v from 'valibot';

const Product = v.pipe(v.string(), v.regex(/^[a-z_][a-z0-9_-]*$/u));
const Registry = v.pipe(v.custom(value => value !== null && typeof value === 'object' && !Array.isArray(value)),
  v.record(Product, v.pipe(v.array(v.literal('basis')), v.minLength(1), v.maxLength(1))));
/** The pinned Basis preparer, run under the engine's bake loader (`loader`, a URL). SDK-SPLIT SP13g: the sdk does not depend
 * on the engine, so a resolve from here fails in an installed shard repo (Sky Reach's far-reach, the one product that needs
 * Basis); dev, which runs the engine, resolves the loader and hands it in.
 * @param {string} loader @returns {() => Promise<unknown>} */
export function basisPreparer(loader) {
  return () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', fileURLToPath(loader), fileURLToPath(new URL('prepare-basis-tool.mjs', import.meta.url))],
      { cwd: resolvePath(import.meta.dirname, '..'), stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code, signal) => code === 0 ? resolve(undefined) : reject(new Error(`Pinned Basis prerequisite exited ${String(code ?? signal)}`)));
  });
}
/** @type {Readonly<Record<'basis',()=>Promise<unknown>>>} */
const refuse = { basis: () => Promise.reject(new Error('Basis needs the engine bake loader: pass basisPreparer(<loader URL>) as the port')) };

/** Await only selected products' explicit native prerequisites before starting CPU-heavy workers.
 * Registry absence, unknown tools and failed checked preparation refuse the phase.
 * @param {readonly string[]} products
 * @param {unknown} [input]
 * @param {Readonly<Record<'basis',()=>Promise<unknown>>>} [ports]
 * @returns {Promise<readonly 'basis'[]>} */
export async function prepareProductBuildTools(products,
  input = JSON.parse(readFileSync(new URL('product-build-tools.json', import.meta.url), 'utf8')), ports = refuse) {
  const selected = v.parse(v.array(Product), products), registry = v.parse(Registry, input);
  const tools = [...new Set(selected.flatMap(product => registry[product] ?? []))].sort();
  const started = performance.now();
  for (const tool of tools) await ports[tool]();
  if (tools.length > 0) console.info(`Product build prerequisites: ${tools.join(', ')} ready in ${Math.round(performance.now() - started)} ms (before product workers)`);
  return tools;
}
