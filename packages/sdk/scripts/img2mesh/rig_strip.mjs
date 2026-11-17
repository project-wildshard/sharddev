#!/usr/bin/env node
// rig_strip.mjs — E304: a rigged game GLB (meshopt, WebP, a glTF skin) → a plain static GLB Blender's importer reads as
// one mesh in its bind pose (no skin, no meshopt, PNG textures). The face remaster (face_remaster.py) then grafts a new
// head on it, and rig_transfer.mjs puts the old skin back on the result.
//
//   node scripts/img2mesh/rig_strip.mjs <in.rigged.glb> <out.glb>
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { resolve as resolvePath, join } from 'node:path';

const ROOT = resolvePath(new URL('../..', import.meta.url).pathname);
const req = createRequire(realpathSync(join(ROOT, 'node_modules/@gltf-transform/cli/package.json')));
const { NodeIO } = req('@gltf-transform/core');
const { ALL_EXTENSIONS } = req('@gltf-transform/extensions');
const { MeshoptDecoder } = req('meshoptimizer');
const sharp = req('sharp');

const [inp, out] = process.argv.slice(2);
if (!inp || !out) { console.error('usage: rig_strip.mjs <in.rigged.glb> <out.glb>'); process.exit(2); }
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(inp);
const root = doc.getRoot();
for (const ext of root.listExtensionsUsed()) {
  const n = ext.extensionName;
  if (n === 'EXT_meshopt_compression' || n === 'EXT_texture_webp') ext.dispose();
}
// the skinned mesh node, detached from the skeleton; the bones go (the mesh is in its bind pose: inverse binds = −bone)
const scene = root.listScenes()[0];
for (const node of root.listNodes()) {
  if (node.getMesh()) {
    node.setSkin(null);
    for (const prim of node.getMesh().listPrimitives()) {
      for (const k of ['JOINTS_0', 'WEIGHTS_0']) { const a = prim.getAttribute(k); if (a) { prim.setAttribute(k, null); a.dispose(); } }
    }
  }
}
for (const skin of root.listSkins()) skin.dispose();
for (const node of root.listNodes()) if (!node.getMesh()) node.dispose();
for (const node of root.listNodes()) if (!scene.listChildren().includes(node)) scene.addChild(node);
for (const tex of root.listTextures()) {
  const img = tex.getImage();
  if (img && tex.getMimeType() !== 'image/png') tex.setImage(new Uint8Array(await sharp(Buffer.from(img)).png().toBuffer())).setMimeType('image/png');
}
await io.write(out, doc);
console.log(`[strip] ${inp} -> ${out}`);
