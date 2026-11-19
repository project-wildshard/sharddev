/**
 * ONE-FORMAT CC51c (Q-CC16): the pack step. Several small creatures' skinned GLBs become one ordinary GLB, each creature
 * under its own node (named by its key); inside, every node, joint, socket and clip keeps its own name, so two creatures
 * on one kit skeleton share every name and the packed node tells them apart. A skin row names its node as `rig.mesh`
 * (format `skinData`), and the format and the engine read only that node's subtree and the clips that move it. One file
 * is one fetch and one parse budget for the cell's small species instead of one per species.
 *
 * Textures are not packed (no atlas): a creature whose skin depends on its own maps keeps its own GLB.
 */
import { Document } from '@gltf-transform/core';
import { mergeDocuments, unpartition } from '@gltf-transform/functions';
import { readRigDocument, writeRigDocument } from './rig';

/** One creature to pack: the node its skin names (`rig.mesh`) and its rig GLB. */
export interface CreaturePackPart {
  readonly name: string;
  readonly glb: Uint8Array;
}

const NODE_NAME = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/u;

/** Pack `parts` into one GLB, each part's scene under a node named `part.name`. */
export async function packCreatureGlbs(parts: readonly CreaturePackPart[]): Promise<Uint8Array> {
  if (parts.length < 2) throw new Error('creature pack: packing needs two creatures or more');
  const names = new Set<string>();
  for (const { name } of parts) {
    if (!NODE_NAME.test(name)) throw new Error(`creature pack: ${name} is not a node name (a letter, then up to 63 letters, digits, _ . -)`);
    if (names.has(name)) throw new Error(`creature pack: ${name} is packed twice`);
    names.add(name);
  }
  const packed = new Document(), scene = packed.createScene('pack');
  packed.getRoot().setDefaultScene(scene);
  for (const part of parts) {
    const source = await readRigDocument(part.glb), sources = source.getRoot().listScenes();
    if (sources.length !== 1) throw new Error(`creature pack: ${part.name}'s GLB has ${sources.length} scenes, not one`);
    if (source.getRoot().listSkins().length !== 1) throw new Error(`creature pack: ${part.name}'s GLB has no single skin`);
    if (source.getRoot().listTextures().length > 0) throw new Error(`creature pack: ${part.name} draws its own textures; packing has no atlas, so it keeps its own GLB`);
    for (const extension of source.getRoot().listExtensionsUsed()) {
      if (!packed.getRoot().listExtensionsUsed().some(used => used.extensionName === extension.extensionName)) {
        const created = packed.createExtension(extension.constructor as new (document: Document) => typeof extension);
        if (extension.isRequired()) created.setRequired(true);
      }
    }
    const map = mergeDocuments(packed, source), merged = map.get(sources[0] as never) as ReturnType<Document['createScene']> | undefined;
    if (merged === undefined) throw new Error(`creature pack: ${part.name}'s scene did not merge`);
    const holder = packed.createNode(part.name);
    // addChild detaches each child from the merged scene first
    for (const child of merged.listChildren()) holder.addChild(child);
    merged.dispose();
    scene.addChild(holder);
  }
  await packed.transform(unpartition());
  return writeRigDocument(packed);
}

/** Whether `name` can name a packed node (format `skinData`'s joint names). */
export function packNodeName(name: string): boolean {
  return NODE_NAME.test(name);
}

interface GlbTriangleJson {
  readonly nodes?: readonly { readonly name?: string; readonly mesh?: number; readonly children?: readonly number[] }[];
  readonly meshes?: readonly { readonly primitives: readonly { readonly indices?: number; readonly attributes: Readonly<Record<string, number>> }[] }[];
  readonly accessors?: readonly { readonly count: number }[];
}

/** The triangles one packed creature draws: the meshes under its node (`rig.mesh`), not the whole file's. */
export function packedTriangles(glb: Uint8Array, mesh: string): number {
  const length = new DataView(glb.buffer, glb.byteOffset, glb.byteLength).getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + length))) as GlbTriangleJson;
  const nodes = json.nodes ?? [], root = nodes.findIndex(node => node.name === mesh);
  if (root === -1) throw new Error(`creature pack: no packed node ${mesh}`);
  let triangles = 0;
  const stack = [root];
  for (let next = stack.pop(); next !== undefined; next = stack.pop()) {
    const node = nodes[next];
    stack.push(...node?.children ?? []);
    for (const primitive of node?.mesh === undefined ? [] : json.meshes?.[node.mesh]?.primitives ?? []) {
      triangles += (json.accessors?.[primitive.indices ?? primitive.attributes['POSITION'] ?? -1]?.count ?? 0) / 3;
    }
  }
  return triangles;
}
