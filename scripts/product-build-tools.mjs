import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as v from 'valibot';

const Product = v.pipe(v.string(), v.regex(/^[a-z_][a-z0-9_-]*$/u));
const Registry = v.pipe(v.custom(value => value !== null && typeof value === 'object' && !Array.isArray(value)),
  v.record(Product, v.pipe(v.array(v.literal('basis')), v.minLength(1), v.maxLength(1))));
const preparers = { basis: () => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['--import', fileURLToPath(import.meta.resolve('@wildshard/engine/scripts/bake-loader.mjs')),
    fileURLToPath(new URL('prepare-basis-tool.mjs', import.meta.url))], { cwd: resolvePath(import.meta.dirname, '..'), stdio: 'inherit' });
  child.on('error', reject);
  child.on('close', (code, signal) => code === 0 ? resolve(undefined) : reject(new Error(`Pinned Basis prerequisite exited ${String(code ?? signal)}`)));
}) };

/** Await only selected products' explicit native prerequisites before starting CPU-heavy workers.
 * Registry absence, unknown tools and failed checked preparation refuse the phase.
 * @param {readonly string[]} products
 * @param {unknown} [input]
 * @param {Readonly<Record<'basis',()=>Promise<unknown>>>} [ports]
 * @returns {Promise<readonly 'basis'[]>} */
export async function prepareProductBuildTools(products,
  input = JSON.parse(readFileSync(new URL('product-build-tools.json', import.meta.url), 'utf8')), ports = preparers) {
  const selected = v.parse(v.array(Product), products), registry = v.parse(Registry, input);
  const tools = [...new Set(selected.flatMap(product => registry[product] ?? []))].sort();
  const started = performance.now();
  for (const tool of tools) await ports[tool]();
  if (tools.length > 0) console.info(`Product build prerequisites: ${tools.join(', ')} ready in ${Math.round(performance.now() - started)} ms (before product workers)`);
  return tools;
}
