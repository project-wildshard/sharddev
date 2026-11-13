// oxlint-disable-next-line import/no-nodejs-modules -- Author admission compares complete byte ranges with Node's native byte comparator.
import { Buffer } from 'node:buffer';
import { hashImmutableBytes } from './immutable';

/** A private owned snapshot and its computed SHA-256. Only copies leave the handle. */
export interface ImmutableAsset {
  readonly hash: string;
  readonly byteLength: number;
  readonly copy: () => Uint8Array<ArrayBuffer>;
}
interface Snapshot { readonly bytes: Uint8Array<ArrayBuffer>; readonly hash: string }
const snapshots = new WeakMap<ImmutableAsset, Snapshot>();
const aliases = new WeakMap<Uint8Array, ImmutableAsset>();
function arrayAccessor(name: 'byteLength' | 'buffer'): (input: Uint8Array) => unknown {
  const prototype: object | null = Object.getPrototypeOf(Uint8Array.prototype);
  if (prototype === null) throw new Error('Missing native typed array prototype');
  const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
  const getter: unknown = descriptor === undefined ? undefined : Reflect.get(descriptor, 'get');
  if (typeof getter !== 'function') throw new Error('Missing native typed array accessor');
  return (input: Uint8Array): unknown => Reflect.apply(getter, input, []);
}
const byteLength = arrayAccessor('byteLength'), buffer = arrayAccessor('buffer');
function ownedBytes(input: Uint8Array): Uint8Array<ArrayBuffer> {
  const length = byteLength(input);
  if (typeof length !== 'number') throw new Error('Invalid native typed array length');
  const bytes = new Uint8Array(length);
  // Native TypedArray.set ignores an authored iterator and preserves view offsets.
  bytes.set(input); return bytes;
}
function unshared(input: Uint8Array): boolean { return buffer(input) instanceof ArrayBuffer; }

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return Buffer.compare(a, b) === 0;
}
function snapshotOf(bytes: Uint8Array): { readonly handle: ImmutableAsset; readonly snapshot: Snapshot } | undefined {
  // A shared buffer can change concurrently after comparison. Never cache its mutable view.
  if (!unshared(bytes)) return undefined;
  const handle = aliases.get(bytes), snapshot = handle === undefined ? undefined : snapshots.get(handle);
  return handle !== undefined && snapshot !== undefined && sameBytes(bytes, snapshot.bytes) ? { handle, snapshot } : undefined;
}

/** Capture exact private bytes before computing their identity. Mutable aliases
 * are checked in full on every reuse; changed bytes get a newly computed hash. */
export function immutableAsset(input: Uint8Array): ImmutableAsset {
  if (!(input instanceof Uint8Array)) throw new Error('Asset ownership needs Uint8Array bytes');
  const previous = snapshotOf(input);
  if (previous !== undefined) return previous.handle;
  const bytes = ownedBytes(input), snapshot = { bytes, hash: hashImmutableBytes(bytes) };
  const handle: ImmutableAsset = Object.freeze({ hash: snapshot.hash, byteLength: bytes.byteLength,
    copy: (): Uint8Array<ArrayBuffer> => {
      const owned = ownedBytes(snapshot.bytes); aliases.set(owned, handle); return owned;
    } });
  snapshots.set(handle, snapshot);
  if (unshared(input)) aliases.set(input, handle);
  return handle;
}

/** Own a detached copy while carrying the snapshot's computed identity. */
export function copyAssetBytes(input: Uint8Array): Uint8Array<ArrayBuffer> { return immutableAsset(input).copy(); }

/** The author's format-admission hash port. Every call checks the complete
 * mutable view; shared/unknown bytes retain actual cryptographic hashing. */
export function hashAssetBytes(input: Uint8Array): string {
  if (!(input instanceof Uint8Array)) throw new Error('Asset ownership needs Uint8Array bytes');
  return unshared(input) ? immutableAsset(input).hash : hashImmutableBytes(input);
}

/** Certify freshly read disk/pack bytes only after exact byte equality with a
 * genuine private snapshot. Metadata, object shape and expected hash alone
 * never authorize reuse; uncertified bytes take normal SHA-256 admission. */
export function verifyAssetBytes(input: Uint8Array, expected: string, known?: ImmutableAsset): boolean {
  const snapshot = known === undefined ? undefined : snapshots.get(known);
  if (known !== undefined && snapshot !== undefined && snapshot.hash === expected && unshared(input) && sameBytes(input, snapshot.bytes)) {
    aliases.set(input, known); return true;
  }
  return hashAssetBytes(input) === expected;
}

/** One writer's immutable handles, never a process-wide content lookup or an IO cache. */
export function assetHandles(values: Iterable<Uint8Array>): ReadonlyMap<string, ImmutableAsset> {
  const handles = new Map<string, ImmutableAsset>();
  for (const bytes of values) { const handle = immutableAsset(bytes); handles.set(handle.hash, handle); }
  return handles;
}
