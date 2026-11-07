/** Pack a rigged training dummy without changing its skin's metre-scale positions.
 *
 * node scripts/practice/pack_dummy.mjs /tmp/wood-rigged.glb public/assets/practice/dummies/wood-wood.glb
 *
 * WebP textures at 1024² (E285; 512² before), meshopt, and KHR_mesh_quantization on UVs, normals and weights.
 *
 * The glTF-Transform meshopt CLI quantizes skinned POSITION into [-1, 1] here
 * without restoring the node scale. That puts half the dummy under the floor
 * and detaches its visible body from the arena hitboxes. Encode the float
 * accessors directly with EXT_meshopt_compression instead.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, EXTTextureWebP, KHRMeshQuantization } from '@gltf-transform/extensions';
import { quantize } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

async function main() {
  if (process.argv.length < 4) throw new Error('Usage: node scripts/practice/pack_dummy.mjs <rigged.glb> <shipped.glb>');
  const source = process.argv[2];
  const target = process.argv[3];
  const scratch = mkdtempSync(path.join(tmpdir(), 'wildshard-dummy-'));
  try {
    const resized = path.join(scratch, 'resized.glb');
    execFileSync(path.resolve(import.meta.dirname, '../../node_modules/.bin/gltf-transform'), [
      'optimize', source, resized,
      '--compress', 'false', '--flatten', 'false', '--join', 'false',
      '--instance', 'false', '--simplify', 'false',
      '--texture-compress', 'webp', '--texture-size', '1024',
    ], { stdio: 'inherit' });
    await MeshoptEncoder.ready;
    await MeshoptDecoder.ready;
    const io = new NodeIO()
      .registerExtensions([EXTMeshoptCompression, EXTTextureWebP, KHRMeshQuantization])
      .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
    const document = await io.read(resized);
    // Everything but POSITION may shrink (E285: 40k skinned vertices were ~1.1 MB of the 1.6 MB steel GLB):
    // 16-bit UVs, 8-bit normals and 8-bit weights. POSITION stays float, see above.
    await document.transform(quantize({
      pattern: /^(TEXCOORD|NORMAL|WEIGHTS)/, quantizeTexcoord: 16, quantizeNormal: 8, quantizeWeight: 8,
    }));
    document.createExtension(KHRMeshQuantization).setRequired(true);
    document.createExtension(EXTMeshoptCompression).setRequired(true)
      .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
    await io.write(target, document);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
