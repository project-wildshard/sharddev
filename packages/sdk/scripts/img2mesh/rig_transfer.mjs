#!/usr/bin/env node
// rig_transfer.mjs — E304: put a rigged GLB's skin back on its face-remastered mesh.
//
// The face remaster (rig_strip.mjs → face_remaster.py) keeps the body where it was — in the rig's bind pose — and grafts a
// new head on it. This copies the old file (its skeleton, its joints by name and order, its inverse binds, its material)
// and swaps in the new geometry and atlas; each new vertex takes the skin of its nearest old vertices (the 4 nearest,
// inverse-distance weighted, the 4 strongest joints kept). Above the neck cut a vertex looks only at old vertices above
// it, so the whole new head — its hood drape included — rides the head / crown bones as the old head did, never the
// chest or the cape.
//
//   node scripts/img2mesh/rig_transfer.mjs <old.rigged.glb> <new.raw.glb> <out.rigged.glb> --neck-y <m> [--tex 1024]
import { createRequire } from 'node:module';
import { realpathSync, statSync } from 'node:fs';
import { resolve as resolvePath, join } from 'node:path';

const ROOT = resolvePath(new URL('../..', import.meta.url).pathname);
const req = createRequire(realpathSync(join(ROOT, 'node_modules/@gltf-transform/cli/package.json')));
const { NodeIO } = req('@gltf-transform/core');
const { ALL_EXTENSIONS } = req('@gltf-transform/extensions');
const { MeshoptDecoder, MeshoptEncoder } = req('meshoptimizer');
const sharp = req('sharp');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i !== -1 ? args[i + 1] : d; };
const [oldPath, newPath, outPath] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1]?.startsWith('--')));
const neckY = Number(opt('--neck-y', 'NaN'));
const texSize = Number(opt('--tex', '1024'));
if (!oldPath || !newPath || !outPath || !Number.isFinite(neckY)) {
  console.error('usage: rig_transfer.mjs <old.rigged.glb> <new.raw.glb> <out.rigged.glb> --neck-y <m> [--tex 1024]');
  process.exit(2);
}
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

const oldDoc = await io.read(oldPath);
const newDoc = await io.read(newPath);
const oprim = oldDoc.getRoot().listMeshes()[0].listPrimitives()[0];
const nprim = newDoc.getRoot().listMeshes()[0].listPrimitives()[0];
const floats = (a) => { const n = a.getCount(), k = a.getElementSize(), out = new Float32Array(n * k), el = []; for (let i = 0; i < n; i++) { a.getElement(i, el); for (let c = 0; c < k; c++) out[i * k + c] = el[c]; } return out; };
const OP = floats(oprim.getAttribute('POSITION')), OJ = floats(oprim.getAttribute('JOINTS_0')), OW = floats(oprim.getAttribute('WEIGHTS_0'));
const NP = floats(nprim.getAttribute('POSITION'));
const on = OP.length / 3, nn = NP.length / 3;

const joints = new Uint8Array(nn * 4), weights = new Float32Array(nn * 4);
const K = 4;
for (let i = 0; i < nn; i++) {
  const x = NP[i * 3], y = NP[i * 3 + 1], z = NP[i * 3 + 2];
  const head = y > neckY;
  const bi = new Int32Array(K).fill(-1), bd = new Float64Array(K).fill(Infinity);
  for (let j = 0; j < on; j++) {
    if (head && OP[j * 3 + 1] <= neckY) continue;
    const dx = OP[j * 3] - x, dy = OP[j * 3 + 1] - y, dz = OP[j * 3 + 2] - z, d = dx * dx + dy * dy + dz * dz;
    if (d >= bd[K - 1]) continue;
    let s = K - 1;
    while (s > 0 && bd[s - 1] > d) { bd[s] = bd[s - 1]; bi[s] = bi[s - 1]; s--; }
    bd[s] = d; bi[s] = j;
  }
  const acc = new Map();
  for (let s = 0; s < K; s++) {
    const j = bi[s];
    if (j < 0) continue;
    const w = 1 / (Math.sqrt(bd[s]) + 1e-4);
    for (let c = 0; c < 4; c++) {
      const jw = OW[j * 4 + c];
      if (jw > 0) acc.set(OJ[j * 4 + c], (acc.get(OJ[j * 4 + c]) ?? 0) + w * jw);
    }
  }
  const top = [...acc.entries()].sort((p, q) => q[1] - p[1]).slice(0, 4);
  const sum = top.reduce((s, e) => s + e[1], 0) || 1;
  top.forEach(([jn, w], c) => { joints[i * 4 + c] = jn; weights[i * 4 + c] = w / sum; });
}

// the new geometry into the old file's primitive
const buf = oldDoc.getRoot().listBuffers()[0];
const acc = (type, arr) => oldDoc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
const set = (k, a) => { const prev = oprim.getAttribute(k); oprim.setAttribute(k, a); if (prev && prev.listParents().length <= 1) prev.dispose(); };
set('POSITION', acc('VEC3', NP));
// normals i8, uvs u16, weights u8 — normalized (three denormalizes them); positions stay float, as the rig bake wrote them
// (a quantized position needs a node transform, which a skinned mesh's bind pose would not see)
const q = (arr, T, max) => T.from(arr, (v) => Math.round(Math.max(T === Int8Array ? -1 : 0, Math.min(1, v)) * max));
const w8 = new Uint8Array(nn * 4);
for (let i = 0; i < nn; i++) {           // weights to u8, the rounding error given to the strongest so each sums to 255
  let s = 0;
  for (let c = 1; c < 4; c++) { w8[i * 4 + c] = Math.round(weights[i * 4 + c] * 255); s += w8[i * 4 + c]; }
  w8[i * 4] = 255 - s;
}
set('NORMAL', acc('VEC3', q(floats(nprim.getAttribute('NORMAL')), Int8Array, 127)).setNormalized(true));
set('TEXCOORD_0', acc('VEC2', q(floats(nprim.getAttribute('TEXCOORD_0')), Uint16Array, 65535)).setNormalized(true));
set('JOINTS_0', acc('VEC4', joints));
set('WEIGHTS_0', acc('VEC4', w8).setNormalized(true));
const ni = nprim.getIndices().getArray();
const prevIdx = oprim.getIndices();
oprim.setIndices(acc('SCALAR', nn > 65535 ? Uint32Array.from(ni) : Uint16Array.from(ni)));
prevIdx?.dispose();
// the new atlas, WebP at --tex
const ntex = newDoc.getRoot().listTextures()[0];
const otex = oldDoc.getRoot().listTextures()[0];
const webp = await sharp(Buffer.from(ntex.getImage())).resize(texSize, texSize, { kernel: 'lanczos3' }).webp({ quality: 88 }).toBuffer();
otex.setImage(new Uint8Array(webp)).setMimeType('image/webp');
const ex = oldDoc.getRoot().getAsset().extras ?? {};
oldDoc.getRoot().getAsset().extras = { ...ex, faceRemaster: { by: 'scripts/img2mesh/face_remaster.py + rig_transfer.mjs (E304)', neckY } };
await io.write(outPath, oldDoc);
const heads = (() => { let n = 0; for (let i = 0; i < nn; i++) if (NP[i * 3 + 1] > neckY) n++; return n; })();
console.log(`[transfer] ${outPath}: ${nn} verts (${heads} above the neck), ${ni.length / 3} tris, ${statSync(outPath).size} B`);
