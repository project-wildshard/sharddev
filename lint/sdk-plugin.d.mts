/** Why `source` may not be imported from `filename` under a shard's author folders, or null when it may. */
export function generatorImportViolation(filename: string, source: string | null, required?: boolean): string | null;
declare const plugin: { readonly meta: { readonly name: string }; readonly rules: Readonly<Record<string, object>> };
export default plugin;
