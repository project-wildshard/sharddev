/** Diagnose executable file/compiler dependencies before a bundled declaration is evaluated as a data URL. */
export function assertConfigBoundary(imports: readonly string[]): void {
  const generatorImports = imports.filter(name =>
    /^(?:node:)?fs(?:\/promises)?$/u.test(name) || name === 'node:module' || name === 'binaryen' || name.startsWith('assemblyscript'));
  if (generatorImports.length > 0) throw new Error(`shard.config.ts must use injected build capabilities for file access (${generatorImports.join(', ')}). Read declared inputs through ctx.cached; script compiler dependencies require a separate build adapter.`);
}
