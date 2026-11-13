import { hashImmutableBytes } from './immutable';

/** Data-only result of the explicit host factory, never an admission certificate. */
export interface OwnedAsset { readonly bytes: Uint8Array; readonly hash: string }
interface Snapshot { readonly bytes: Uint8Array<ArrayBuffer>; readonly hash: string }
const aliases = new WeakMap<Uint8Array, Snapshot>();
const slot = Symbol.for('wildshard.sdk.asset-owner.v1');
function accessor(name: 'byteLength' | 'buffer' | 'byteOffset'): (input: Uint8Array) => unknown {
  const prototype: object | null = Object.getPrototypeOf(Uint8Array.prototype);
  if (prototype === null) throw new Error('Missing native typed array prototype');
  const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
  const getter: unknown = descriptor === undefined ? undefined : Reflect.get(descriptor, 'get');
  if (typeof getter !== 'function') throw new Error('Missing native typed array accessor');
  return (input: Uint8Array): unknown => Reflect.apply(getter, input, []);
}
const byteLength = accessor('byteLength'), buffer = accessor('buffer'), byteOffset = accessor('byteOffset');
const resizableDescriptor = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable');
const resizableGetter: unknown = resizableDescriptor === undefined ? undefined : Reflect.get(resizableDescriptor, 'get');
function fixed(input: unknown): input is ArrayBuffer {
  return input instanceof ArrayBuffer && Object.getPrototypeOf(input) === ArrayBuffer.prototype
    && (typeof resizableGetter !== 'function' || Reflect.apply(resizableGetter, input, []) === false);
}
function copy(input: Uint8Array): Uint8Array<ArrayBuffer> {
  const length = byteLength(input);
  if (typeof length !== 'number') throw new Error('Invalid native byte length');
  const bytes = new Uint8Array(length); bytes.set(input); return bytes;
}
function equal(a: Uint8Array, b: Uint8Array): boolean {
  const length = byteLength(a);
  if (typeof length !== 'number' || length !== byteLength(b)) return false;
  if (length >= 32 && Object.getPrototypeOf(a) === Uint8Array.prototype && Object.getPrototypeOf(b) === Uint8Array.prototype) {
    const left = buffer(a), right = buffer(b);
    if (fixed(left) && fixed(right)) {
      const aOffset = byteOffset(a), bOffset = byteOffset(b);
      if (typeof aOffset === 'number' && typeof bOffset === 'number' && aOffset % 4 === 0 && bOffset % 4 === 0) {
        const count = Math.floor(length / 4), aWords = new Uint32Array(left, aOffset, count), bWords = new Uint32Array(right, bOffset, count);
        for (let at = 0; at < count; at++) if (aWords[at] !== bWords[at]) return false;
        for (let at = count * 4; at < length; at++) if (a[at] !== b[at]) return false;
        return true;
      }
    }
  }
  for (let at = 0; at < length; at++) if (a[at] !== b[at]) return false;
  return true;
}
function own(input: Uint8Array): OwnedAsset {
  if (!(input instanceof Uint8Array)) throw new Error('Asset ownership needs Uint8Array bytes');
  const unshared = buffer(input) instanceof ArrayBuffer, previous = unshared ? aliases.get(input) : undefined;
  let snapshot: Snapshot;
  if (previous !== undefined && equal(input, previous.bytes)) snapshot = previous;
  else { const bytes = copy(input); snapshot = { bytes, hash: hashImmutableBytes(bytes) }; }
  if (unshared) aliases.set(input, snapshot);
  const bytes = copy(snapshot.bytes); aliases.set(bytes, snapshot); return { bytes, hash: snapshot.hash };
}

/** A config-safe producer consults an explicitly installed host factory or
 * owns its own detached snapshot. It imports neither async scope machinery nor
 * native comparison services. Every returned body still crosses full admission. */
export function ownAssetBytes(input: Uint8Array): OwnedAsset {
  const activePort: unknown = Reflect.get(globalThis, slot);
  if (typeof activePort !== 'object' || activePort === null || !('current' in activePort) || typeof activePort.current !== 'function') return own(input);
  const current: unknown = Reflect.apply(activePort.current, activePort, []);
  if (typeof current !== 'function') return own(input);
  const result: unknown = Reflect.apply(current, undefined, [input]);
  if (typeof result !== 'object' || result === null || !('bytes' in result) || !(result.bytes instanceof Uint8Array) ||
    !('hash' in result) || typeof result.hash !== 'string' || !/^[a-f0-9]{64}$/u.test(result.hash) || !equal(input, result.bytes))
    throw new Error('Author asset owner did not preserve its input bytes');
  if (!(buffer(result.bytes) instanceof ArrayBuffer)) throw new Error('Author asset owner returned shared bytes');
  return { bytes: result.bytes, hash: result.hash };
}
