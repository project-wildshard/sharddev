import { registeredJsonContract } from '@wildshard/format/registeredJson';
import type { ScriptContract } from '@wildshard/format/scriptContract';
import type { JsonSchema } from '@valibot/to-json-schema';
import type { AssetCost } from '@wildshard/format/product';
import type { OutputFile } from '@wildshard/format/outputIndex';
import { AdmissionServerSchema, serverFilePath, type ServerFile } from '@wildshard/format/admissionServer';
import { NATIVE_ASSEMBLY_DATA_SCHEMA, NATIVE_ASSEMBLY_FILE, NATIVE_ASSEMBLY_SCHEMA, type NativeAssemblyPlan as AssemblyPlan } from '@wildshard/format/nativeAssembly';
import { validatePlatformFile } from '@wildshard/format/platformFileFamilies';
import { outputBlobKind } from '@wildshard/format/productValidation';
import { parse } from 'valibot';
import { encodeCanonicalJson, hashImmutableBytes } from './immutable';
import { nameBlobBytes } from './blobBytes';
import { validateDefinedJson } from './sections';
import { compileGltfSource } from './bake/gltfSource';
import { compressGlb } from './bake/glbCompression';

/** Named assets, including lazily read JSON bakes, occupy kind-specific content-addressed paths. */
export type NamedBlobKind = OutputFile['kind'];
/** Conservative owner costs may exceed measured minima; undersized claims refuse before emission. */
export interface BlobOptions extends Partial<AssetCost> { readonly script?: ScriptContract; readonly critical?: boolean; readonly dependencies?: readonly string[]; readonly jsonSchema?: JsonSchema | Readonly<Record<string, unknown>>;
  /** The one device tier that fetches this file (absent: both). The other tier's selection drops it, as it drops a
   *  tiered tile or texture entry; a critical file serves both tiers and takes no tier. */
  readonly tier?: 'phone' | 'desktop';
  /** The payload this file is one variant of (its texture modes' alternatives: image, KTX2, ASTC, ...); a device
   *  fetches one variant, so each tier's selection keeps only its largest variant (the worst case it can fetch). */
  readonly variantOf?: string }
/** Build-only meshopt candidate, kept only if gzip-9 does not grow; compressed input needs no option. */
export interface BlobSourceOptions extends BlobOptions { readonly meshopt?: boolean }
/** One owned byte array and the exact index entry that names it. */
export interface NamedBlob { readonly file: OutputFile; readonly bytes: Uint8Array; readonly script?: ScriptContract }
/** The writer merges declarations into admission before emitting these immutable assets. */
export interface EmittedBlobs { readonly files: readonly OutputFile[]; readonly assets: ReadonlyMap<string, Uint8Array> }

/** Admit actual bytes, hash their owned copy and attach a stable logical name. No author-provided hash or path is used.
 * Binary channel-specific and cross-reference admission still belongs to the section's defining reader/product build. */
export function nameBlob(name: string, kind: NamedBlobKind, input: Uint8Array, options: BlobOptions = {}): NamedBlob {
  if (registeredJsonContract(name) !== undefined) {
    if (kind !== 'json' || options.jsonSchema === undefined) throw new Error('Registered JSON requires its defining schema');
    return nameBlobBytes(name, kind, input, options, (schema, bytes) => validateDefinedJson(schema, bytes, name));
  }
  return nameBlobBytes(name, kind, input, options, validateDefinedJson);
}

const MAX_BYTES = 25_000_000;

/** Whether a meshopt-packed GLB gzips (level 9) no larger than its source: the download encoding decides, as source intake
 *  does. */
export async function meshoptNoLarger(packed: Uint8Array, input: Uint8Array): Promise<boolean> {
  // oxlint-disable-next-line import/no-nodejs-modules -- Compare actual download encoding, as source intake does.
  const compression = await import('node:zlib');
  return compression.gzipSync(packed, { level: 9 }).length <= compression.gzipSync(input, { level: 9 }).length;
}
// CI6: one answer per packed / source pair and comparison a process (Pine names some GLBs more than once); identical bytes
// need no gzip
const choices = new WeakMap<typeof meshoptNoLarger, Map<string, boolean>>();

/** Name a GLB the way a `meshopt: true` blob source is named: losslessly meshopt-packed when that gzips (level 9) no
 *  larger, otherwise as given. For a program that builds its GLB in memory (GR8) rather than reading a source file.
 *  `noLarger` is the comparison (a build context's memoised `meshoptNoLarger`, when it has one). */
export async function nameMeshoptBlob(name: string, input: Uint8Array, options: BlobOptions = {}, noLarger: typeof meshoptNoLarger = meshoptNoLarger): Promise<NamedBlob> {
  const packed = compressGlb(input), key = `${hashImmutableBytes(packed)}:${hashImmutableBytes(input)}`;
  const known = choices.get(noLarger) ?? new Map<string, boolean>();
  choices.set(noLarger, known);
  let pick = known.get(key);
  if (pick === undefined) {
    pick = packed.length === input.length && packed.every((byte, i) => byte === input[i]) ? true : await noLarger(packed, input);
    known.set(key, pick);
  }
  return nameBlob(name, 'glb', pick ? packed : input, options);
}

/** Read only project-contained files. Textual .gltf sources compile with bounded local/embedded resources into GLB;
 * an escape (including through a symlink), remote URI or unsupported extension refuses before publication. */
export async function readNamedBlob(project: string, name: string, source: string, kind: NamedBlobKind, options: BlobSourceOptions = {}): Promise<NamedBlob> {
  const [fileSystem, pathTools, { readBoundedFile }] = await Promise.all([
    // oxlint-disable-next-line import/no-nodejs-modules -- Only explicit CLI file intake loads filesystem access.
    import('node:fs'),
    // oxlint-disable-next-line import/no-nodejs-modules -- Keep config-only nameBlob imports free of file services.
    import('node:path'),
    import('./sourceReader'),
  ]);
  const root = fileSystem.realpathSync(project);
  const contained = (base: string, path: string): string => {
    const relative = decodeURIComponent(path);
    if (pathTools.isAbsolute(relative) || relative.includes('\\') || (/[:?#]/u.test(relative) || relative.includes(String.fromCodePoint(0)))) throw new Error('Blob source must be a local relative path');
    const file = fileSystem.realpathSync(pathTools.resolve(base, relative));
    if (!file.startsWith(`${root}${pathTools.sep}`)) throw new Error('Blob source escapes its project');
    return file;
  };
  const file = contained(root, source), bytes = readBoundedFile(file, MAX_BYTES);
  if (options.meshopt !== undefined && typeof options.meshopt !== 'boolean') throw new Error('Invalid meshopt compression option');
  if (options.meshopt === true && kind !== 'glb') throw new Error('Meshopt compression requires a GLB blob');
  const admit = (value: Uint8Array): Promise<NamedBlob> | NamedBlob =>
    options.meshopt === true ? nameMeshoptBlob(name, value, options) : nameBlob(name, kind, value, options);
  if (source.toLowerCase().endsWith('.gltf')) {
    if (kind !== 'glb') throw new Error('Text glTF must compile to a GLB blob');
    return admit(await compileGltfSource(bytes, uri => readBoundedFile(contained(pathTools.dirname(file), uri), MAX_BYTES)));
  }
  return admit(bytes);
}

/** Revalidate every owned entry before returning sorted declarations/assets. One hash has one logical name;
 * duplicate names, aliases and post-admission mutation refuse rather than producing ambiguous index entries. */
export function emitNamedBlobs(blobs: readonly NamedBlob[]): EmittedBlobs {
  const files: OutputFile[] = [], assets = new Map<string, Uint8Array>(), names = new Set<string>();
  for (const row of blobs) {
    if (row.file.name === undefined) throw new Error('Named blob needs its logical name');
    const checked = nameBlob(row.file.name, row.file.kind, row.bytes, { ...row.file, ...(row.script === undefined ? {} : { script: row.script }) });
    if (encodeCanonicalJson(checked.file) !== encodeCanonicalJson(row.file)) throw new Error('Named blob changed after admission');
    if (names.has(row.file.name) || assets.has(row.file.hash)) throw new Error('Duplicate blob name or content reference');
    names.add(row.file.name); files.push(checked.file); assets.set(row.file.hash, checked.bytes);
  }
  files.sort((a, b) => (a.name ?? '') < (b.name ?? '') ? -1 : (a.name ?? '') > (b.name ?? '') ? 1 : 0);
  return { files, assets: new Map([...assets].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) };
}

/** J91: one server-class file and its bytes, ready for `ProjectOutput.server`. */
export interface ServerBlob { readonly file: ServerFile; readonly bytes: Uint8Array }
/** Name a server-class file: registered platform JSON by its defining schema, or binary bytes. The client never sees it. */
export function serverBlob(name: string, input: { readonly bytes: Uint8Array } | { readonly schema: string; readonly value: unknown }): ServerBlob {
  if ('bytes' in input) {
    const bytes = Uint8Array.from(input.bytes), kind = outputBlobKind('binary', bytes);
    if (kind !== 'bin' && kind !== 'tile') throw new Error('Server binary must be a bin or tile');
    const hash = hashImmutableBytes(bytes);
    return { bytes, file: parse(AdmissionServerSchema, [{ name, path: serverFilePath(kind, hash), hash, bytes: bytes.length, kind }])[0] ?? missingServerRow() };
  }
  if (validatePlatformFile(name, input.schema, input.value) === undefined) throw new Error(`Unregistered named JSON: ${name}`);
  const bytes = new TextEncoder().encode(encodeCanonicalJson(input.value)), hash = hashImmutableBytes(bytes);
  return { bytes, file: parse(AdmissionServerSchema, [{ name, path: serverFilePath('json', hash), hash, bytes: bytes.length, kind: 'json', schema: input.schema }])[0] ?? missingServerRow() };
}
function missingServerRow(): never { throw new Error('Missing server file row'); }
/** J90: a native world's plan, as a generator writes it. */
export type NativeAssemblyPlan = AssemblyPlan;
/** A native world's server class: its plan, then the JSON rows and binary files it names. */
export function nativeAssemblyFiles(plan: NativeAssemblyPlan, rows: ReadonlyMap<string, unknown>, binary: ReadonlyMap<string, Uint8Array> = new Map()): ServerBlob[] {
  return [serverBlob(NATIVE_ASSEMBLY_FILE, { schema: NATIVE_ASSEMBLY_SCHEMA, value: plan }),
    ...[...rows].map(([name, value]) => serverBlob(name, { schema: NATIVE_ASSEMBLY_DATA_SCHEMA, value })), ...[...binary].map(([name, bytes]) => serverBlob(name, { bytes }))];
}
