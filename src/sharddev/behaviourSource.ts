import * as v from 'valibot';
import { isJsonData } from '@wildshard/format/json';
import { compileScript } from './bake/compileScript';
import { hashImmutableBytes } from './immutable';

const path = v.pipe(v.string(), v.maxLength(512), v.check(value => value.split('/').every(part => /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/u.test(part)), 'project-relative source path'));
/** Build-only source declarations. References use `script:<id>` and become immutable admitted Wasm hashes. */
export const BehaviourSourceSchema: v.SchemaWithPipe<readonly [
    v.ArraySchema<v.StrictObjectSchema<{
        readonly id: v.SchemaWithPipe<readonly [
            v.StringSchema<undefined>,
            v.RegexAction<string, undefined>,
            v.MaxLengthAction<string, 128, undefined>
        ]>;
        readonly source: v.SchemaWithPipe<readonly [
            v.SchemaWithPipe<readonly [
                v.StringSchema<undefined>,
                v.MaxLengthAction<string, 512, undefined>,
                v.CheckAction<string, "project-relative source path">
            ]>,
            v.CheckAction<string, "AssemblyScript .as source">
        ]>;
        readonly maximumPages: v.OptionalSchema<v.SchemaWithPipe<readonly [
            v.NumberSchema<undefined>,
            v.IntegerAction<number, undefined>,
            v.MinValueAction<number, 1, undefined>,
            v.MaxValueAction<number, 64, undefined>
        ]>, 2>;
        readonly sources: v.OptionalSchema<v.RecordSchema<v.SchemaWithPipe<readonly [
            v.StringSchema<undefined>,
            v.RegexAction<string, undefined>
        ]>, v.SchemaWithPipe<readonly [
            v.StringSchema<undefined>,
            v.MaxLengthAction<string, 512, undefined>,
            v.CheckAction<string, "project-relative source path">
        ]>, undefined>, NonNullable<unknown>>;
    }, undefined>, undefined>,
    v.MaxLengthAction<{
        id: string;
        source: string;
        maximumPages: number;
        sources: Record<string, string>;
    }[], 64, undefined>,
    v.CheckAction<{
        id: string;
        source: string;
        maximumPages: number;
        sources: Record<string, string>;
    }[], "unique behaviour source ids">
]> = v.pipe(v.array(v.strictObject({
  id: v.pipe(v.string(), v.regex(/^[a-z][a-z0-9.-]*$/u), v.maxLength(128)),
  source: v.pipe(path, v.check(value => value.endsWith('.as'), 'AssemblyScript .as source')),
  maximumPages: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(64)), 2),
  sources: v.optional(v.record(v.pipe(v.string(), v.regex(/^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.ts$/u)), path), {}),
})), v.maxLength(64), v.check(rows => new Set(rows.map(row => row.id)).size === rows.length, 'unique behaviour source ids'));

/** Compile explicitly listed source files in memory with pinned portable tools. No project compiler script executes.
 * The trusted loader bounds and confines every read. Symbolic references are replaced only in module/script fields.
 * Server scripts are critical and their three admitted memory copies are charged before geometry admission. */
export async function compileBehaviourSource(input: unknown, declaration: unknown, read: (path: string) => string): Promise<{ declaration: unknown; assets: Map<string, Uint8Array> }> {
  if (!isJsonData(input) || !isJsonData(declaration) || typeof declaration !== 'object' || declaration === null || Array.isArray(declaration)) throw new Error('Behaviour source needs plain JSON declarations');
  const rows = v.parse(BehaviourSourceSchema, input), assets = new Map<string, Uint8Array>(), refs = new Map<string, string>();
  const files: object[] = []; let wire = 0, resident = 0;
  for (const row of rows) {
    const sources = Object.fromEntries(Object.entries(row.sources).map(([name, sourcePath]) => [name, read(sourcePath)]));
    let bytes: Uint8Array;
    try { bytes = await compileScript(read(row.source), { maximumPages: row.maximumPages, sources }); }
    catch (error) { throw new Error(`AssemblyScript ${row.id} (${row.source}): ${error instanceof Error ? error.message : String(error)}`, { cause: error }); }
    const hash = hashImmutableBytes(bytes); refs.set(`script:${row.id}`, hash);
    if (assets.has(hash)) continue;
    assets.set(hash, bytes); wire += bytes.length; resident += bytes.length + row.maximumPages * 65536 * 3;
    files.push({ hash, kind: 'wasm', compressed: bytes.length, decoded: bytes.length, gpu: 0, triangles: 0, draws: 0, dependencies: [], critical: true });
  }
  const resolveRef = (value: string): string => {
    if (!value.startsWith('script:')) return value;
    const hash = refs.get(value); if (hash === undefined) throw new Error(`Unknown authored ${value}`); return hash;
  };
  const replace = (value: unknown, key = ''): unknown => {
    if (typeof value === 'string' && (key === 'module' || key === 'scripts')) return resolveRef(value);
    if (Array.isArray(value)) return value.map(row => replace(row, key));
    if (typeof value === 'object' && value !== null) return Object.fromEntries(Object.entries(value).map(([name, row]) => [name, replace(row, name)]));
    return value;
  };
  const data = replace(declaration);
  if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Error('Behaviour config needs object data');
  const record = (value: unknown): Record<string, unknown> => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Behaviour config needs declared budgets'); return value as Record<string, unknown>;
  };
  const base = record(data), budgets = record(base['budgets']), sim = record(budgets['sim']), server = record(base['serverBudget']);
  const oldFiles = v.parse(v.array(v.unknown()), base['files']), critical = v.parse(v.array(v.string()), base['critical']);
  return { declaration: { ...base, files: [...oldFiles, ...files], critical: [...new Set([...critical, ...assets.keys()])],
    budgets: { ...budgets, sim: { resident: v.parse(v.number(), sim['resident']) + resident, compressed: v.parse(v.number(), sim['compressed']) + wire } },
    serverBudget: { ...server, memory: v.parse(v.number(), server['memory']) + resident } }, assets };
}
