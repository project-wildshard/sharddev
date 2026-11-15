/** Why `source` may not be imported from `filename` under a shard's author folders, or null when it may. */
export function generatorImportViolation(filename: string, source: string | null, required?: boolean): string | null;
declare const plugin: { readonly meta: { readonly name: string }; readonly rules: Readonly<Record<string, object>> };
export default plugin;
/** SHARD-SOURCE AP39: why importing `source` from `filename` is a hand-written graph, or null when it is not (or `allow` names the file). */
export function handGraphImport(filename: string, source: string | null, allow?: readonly string[]): string | null;
