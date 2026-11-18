/** Await each selected native tool exactly once; failed preparation refuses before worker startup. */
export function prepareProductBuildTools(products: readonly string[], input?: unknown,
  ports?: Readonly<Record<'basis', () => Promise<unknown>>>): Promise<readonly 'basis'[]>;
/** The pinned Basis preparer, run under the engine bake loader `loader` (a URL) that dev resolves. */
export function basisPreparer(loader: string): () => Promise<unknown>;
