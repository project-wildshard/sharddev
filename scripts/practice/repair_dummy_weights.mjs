/** E336: smooth voxel-binding discontinuities and remove torso leakage down the arms.
 * Preserves positions, indices, skeleton, bind matrices and textures. Input/output may be identical.
 * node scripts/practice/repair_dummy_weights.mjs <source.glb> <target.glb>
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { Matrix4, Vector3 } from 'three';

const [source, target] = process.argv.slice(2);
if (!source || !target) throw new Error('Usage: repair_dummy_weights.mjs <source.glb> <target.glb>');
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(source);
const radius = 0.065, cell = radius, sigma2 = (radius / 2) ** 2;
for (const node of doc.getRoot().listNodes()) {
  const skin = node.getSkin(), mesh = node.getMesh();
  if (!skin || !mesh) continue;
  const names = skin.listJoints().map((joint) => joint.getName()), count = names.length;
  const matrix = new Matrix4().fromArray(node.getWorldMatrix());
  for (const primitive of mesh.listPrimitives()) {
    const positions = primitive.getAttribute('POSITION'), weights = primitive.getAttribute('WEIGHTS_0'), indices = primitive.getAttribute('JOINTS_0');
    if (!positions || !weights || !indices) throw new Error('Incomplete skin');
    const n = positions.getCount(), dense = new Float64Array(n * count), points = [], cells = new Map();
    const p = [], w = [], ix = [];
    for (let i = 0; i < n; i++) {
      positions.getElement(i, p); weights.getElement(i, w); indices.getElement(i, ix);
      const point = new Vector3().fromArray(p).applyMatrix4(matrix); points.push(point);
      for (let k = 0; k < 4; k++) dense[i * count + ix[k]] += w[k];
      // Old geodesic flood occasionally crossed from an arm into the torso. Fade that contribution out below shoulder.
      const side = point.x > 0 ? 'Left' : 'Right';
      const armAmount = names.reduce((sum, name, j) => sum + (name.startsWith(side) && /Shoulder|Arm|Hand/.test(name) ? dense[i * count + j] : 0), 0);
      const remove = Math.min(1, Math.max(0, (Math.abs(point.x) - 0.23) / 0.12)) * Math.min(1, Math.max(0, (2.05 - point.y) / 0.16));
      if (armAmount > 0.2) for (let j = 0; j < count; j++) {
        if (['Pelvis', 'Spine', 'Chest', 'Neck', 'Head'].includes(names[j])) dense[i * count + j] *= 1 - remove;
      }
      let sum = 0; for (let j = 0; j < count; j++) sum += dense[i * count + j];
      for (let j = 0; j < count; j++) dense[i * count + j] /= sum;
      const key = [point.x, point.y, point.z].map((v) => Math.floor(v / cell)).join(',');
      const list = cells.get(key) ?? []; list.push(i); cells.set(key, list);
    }
    const newWeights = new Float32Array(n * 4), newIndices = new Uint16Array(n * 4);
    for (let i = 0; i < n; i++) {
      const point = points[i], accumulated = new Float64Array(count);
      // The foot/base stays rigid. Smooth the hip/post junction too: a hard height boundary creates new creases.
      if (point.y < 0.2) {
        weights.getElement(i, w); indices.getElement(i, ix);
        newWeights.set(w, i * 4); newIndices.set(ix, i * 4); continue;
      }
      const cx = Math.floor(point.x / cell), cy = Math.floor(point.y / cell), cz = Math.floor(point.z / cell);
      for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) for (let z = cz - 1; z <= cz + 1; z++) {
        for (const k of cells.get(`${x},${y},${z}`) ?? []) {
          const d2 = point.distanceToSquared(points[k]); if (d2 > radius * radius) continue;
          const influence = Math.exp(-d2 / (2 * sigma2));
          for (let j = 0; j < count; j++) accumulated[j] += influence * dense[k * count + j];
        }
      }
      const ranked = Array.from(accumulated, (weight, j) => ({ weight, j })).sort((a, b) => b.weight - a.weight).slice(0, 4);
      const sum = ranked.reduce((total, r) => total + r.weight, 0);
      if (!(sum > 0)) throw new Error('Unbound vertex');
      ranked.forEach((r, k) => { newIndices[i * 4 + k] = r.j; newWeights[i * 4 + k] = r.weight / sum; });
    }
    weights.setArray(newWeights); indices.setArray(newIndices);
    console.log(mesh.getName(), n, 'weights repaired; geometry and rest rig preserved');
  }
}
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
await io.write(target, doc);
