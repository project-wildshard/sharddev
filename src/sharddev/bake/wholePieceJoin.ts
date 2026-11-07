import { BufferAttribute, BufferGeometry, Float16BufferAttribute, InterleavedBufferAttribute, Matrix3, Matrix4, Vector3, type TypedArrayConstructor } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WholeGeometryPiece } from '@wildshard/engine/game/plugin/geometry';

function raw(attribute: BufferAttribute | InterleavedBufferAttribute, vertex: number, lane: number): number | undefined {
  return attribute instanceof InterleavedBufferAttribute ? attribute.data.array[vertex * attribute.data.stride + attribute.offset + lane] : attribute.array[vertex * attribute.itemSize + lane];
}
function gpuType(attribute: BufferAttribute | InterleavedBufferAttribute): BufferAttribute['gpuType'] | undefined {
  return attribute instanceof BufferAttribute ? attribute.gpuType : undefined;
}

/** Same native getters, vector operations and per-transform storage rounding as
 * BufferGeometry.applyMatrix4. Private intermediate bounds are not consumed by
 * the union; its caller restores the original frozen draw bounds. */
function* transform(geometry: BufferGeometry, matrix: Matrix4): Generator<void> {
  const vector = new Vector3(), normalMatrix = new Matrix3().getNormalMatrix(matrix);
  for (const name of ['position', 'normal', 'tangent']) {
    const attribute = geometry.getAttribute(name); if (attribute === undefined) continue;
    for (let i = 0; i < attribute.count; i++) {
      if (i % 256 === 0) yield;
      vector.fromBufferAttribute(attribute, i);
      if (name === 'position') vector.applyMatrix4(matrix);
      else if (name === 'normal') vector.applyNormalMatrix(normalMatrix);
      else vector.transformDirection(matrix);
      attribute.setXYZ(i, vector.x, vector.y, vector.z);
    }
    attribute.needsUpdate = true;
  }
}

/** Merge the admitted rigid channels in the original piece order. Preallocate
 * indices instead of growing a boxed-number array, retaining Three's exact
 * 65535 primitive-restart boundary and native attribute storage. */
function* merge(copies: readonly BufferGeometry[]): Generator<void, BufferGeometry> {
  const first = copies[0]; if (first === undefined) return new BufferGeometry();
  // WholeGeometryPiece's admission rejects morphs. Preserve the original pure
  // helper's compatibility for independently constructed non-rigid callers.
  if (copies.some(copy => Object.keys(copy.morphAttributes).length > 0)) {
    const joined = mergeGeometries([...copies], false);
    if (joined === null) throw new Error('Whole piece channels cannot join');
    return joined;
  }
  const indexed = first.index !== null, names = Object.keys(first.attributes), geometry = new BufferGeometry();
  let complete = false;
  try {
    for (const copy of copies) {
      if ((copy.index !== null) !== indexed || Object.keys(copy.attributes).length !== names.length
        || names.some(name => copy.getAttribute(name) === undefined) || copy.morphTargetsRelative !== first.morphTargetsRelative) throw new Error('Whole piece channels cannot join');
    }
    if (indexed) {
      const indices = new Uint32Array(copies.reduce((n, copy) => n + (copy.index?.count ?? 0), 0));
      let offset = 0, written = 0, wide = false;
      for (const copy of copies) {
        const index = copy.index; if (index === null) throw new Error('Whole piece channels cannot join');
        for (let i = 0; i < index.count; i++) {
          if (i % 1024 === 0) yield;
          const value = index.getX(i) + offset; indices[written++] = value; wide ||= value >= 65535;
        }
        offset += copy.getAttribute('position').count;
      }
      geometry.setIndex(new BufferAttribute(wide ? indices : Uint16Array.from(indices), 1));
    }
    for (const name of names) {
      yield;
      const attributes = copies.map(copy => copy.getAttribute(name)), template = attributes[0];
      if (template === undefined) throw new Error('Whole piece channels cannot join');
      // NR2: a half-float channel is its class, not its storage (three uploads a plain Uint16Array as integers), so the
      // union keeps the Float16 wrapper: Nine's fabric aFace / aPat read as raw half bits shaded its stone flat
      const half = template instanceof Float16BufferAttribute;
      for (const attribute of attributes) if (attribute.array.constructor !== template.array.constructor || attribute.itemSize !== template.itemSize
        || attribute.normalized !== template.normalized || gpuType(attribute) !== gpuType(template) || (attribute instanceof Float16BufferAttribute) !== half) throw new Error('Whole piece channels cannot join');
      // TypedArray.constructor loses its construct signature in lib.d.ts;
      // admission and the exact constructor check above retain its native type.
      const Storage = template.array.constructor as TypedArrayConstructor;
      const array = new Storage(attributes.reduce((n, attribute) => n + attribute.count * attribute.itemSize, 0));
      let offset = 0;
      for (const attribute of attributes) {
        if (attribute instanceof InterleavedBufferAttribute) {
          // the stored words as they are (no normalize or half-float round trip)
          for (let i = 0, at = offset; i < attribute.count; i++) {
            if (i % 256 === 0) yield;
            for (let lane = 0; lane < template.itemSize; lane++) array[at++] = raw(attribute, i, lane) ?? 0;
          }
        } else for (let i = 0; i < attribute.array.length; i += 16384) {
          yield; array.set(attribute.array.subarray(i, i + 16384), offset + i);
        }
        offset += attribute.count * template.itemSize;
      }
      // Float16BufferAttribute copies its array, so it wraps the filled storage last
      const joined = half && array instanceof Uint16Array ? new Float16BufferAttribute(array, template.itemSize, template.normalized) : new BufferAttribute(array, template.itemSize, template.normalized), kind = gpuType(template);
      if (kind !== undefined) joined.gpuType = kind;
      geometry.setAttribute(name, joined);
    }
    complete = true; return geometry;
  } finally { if (!complete) geometry.dispose(); }
}

/** Validate every shared original lane, including signed zero, before a new
 * one-draw union can publish. A caller may yield between bounded scalar chunks;
 * closing the cursor disposes all private intermediate geometry. */
export function* joinWholePieceSteps(pieces: readonly WholeGeometryPiece[], pose?: readonly number[], forceIdentityTransform = false): Generator<void, BufferGeometry | undefined> {
  const first = pieces[0]; if (first === undefined) return new BufferGeometry();
  const vertices = new Map<number, { readonly piece: WholeGeometryPiece; readonly local: number }>(), triangles = new Set<number>();
  for (const piece of pieces) {
    if (piece.part !== first.part || piece.layout !== first.layout || !piece.matrix.equals(first.matrix)
      || piece.vertexCount !== first.vertexCount || piece.indexCount !== first.indexCount) throw new Error('Whole source layout or transform differs');
    let checked = 0;
    for (const triangle of piece.triangles) {
      if (checked++ % 256 === 0) yield;
      if (triangles.has(triangle)) throw new Error('Whole duplicate or invalid triangle'); triangles.add(triangle);
    }
    const attributes = Object.entries(piece.geometry.attributes);
    for (const [local, ordinal] of piece.vertices.entries()) {
      if (local % 256 === 0) yield;
      const prior = vertices.get(ordinal);
      if (prior === undefined) { vertices.set(ordinal, { piece, local }); continue; }
      for (const [name, attribute] of attributes) {
        const other = prior.piece.geometry.getAttribute(name);
        if (other === undefined || attribute.itemSize !== other.itemSize) throw new Error('Whole channel layout differs');
        for (let lane = 0; lane < attribute.itemSize; lane++) if (!Object.is(raw(attribute, local, lane), raw(other, prior.local, lane))) throw new Error('Whole shared vertex differs');
      }
    }
  }
  const copies: BufferGeometry[] = [], identity = new Matrix4();
  try {
    for (const piece of pieces) {
      yield;
      const copy = piece.geometry.clone(); copies.push(copy);
      if (forceIdentityTransform || pose !== undefined || !piece.matrix.equals(identity)) yield* transform(copy, piece.matrix);
      if (pose !== undefined) yield* transform(copy, new Matrix4().fromArray(pose));
    }
    return yield* merge(copies);
  } finally { for (const copy of copies) copy.dispose(); }
}

/** Synchronous bake oracle over the exact source-piece cursor. Runtime
 * readers consume the baked chunks and never reconstruct this union. */
export function joinWholePieces(pieces: readonly WholeGeometryPiece[], pose?: readonly number[], forceIdentityTransform = false): BufferGeometry {
  const steps = joinWholePieceSteps(pieces, pose, forceIdentityTransform);
  for (;;) {
    const next = steps.next();
    if (next.done) {
      if (next.value === undefined) throw new Error('Whole piece join did not complete');
      return next.value;
    }
  }
}
