// SHARD-AUTHORING SA6 (J170): a generator's GLB codec. A generator builds, reads and writes GLB documents through this
// module, so its imports stay on the authoring surface (the SDK's `generator-imports` rule) while gltf-transform and the
// meshopt decoder stay the SDK's own dependencies, pinned with it.
import { Document, WebIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

/** An empty glTF document for a generator to fill and pass to `writeGlb`. */
export function newGlbDocument(): Document {
  return new Document();
}

/** Read GLB bytes into a document: every glTF extension gltf-transform knows, meshopt-compressed buffers decoded. */
export async function readGlb(bytes: Uint8Array): Promise<Document> {
  await MeshoptDecoder.ready;
  const io = new WebIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  return io.readBinary(bytes);
}

/** Write a document as GLB bytes, as it stands: no compression, quantization, welding or reordering. */
export function writeGlb(doc: Document): Promise<Uint8Array> {
  return new WebIO().writeBinary(doc);
}
