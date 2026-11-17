// oxlint-disable-next-line import/no-nodejs-modules -- The author build writes only declared generated files inside its project.
import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Confine authoring input and generated output paths to the project.
import { dirname, resolve, sep } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- Native consumers retain their existing embedded Wasm representation.
import { Buffer } from 'node:buffer';
import * as v from 'valibot';
import { compileScript } from './bake/compileScript';
import { generateDirectorAbi } from './directorAbi';
import { hashImmutableBytes } from './immutable';
import { readBoundedFile } from './sourceReader';

const relativePath = v.pipe(v.string(), v.maxLength(512), v.check(path => path.split('/').every(part => /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/u.test(part)), 'project-relative path'));
const jsonPath = v.pipe(relativePath, v.check(path => path.endsWith('.json'), 'JSON output path'));
/** Author-only generation declarations for compiled modules consumed by a trusted native plugin. No wire format changes. */
export const BehaviourBuildSchema: v.StrictObjectSchema<{ readonly version: v.LiteralSchema<1, undefined>; readonly modules: v.SchemaWithPipe<readonly [v.ArraySchema<v.StrictObjectSchema<{ readonly source: v.SchemaWithPipe<readonly [v.SchemaWithPipe<readonly [v.StringSchema<undefined>, v.MaxLengthAction<string, 512, undefined>, v.CheckAction<string, "project-relative path">]>, v.CheckAction<string, "authored behaviour .as source">]>; readonly director: v.OptionalSchema<v.SchemaWithPipe<readonly [v.SchemaWithPipe<readonly [v.StringSchema<undefined>, v.MaxLengthAction<string, 512, undefined>, v.CheckAction<string, "project-relative path">]>, v.CheckAction<string, "JSON output path">]>, undefined>; readonly maximumPages: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.IntegerAction<number, undefined>, v.MinValueAction<number, 1, undefined>, v.MaxValueAction<number, 64, undefined>]>; readonly assets: v.SchemaWithPipe<readonly [v.StringSchema<undefined>, v.MaxLengthAction<string, 512, undefined>, v.CheckAction<string, "project-relative path">]>; readonly bindings: v.ArraySchema<v.SchemaWithPipe<readonly [v.SchemaWithPipe<readonly [v.StringSchema<undefined>, v.MaxLengthAction<string, 512, undefined>, v.CheckAction<string, "project-relative path">]>, v.CheckAction<string, "JSON output path">]>, undefined>; readonly embedded: v.ArraySchema<v.StrictObjectSchema<{ readonly file: v.SchemaWithPipe<readonly [v.SchemaWithPipe<readonly [v.StringSchema<undefined>, v.MaxLengthAction<string, 512, undefined>, v.CheckAction<string, "project-relative path">]>, v.CheckAction<string, "JSON output path">]>; readonly generated: v.OptionalSchema<v.SchemaWithPipe<readonly [v.StringSchema<undefined>, v.MaxLengthAction<string, 2048, undefined>]>, undefined>; readonly raw: v.OptionalSchema<v.BooleanSchema<undefined>, undefined>; }, undefined>, undefined>; }, undefined>, undefined>, v.MinLengthAction<{ source: string; director?: string | undefined; maximumPages: number; assets: string; bindings: string[]; embedded: { file: string; generated?: string | undefined; raw?: boolean | undefined; }[]; }[], 1, undefined>, v.MaxLengthAction<{ source: string; director?: string | undefined; maximumPages: number; assets: string; bindings: string[]; embedded: { file: string; generated?: string | undefined; raw?: boolean | undefined; }[]; }[], 64, undefined>]>; }, undefined> = v.strictObject({
  version: v.literal(1),
  modules: v.pipe(v.array(v.strictObject({
    source: v.pipe(relativePath, v.check(path => path.startsWith('behaviour/') && path.endsWith('.as'), 'authored behaviour .as source')),
    director: v.optional(jsonPath),
    maximumPages: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(64)),
    assets: relativePath,
    bindings: v.array(jsonPath),
    embedded: v.array(v.strictObject({ file: jsonPath, generated: v.optional(v.pipe(v.string(), v.maxLength(2048))), raw: v.optional(v.boolean()) })),
  })), v.minLength(1), v.maxLength(64)),
});

/** Compile retained AssemblyScript author source with the pinned SDK compiler and name its immutable bytes by SHA256. */
export async function compileBehaviourModule(source: string, maximumPages = 1, sources: Readonly<Record<string, string>> = {}): Promise<{ bytes: Uint8Array; module: string }> {
  const bytes = await compileScript(source, { maximumPages, sources });
  return { bytes, module: hashImmutableBytes(bytes) };
}

/** Generate explicitly declared native modules before a project build. Missing declarations produce no writes.
 * Every source and output is confined to the project, and all modules compile before any output is published.
 * Historical embedded notices may be retained for byte identity; behaviour/build.json is the current regeneration authority.
 * An embedded row with raw:true writes only its hash and empty bytes; the module remains in its declared asset file. */
export async function buildBehaviourProject(project: string, options: { check?: boolean } = {}): Promise<readonly string[]> {
  const root = realpathSync(project), descriptor = resolve(root, 'behaviour/build.json');
  if (!existsSync(descriptor)) return [];
  const confined = (path: string): string => {
    const destination = resolve(root, path);
    let parent = destination;
    while (!existsSync(parent)) parent = dirname(parent);
    const actual = realpathSync(parent);
    if (actual !== root && !actual.startsWith(root + sep)) throw new Error('Behaviour build path resolves outside project');
    return destination;
  };
  confined('behaviour/build.json');
  const rows = v.parse(BehaviourBuildSchema, JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readBoundedFile(descriptor, 1_000_000))));
  const files = new Map<string, Uint8Array>();
  const put = (path: string, bytes: Uint8Array): void => {
    const destination = confined(path);
    if (files.has(destination)) throw new Error('Behaviour build declares a duplicate output');
    files.set(destination, bytes);
  };
  const json = (data: unknown): Uint8Array => new TextEncoder().encode(`${JSON.stringify(data, null, 2)}\n`);
  for (const row of rows.modules) {
    const source = new TextDecoder('utf-8', { fatal: true }).decode(readBoundedFile(confined(row.source), 1_000_000));
    const sources: Readonly<Record<string, string>> = row.director === undefined ? {} : {
      'wildshard-director.ts': generateDirectorAbi(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readBoundedFile(confined(row.director), 1_000_000)))),
    };
    const compiled = await compileBehaviourModule(source, row.maximumPages, sources);
    put(`${row.assets}/${compiled.module}`, compiled.bytes);
    for (const path of row.bindings) {
      const data = v.parse(v.record(v.string(), v.unknown()), JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readBoundedFile(confined(path), 1_000_000))));
      put(path, json({ ...data, module: compiled.module }));
    }
    for (const embedded of row.embedded) put(embedded.file, json({ ...(embedded.generated === undefined ? {} : { generated: embedded.generated }), module: compiled.module, bytes: embedded.raw === true ? '' : Buffer.from(compiled.bytes).toString('base64') }));
  }
  if (options.check === true) {
    for (const [path, bytes] of files) {
      if (!existsSync(path) || hashImmutableBytes(readBoundedFile(path, 16_000_000)) !== hashImmutableBytes(bytes)) throw new Error(`Behaviour build output is stale: ${path.slice(root.length + 1)}`);
    }
  } else for (const [path, bytes] of files) { confined(path.slice(root.length + 1)); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes); }
  return [...files.keys()].map(path => path.slice(root.length + 1));
}
