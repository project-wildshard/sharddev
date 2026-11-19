// oxlint-disable-next-line import/no-nodejs-modules -- Resolve the native Node author's entry.
import { resolve } from 'node:path';
import { bundle, type BundleOptions } from '@wildshard/sdk/internal/bundle';

interface AuthorBundle {
  readonly code: string;
  readonly imports: readonly string[];
  readonly dynamicImports: readonly string[];
}

/** Fold the absent Node author globals `document` and `window` before bundling fallback imports. */
export async function bundleAuthor(project: string, file: string, plugins: BundleOptions['plugins'] = []): Promise<AuthorBundle> {
  const built = await bundle({
    entry: resolve(project, file),
    fileName: 'config',
    define: { document: 'undefined', window: 'undefined' },
    plugins: [{ name: 'wildshard-author-execution', api: { wildshardInputIdentity: 'execution' } }, ...plugins],
    external: [/^node:/u, 'assemblyscript/dist/asc.js'],
    codeSplitting: false,
  });
  const chunks = built.output.filter(out => out.type === 'chunk');
  const [chunk] = chunks;
  if (chunks.length !== 1 || chunk === undefined) throw new Error('config must bundle as one module');
  return chunk;
}
