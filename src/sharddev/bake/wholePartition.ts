import * as v from 'valibot';

/** Build-time topology ordinals and the optional shared grid emitted by the SDK whole-shape producer. */
export interface WholePartitionRows {
  id: string; vertices: number[]; triangles: number[]; vertexCount: number; indexCount: number; index: 'none' | 'u16' | 'u32';
  grid?: { origin: [number, number, number]; step: number };
}
/** Portable source channels accepted by an offline float-channel reconstruction. */
export interface WholeSourceChannel {
  semantic: string; storage: 'Float32Array' | 'Int16Array' | 'Int8Array' | 'Uint8Array'; normalized: boolean; itemSize: number;
}
const ordinal = v.pipe(v.number(), v.integer(), v.minValue(0));
const ordinals = v.union([v.array(ordinal), v.pipe(v.strictObject({ runs: v.array(ordinal) }),
  v.check(row => row.runs.length % 2 === 0 && row.runs.every((n, i) => i % 2 === 0 || n > 0)
    && row.runs.reduce((sum, n, i) => sum + (i % 2 === 1 ? n : 0), 0) <= 1 << 24),
  v.transform(row => { const result: number[] = []; for (let i = 0; i < row.runs.length; i += 2) {
    const start = row.runs[i] ?? 0, count = row.runs[i + 1] ?? 0;
    for (let k = 0; k < count; k++) result.push(start + k);
  } return result; }))]);
const partition = v.strictObject({ id: v.string(), vertices: ordinals, triangles: ordinals,
  vertexCount: v.pipe(ordinal, v.minValue(1)), indexCount: ordinal, index: v.picklist(['none', 'u16', 'u32']),
  grid: v.exactOptional(v.strictObject({ origin: v.tuple([v.pipe(v.number(), v.finite()), v.pipe(v.number(), v.finite()), v.pipe(v.number(), v.finite())]),
    step: v.pipe(v.number(), v.minValue(1 / 4096), v.maxValue(1)) })) });
const channels = v.record(v.string(), v.pipe(v.strictObject({ semantic: v.string(), storage: v.picklist(['Float32Array', 'Int16Array', 'Int8Array', 'Uint8Array']),
  normalized: v.boolean(), itemSize: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(4)) }),
v.check(row => row.storage === 'Float32Array' ? !row.normalized
  : row.storage === 'Int16Array' ? row.semantic === 'POSITION' && row.itemSize === 3 && !row.normalized
    : row.storage === 'Int8Array' ? row.semantic === 'NORMAL' && row.itemSize === 3 && row.normalized
      : row.semantic === 'COLOR_0' && row.normalized)));

/** Strict topology/grid intake; retains the original bounded ordinal-run expansion. */
export function parseWholePartition(input: unknown): WholePartitionRows { return v.parse(partition, input); }
/** Only the SDK's portable native/compact float-reconstruction channel forms. */
export function parseWholeSourceChannels(input: unknown): Record<string, WholeSourceChannel> { return v.parse(channels, input); }

/** Select the complete file closure for named original shapes. A selected file
 * may contain another shape's partitions; all of that shape's files join too,
 * so the ordinary whole reader retains every completeness/conflict refusal.
 * Only metadata is inspected here. Cost admission and runtime decoding still
 * validate the original, unchanged GLBs and every selected topology ordinal. */
export function wholePartitionFiles(files: readonly string[], read: (file: string) => Uint8Array, required: readonly string[]): string[] {
  if (files.length > 4096 || required.length === 0 || required.length > 1024 || new Set(files).size !== files.length
    || new Set(required).size !== required.length || required.some(id => id.length === 0)) throw new Error('Invalid whole source selection');
  const names = new Map<string, Set<string>>(), present = new Set<string>();
  for (const file of files) {
    const bytes = read(file);
    if (bytes.length < 20 || bytes.length > 25_000_000) throw new Error('Whole source GLB wire cap');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), size = view.getUint32(12, true);
    if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.length
      || view.getUint32(16, true) !== 0x4e4f534a || size > 2_000_000 || size % 4 !== 0 || 20 + size > bytes.length) throw new Error('Invalid whole source GLB header');
    const input: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(20, 20 + size)));
    const document = v.parse(v.object({ asset: v.object({ version: v.literal('2.0') }), nodes: v.optional(v.pipe(v.array(v.object({ extras: v.optional(v.unknown()) })), v.maxLength(10_000)), []) }), input);
    const ids = new Set<string>();
    for (const node of document.nodes) {
      const extras = node.extras;
      if (typeof extras !== 'object' || extras === null || Array.isArray(extras) || !Object.hasOwn(extras, 'wholePartition')) continue;
      const row = parseWholePartition(Reflect.get(extras, 'wholePartition'));
      if (row.id.length === 0 || row.id.length > 512) throw new Error('Invalid whole source shape identity');
      ids.add(row.id); present.add(row.id);
    }
    names.set(file, ids);
  }
  for (const id of required) if (!present.has(id)) throw new Error(`Missing whole source shape: ${id}`);
  const wanted = new Set(required), selected = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const [file, ids] of names) {
      if (selected.has(file) || ![...ids].some(id => wanted.has(id))) continue;
      selected.add(file); for (const id of ids) wanted.add(id); changed = true;
    }
  }
  return files.filter(file => selected.has(file));
}
