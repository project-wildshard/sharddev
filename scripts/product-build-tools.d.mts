/** Await each selected native tool exactly once; failed preparation refuses before worker startup. */
export function prepareProductBuildTools(products: readonly string[], input?: unknown,
  ports?: Readonly<Record<'basis', () => Promise<unknown>>>): Promise<readonly 'basis'[]>;
