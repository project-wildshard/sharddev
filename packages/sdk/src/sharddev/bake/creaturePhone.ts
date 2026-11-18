/**
 * ONE-FORMAT CC51a (Q-CC13): a creature's phone mesh. The same skinned GLB with meshoptimizer's simplifier run over each
 * skinned primitive: the rig (joint order, inverse binds), the clips, every named node (sockets, hit markers) and the
 * materials are the source's, so the phone mesh passes the same skin admission and poses from the same clips. Only the
 * triangles drop. CC51b makes a skin look name it for the phone tier.
 */
import type { Document } from '@gltf-transform/core';
import { simplify, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';
import { readRigDocument, writeRigDocument } from './rig';

/** How far the phone mesh goes. */
export interface CreaturePhoneOptions {
  /** The share of the desktop mesh's vertices the phone mesh aims to keep (0.05 to 1; default 0.5). */
  readonly ratio?: number;
  /** The largest surface error allowed, as a share of the mesh's radius (default 0.01: 1 cm on a 1 m creature). */
  readonly error?: number;
}
/** The phone mesh and both meshes' triangle counts, for the report card. */
export interface CreaturePhoneMesh {
  readonly glb: Uint8Array;
  readonly triangles: { readonly desktop: number; readonly phone: number };
}

const DEFAULT_RATIO = 0.5, DEFAULT_ERROR = 0.01, MIN_RATIO = 0.05, TRIANGLE = 3, TRIANGLES_MODE = 4;

function triangles(document: Document): number {
  let count = 0;
  for (const mesh of document.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
    if (primitive.getMode() !== TRIANGLES_MODE) throw new Error('creature phone mesh: a primitive is not triangles');
    count += (primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION')?.getCount() ?? 0) / TRIANGLE;
  }
  return count;
}

/** Simplify `glb`'s skinned meshes for the phone. Rig, clips, nodes and materials are kept byte for byte in meaning. */
export async function creaturePhoneGlb(glb: Uint8Array, options: CreaturePhoneOptions = {}): Promise<CreaturePhoneMesh> {
  const ratio = options.ratio ?? DEFAULT_RATIO, error = options.error ?? DEFAULT_ERROR;
  if (!(ratio >= MIN_RATIO && ratio <= 1)) throw new Error(`creature phone mesh: ratio ${ratio} is outside ${MIN_RATIO} to 1`);
  if (!(error > 0 && error <= 1)) throw new Error(`creature phone mesh: error ${error} is outside 0 to 1`);
  await MeshoptSimplifier.ready;
  const document = await readRigDocument(glb), desktop = triangles(document);
  if (document.getRoot().listSkins().length !== 1) throw new Error('creature phone mesh: the GLB has no single skin');
  await document.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error }));
  const phone = triangles(document);
  if (phone === 0) throw new Error('creature phone mesh: simplifying left no triangles');
  return { glb: await writeRigDocument(document), triangles: { desktop, phone } };
}
