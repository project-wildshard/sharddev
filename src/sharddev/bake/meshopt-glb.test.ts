import { expect, test } from 'vitest';
import { BoxGeometry, BufferAttribute, MeshStandardMaterial } from 'three';
import { VertexLayout, WebIO } from '@gltf-transform/core';
import { EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { staticGlb } from './glb';
import { meshoptGlb } from './glbCompression';

// Retain the original author writer independently, including optional dedup order.
async function original(input: Uint8Array, unique: boolean): Promise<Uint8Array> {
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
  const io = new WebIO().setVertexLayout(VertexLayout.SEPARATE).registerExtensions([EXTMeshoptCompression])
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
  const document = await io.readBinary(input);
  if (unique) await document.transform(dedup());
  document.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  return io.writeBinary(document);
}

test.each([false, true])('meshopt writer preserves complete native bytes and source ownership (dedup=%s)', async unique => {
  const geometry = new BoxGeometry(3, 2, 7), material = new MeshStandardMaterial();
  geometry.setAttribute('aWeight', new BufferAttribute(Float32Array.from({ length: geometry.getAttribute('position').count }, (_, i) => i / 13), 1));
  try {
    const input = staticGlb([{ geometry, material, compactIndex: true, name: 'first', customAttributes: { _WEIGHT: 'aWeight' }, extras: { restGroups: [[0, 3, 0]], restBox: [-1, -2, -3, 1, 2, 3] } },
      { geometry, material, compactIndex: true, name: 'second', customAttributes: { _WEIGHT: 'aWeight' } }], 'author-pool');
    const envelope = new Uint8Array(input.length + 17); envelope.fill(173); envelope.set(input, 7);
    const view = envelope.subarray(7, 7 + input.length), before = envelope.slice();
    expect(await meshoptGlb(view, { deduplicate: unique })).toEqual(await original(input, unique));
    expect(envelope).toEqual(before);
  } finally { geometry.dispose(); material.dispose(); }
});

test('meshopt writer refuses malformed source instead of emitting a replacement', async () => {
  await expect(meshoptGlb(new Uint8Array(24))).rejects.toThrow();
});
