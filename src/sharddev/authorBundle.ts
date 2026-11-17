// oxlint-disable-next-line import/no-nodejs-modules -- Trusted author compilation runs in Node.
import { resolve } from 'node:path';
import { build, type PluginOption } from 'vite';

interface AuthorBundle { readonly code: string; readonly imports: readonly string[]; readonly dynamicImports: readonly string[] }
/** One executable Node author module. Fold absent DOM globals before browser-only
 * fallback imports can emit sidecar chunks; runtime/browser bundles retain their own profile. */
export async function bundleAuthor(project: string, file: string, plugins: PluginOption[] = []): Promise<AuthorBundle> {
  const result = await build({ configFile: false, define: { document: 'undefined', window: 'undefined' }, logLevel: 'silent', plugins: [{ name: 'wildshard-author-execution', api: { wildshardInputIdentity: 'execution' } }, ...plugins], build: { write: false, minify: false, lib: { entry: resolve(project, file), formats: ['es'], fileName: 'config' }, rolldownOptions: { external: [/^node:/u, 'assemblyscript/dist/asc.js'], output: { codeSplitting: false } } } });
  const built = Array.isArray(result) ? result[0] : result;
  if (built === undefined || !('output' in built) || (Array.isArray(result) && result.length !== 1)) throw new Error('config build produced unexpected output');
  const chunks = built.output.filter(out => out.type === 'chunk');
  if (chunks.length !== 1) throw new Error('config must bundle as one module');
  const chunk = chunks[0]; if (chunk === undefined) throw new Error('config chunk missing');
  return chunk;
}
