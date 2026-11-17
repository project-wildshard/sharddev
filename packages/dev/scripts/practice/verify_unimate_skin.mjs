/** E336: evaluate the original skins against every baked UniMate frame without rendering.
 * Usage: node scripts/practice/verify_unimate_skin.mjs [motion.glb] [report.json]
 * Textures are replaced only in memory; real geometry, bind matrices and weights are loaded.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const [motionPath = 'public/assets/practice/dummies/unimate-motion.glb',
  reportPath = 'docs/audits/dummy-unimate-skin.json'] = process.argv.slice(2);
const previousReport = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : null;
const originalRevision = previousReport?.originalRevision ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const minRestTriangleArea = 1e-8;
// E388: no invented tolerance. A weight sum can only be off by its storage's rounding, half a quantum per weight (glTF
// stores WEIGHTS_0 as float32 or as normalized unsigned byte / short): for float32 4 × 2⁻²⁴ ≈ 2.4e-7, img2-character G4's 2e-7.
const weightSumTolerance = (array, normalized) => 4 * (normalized && !(array instanceof Float32Array) ? 0.5 / (2 ** (8 * array.BYTES_PER_ELEMENT) - 1) : 2 ** -24);
// The skin's deformation and the clips' joint speed are held to what the figure's shipped reactions already do: the
// existing hit springs alone, measured in this run on the same figure (springBaseline). The first take (stretch 3.7–5.1×,
// area down to 0.3 %) fails that bar; the approved bake passes it.
const firstTake = previousReport?.beforeSkinRepair ?? (previousReport?.variants?.every((v) => v.unchangedFromHEAD)
  ? previousReport.variants.map((v) => ({ variant: v.variant, sourceSHA256: v.sha256, skins: v.skins,
    clips: v.clips.map((c) => ({ name: c.name, maxEdgeStretch: c.maxEdgeStretch,
      minTriangleAreaRatio: c.minTriangleAreaRatio, collapsedTriangleSamples: c.collapsedTriangleSamples,
      worstStretch: c.worstStretch, worstCollapse: c.worstCollapse })), springComparison: v.springComparison })) : null);
// Exercise the same TypeScript springs and sampler as the arena, without copying their formulas.
registerHooks({
  resolve(specifier, context, next) {
    try { return next(specifier, context); }
    catch (error) {
      if (specifier.startsWith('.') && context.parentURL) return next(`${specifier}.ts`, context);
      throw error;
    }
  },
  load(url, context, next) {
    if (url.endsWith('.ts')) return { format: 'module', shortCircuit: true,
      source: stripTypeScriptTypes(readFileSync(fileURLToPath(url), 'utf8'), { mode: 'transform' }) };
    return next(url, context);
  },
});
const { DummyMotion, DummyPose } = await import('@wildshard/engine/practice/DummyMotion');
const { DummyClips } = await import('@wildshard/engine/practice/DummyClips');
const { DUMMY_BONE_NAMES } = await import('@wildshard/engine/practice/TrainingDummy');
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
await MeshoptDecoder.ready;
const rawIO = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
loader.register((parser) => {
  parser.loadTextureImage = () => Promise.resolve(new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1));
  return { name: 'HEADLESS_TEXTURE_SUBSTITUTE' };
});
const load = (path) => {
  const data = readFileSync(path);
  return loader.parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '');
};
const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const fixedNames = new Set(['Root', 'LeftThigh', 'LeftShin', 'RightThigh', 'RightShin']);
const motions = await load(motionPath), rows = [];
const failures = [];
if (motions.animations.length !== 18) failures.push('Motion library must contain 18 clips');
const round = (value) => Number(value.toFixed(9));
const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
const e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
function positions(mesh) {
  const out = new Float64Array(mesh.geometry.attributes.position.count * 3);
  for (let i = 0; i < out.length / 3; i++) mesh.getVertexPosition(i, a).toArray(out, i * 3);
  return out;
}
function triangleMeasure(values, triangle) {
  a.fromArray(values, triangle[0] * 3); b.fromArray(values, triangle[1] * 3); c.fromArray(values, triangle[2] * 3);
  const edges = [a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)];
  const area = e1.subVectors(b, a).cross(e2.subVectors(c, a)).length() * 0.5;
  return { edges, area };
}
for (const [variant, filename] of [['wood', 'wood-wood'], ['straw-cloth', 'straw-cloth'], ['wood-steel', 'wood-steel']]) {
  const source = `public/assets/practice/dummies/${filename}.glb`;
  const gltf = await load(source), scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const meshes = [];
  scene.traverse((object) => { if (object.isSkinnedMesh) meshes.push(object); });
  const clips = motions.animations.filter((clip) => clip.name.startsWith(`${variant}:`));
  const row = { variant, source, sha256: sha(source), unchangedFromHEAD: false, skins: [], clips: [] };
  const rawDocument = await rawIO.read(source);
  row.rawSkinAttributes = [];
  for (const node of rawDocument.getRoot().listNodes()) {
    const skin = node.getSkin(), mesh = node.getMesh();
    if (!skin || !mesh) continue;
    for (const primitive of mesh.listPrimitives()) {
      const weights = primitive.getAttribute('WEIGHTS_0'), indices = primitive.getAttribute('JOINTS_0');
      if (!weights || !indices) throw new Error('Source skin attributes missing');
      const weight = [], index = [];
      let maxWeightSumError = 0, invalidWeights = 0, invalidIndices = 0;
      for (let v = 0; v < weights.getCount(); v++) {
        weights.getElement(v, weight); indices.getElement(v, index);
        maxWeightSumError = Math.max(maxWeightSumError, Math.abs(weight.reduce((sum, w) => sum + w, 0) - 1));
        for (let j = 0; j < 4; j++) {
          if (!Number.isFinite(weight[j]) || weight[j] < 0) invalidWeights++;
          if (weight[j] > 0 && (!Number.isInteger(index[j]) || index[j] < 0 || index[j] >= skin.listJoints().length)) invalidIndices++;
        }
      }
      const tolerance = weightSumTolerance(weights.getArray(), weights.getNormalized());
      row.rawSkinAttributes.push({ maxWeightSumError, tolerance, invalidWeights, invalidIndices });
      if (maxWeightSumError > tolerance || invalidWeights || invalidIndices) failures.push(`${variant}: invalid raw source skin attributes`);
    }
  }
  try {
    const committed = execFileSync('git', ['show', `${originalRevision}:${source}`], { maxBuffer: 8 * 1024 * 1024 });
    row.unchangedFromHEAD = createHash('sha256').update(committed).digest('hex') === row.sha256;
    const original = await loader.parseAsync(committed.buffer.slice(committed.byteOffset, committed.byteOffset + committed.byteLength), '');
    const oldMeshes = []; original.scene.traverse((object) => { if (object.isSkinnedMesh) oldMeshes.push(object); });
    let maxPositionDelta = 0, maxBindMatrixDelta = 0, maxJointRestMatrixDelta = 0, sameIndices = true, sameOrientedTriangles = true, sameJointOrder = true;
    if (oldMeshes.length !== meshes.length) throw new Error('Skin count changed');
    for (let m = 0; m < meshes.length; m++) {
      const old = oldMeshes[m], current = meshes[m];
      const p = current.geometry.attributes.position, op = old.geometry.attributes.position;
      if (p.count !== op.count) throw new Error('Vertex count changed');
      for (let v = 0; v < p.count; v++) for (let axis = 0; axis < 3; axis++) maxPositionDelta = Math.max(maxPositionDelta, Math.abs(p.getComponent(v, axis) - op.getComponent(v, axis)));
      const ix = current.geometry.index, oix = old.geometry.index;
      sameIndices &&= ix?.count === oix?.count;
      if (ix && oix) for (let v = 0; v < ix.count; v++) sameIndices &&= ix.getX(v) === oix.getX(v);
      const canonical = (index, v) => {
        const first = index.getX(v), second = index.getX(v + 1), third = index.getX(v + 2);
        return [`${first},${second},${third}`, `${second},${third},${first}`, `${third},${first},${second}`].sort()[0];
      };
      sameOrientedTriangles &&= ix?.count === oix?.count;
      if (ix && oix) for (let v = 0; v < ix.count; v += 3) sameOrientedTriangles &&= canonical(ix, v) === canonical(oix, v);
      sameJointOrder &&= current.skeleton.bones.map((joint) => joint.name).join('|') === old.skeleton.bones.map((joint) => joint.name).join('|');
      for (let j = 0; j < current.skeleton.bones.length; j++) {
        const bone = current.skeleton.bones[j], ob = old.skeleton.bones[j]; bone.updateMatrix(); ob.updateMatrix();
        for (let k = 0; k < 16; k++) {
          maxJointRestMatrixDelta = Math.max(maxJointRestMatrixDelta, Math.abs(bone.matrix.elements[k] - ob.matrix.elements[k]));
          maxBindMatrixDelta = Math.max(maxBindMatrixDelta, Math.abs(current.skeleton.boneInverses[j].elements[k] - old.skeleton.boneInverses[j].elements[k]));
        }
      }
    }
    row.originalGeometryParity = { maxPositionDelta, maxBindMatrixDelta, maxJointRestMatrixDelta, sameIndices, sameOrientedTriangles, sameJointOrder };
    if (maxPositionDelta > 1e-7 || maxBindMatrixDelta > 1e-7 || maxJointRestMatrixDelta > 1e-7 || !sameOrientedTriangles || !sameJointOrder) failures.push(`${variant}: geometry/topology/bind changed from original HEAD`);
  } catch { /* Standalone exports can lack git metadata; false is explicit. */ }
  if (!row.originalGeometryParity) failures.push(`${variant}: original HEAD geometry could not be checked`);
  const restBones = new Map();
  for (const mesh of meshes) for (const bone of mesh.skeleton.bones) restBones.set(bone, bone.quaternion.clone());
  const bind = meshes.map((mesh) => positions(mesh));
  const triangles = meshes.map((mesh) => {
    const count = mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count;
    return Array.from({ length: count / 3 }, (_, i) => [0, 1, 2].map((k) => mesh.geometry.index?.getX(i * 3 + k) ?? i * 3 + k));
  });
  const baseline = triangles.map((list, m) => list.map((triangle) => triangleMeasure(bind[m], triangle)));
  for (const [m, mesh] of meshes.entries()) {
    const p = mesh.geometry.attributes.position, w = mesh.geometry.attributes.skinWeight, ix = mesh.geometry.attributes.skinIndex;
    let bindError = 0, weightError = 0, invalidWeights = 0, invalidIndices = 0;
    for (let v = 0; v < p.count; v++) {
      a.fromBufferAttribute(p, v); b.fromArray(bind[m], v * 3); bindError = Math.max(bindError, a.distanceTo(b));
      let sum = 0;
      for (let j = 0; j < 4; j++) {
        const weight = w.getComponent(v, j), index = ix.getComponent(v, j); sum += weight;
        if (!Number.isFinite(weight) || weight < 0) invalidWeights++;
        if (weight > 0 && (!Number.isInteger(index) || index < 0 || index >= mesh.skeleton.bones.length)) invalidIndices++;
      }
      weightError = Math.max(weightError, Math.abs(sum - 1));
    }
    row.skins.push({ mesh: mesh.name, vertices: p.count, triangles: triangles[m].length,
      jointOrder: mesh.skeleton.bones.map((bone) => bone.name), maxBindPositionError: round(bindError),
      maxWeightSumError: round(weightError), invalidWeights, invalidIndices,
      existingDegenerateTriangles: baseline[m].filter((t) => t.area < 1e-10).length,
      existingNumericalSliverTriangles: baseline[m].filter((t) => t.area >= 1e-10 && t.area < minRestTriangleArea).length });
    if (bindError > 1e-4 || weightError > weightSumTolerance(w.array, w.normalized) || invalidWeights || invalidIndices) failures.push(`${variant}: invalid bind or weights`);
  }
  const deformations = [];
  for (const clip of clips) {
    for (const [bone, rest] of restBones) bone.quaternion.copy(rest);
    const mixer = new THREE.AnimationMixer(scene), action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play();
    let maxQuaternionError = 0, missingBindings = 0, forbiddenTracks = 0, finiteKeyframes = true,
      maxKeyframeRotationStep = 0, maxKeyframeAngularSpeed = 0;
    for (const track of clip.tracks) {
      const name = track.name.replace(/\.quaternion$/, '');
      if (!scene.getObjectByName(name)) missingBindings++;
      if (!track.name.endsWith('.quaternion') || fixedNames.has(name)) forbiddenTracks++;
      for (let i = 0; i < track.values.length; i += 4) {
        const q = new THREE.Quaternion().fromArray(track.values, i);
        finiteKeyframes &&= Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.z) && Number.isFinite(q.w);
        maxQuaternionError = Math.max(maxQuaternionError, Math.abs(q.length() - 1));
        if (i >= 4) {
          const angle = q.clone().normalize().angleTo(new THREE.Quaternion().fromArray(track.values, i - 4).normalize());
          const dt = track.times[i / 4] - track.times[i / 4 - 1];
          maxKeyframeRotationStep = Math.max(maxKeyframeRotationStep, angle);
          maxKeyframeAngularSpeed = Math.max(maxKeyframeAngularSpeed, angle / dt);
        }
      }
    }
    let finite = true, maxEdgeStretch = 1, minAreaRatio = 1;
    let maxFixedJointRotation = 0, seamPositionError = 0, maxDisplacement = 0, maxBaseDisplacement = 0;
    let worstStretch, worstCollapse;
    let firstPositions;
    for (let frame = 0; frame <= 60; frame++) {
      mixer.setTime(clip.duration * frame / 60);
      scene.updateMatrixWorld(true);
      for (const [bone, rest] of restBones) if (fixedNames.has(bone.name)) maxFixedJointRotation = Math.max(maxFixedJointRotation, bone.quaternion.clone().normalize().angleTo(rest.clone().normalize()));
      const current = meshes.map((mesh) => positions(mesh));
      if (frame === 0) firstPositions = current;
      for (let m = 0; m < meshes.length; m++) {
        const values = current[m];
        for (let v = 0; v < values.length; v += 3) {
          a.fromArray(values, v); b.fromArray(bind[m], v);
          finite &&= Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.z);
          maxDisplacement = Math.max(maxDisplacement, a.distanceTo(b));
          if (b.y < 0.2) maxBaseDisplacement = Math.max(maxBaseDisplacement, a.distanceTo(b));
          if (frame === 60) { b.fromArray(firstPositions[m], v); seamPositionError = Math.max(seamPositionError, a.distanceTo(b)); }
        }
        for (let t = 0; t < triangles[m].length; t++) {
          const base = baseline[m][t];
          if (base.area < minRestTriangleArea) continue;
          const sample = triangleMeasure(values, triangles[m][t]);
          const ratio = sample.area / base.area;
          const detail = () => ({ mesh: meshes[m].name, frame, indices: triangles[m][t], restArea: base.area,
            vertices: triangles[m][t].map((v) => ({ position: Array.from(bind[m].slice(v * 3, v * 3 + 3)),
              weights: [0, 1, 2, 3].map((j) => ({ bone: meshes[m].skeleton.bones[meshes[m].geometry.attributes.skinIndex.getComponent(v, j)]?.name,
                weight: meshes[m].geometry.attributes.skinWeight.getComponent(v, j) })).filter((w) => w.weight > 0) })) });
          if (ratio < minAreaRatio) worstCollapse = detail();
          minAreaRatio = Math.min(minAreaRatio, ratio);
          for (let e = 0; e < 3; e++) if (base.edges[e] > 1e-7) {
            const stretch = sample.edges[e] / base.edges[e];
            if (stretch > maxEdgeStretch) worstStretch = { ...detail(), edge: e, restEdgeLength: base.edges[e] };
            maxEdgeStretch = Math.max(maxEdgeStretch, stretch);
          }
        }
      }
    }
    // An arena yaw and uniform game scale must transform skinned positions rigidly.
    mixer.setTime(clip.duration * 0.5); scene.updateMatrixWorld(true);
    const beforeYaw = meshes.map((mesh) => positions(mesh));
    scene.rotation.y = Math.PI / 2; scene.scale.setScalar(1.8 / 2.65); scene.updateMatrixWorld(true);
    let yawLocalError = 0;
    for (let m = 0; m < meshes.length; m++) {
      const afterYaw = positions(meshes[m]);
      for (let i = 0; i < afterYaw.length; i++) yawLocalError = Math.max(yawLocalError, Math.abs(afterYaw[i] - beforeYaw[m][i]));
    }
    scene.rotation.y = 0; scene.scale.setScalar(1); scene.updateMatrixWorld(true);
    mixer.stopAllAction(); mixer.uncacheRoot(scene);
    const measured = { name: clip.name, durationSeconds: clip.duration, samples: 61, tracks: clip.tracks.length,
      finite, finiteKeyframes, missingBindings, forbiddenTracks, maxQuaternionLengthError: round(maxQuaternionError),
      maxKeyframeRotationStepDegrees: round(maxKeyframeRotationStep * 180 / Math.PI),
      maxKeyframeAngularSpeedDegreesPerSecond: round(maxKeyframeAngularSpeed * 180 / Math.PI),
      maxFixedJointRotationRadians: round(maxFixedJointRotation), seamPositionError: round(seamPositionError),
      maxVertexDisplacement: round(maxDisplacement), maxBaseDisplacement: round(maxBaseDisplacement), maxEdgeStretch: round(maxEdgeStretch),
      minTriangleAreaRatio: round(minAreaRatio),
      maxYawScaleLocalPositionError: round(yawLocalError), worstStretch, worstCollapse };
    row.clips.push(measured);
    deformations.push({ name: clip.name, maxEdgeStretch, minAreaRatio, speed: maxKeyframeAngularSpeed * 180 / Math.PI });
    if (!finite || !finiteKeyframes || missingBindings || forbiddenTracks || maxQuaternionError > 1e-5 || maxFixedJointRotation > 1e-5 ||
      seamPositionError > 1e-4 || maxBaseDisplacement > 1e-4 || yawLocalError > 1e-5) failures.push(`${clip.name}: numerical gate failed`);
    console.log(variant, clip.name, `stretch ${maxEdgeStretch.toFixed(4)}, minimum area ${minAreaRatio.toFixed(4)}, displacement ${maxDisplacement.toFixed(4)}`);
  }
  row.springComparison = [];
  const joints = Object.fromEntries(Object.entries(DUMMY_BONE_NAMES).map(([logical, name]) => [logical, scene.getObjectByName(name)]));
  const mass = variant === 'straw-cloth' ? 0.8 : variant === 'wood-steel' ? 1.3 : 1;
  const gain = 0.2;
  for (const scenario of [
    { name: 'light-sword', amount: 12, py: 1.2, headshot: false, stagger: 0, clip: 'body-hit' },
    { name: 'charged-sword', amount: 24, py: 1.2, headshot: false, stagger: 1, clip: 'heavy-hit' },
    { name: 'body-bolt', amount: 38, py: 1.05, headshot: false, stagger: null, clip: 'body-hit' },
    { name: 'head-bolt', amount: 83, py: 1.58, headshot: true, stagger: null, clip: 'head-hit' },
  ]) {
    const result = { scenario: scenario.name, mass, samples: 61 };
    for (const combined of [false, true]) {
      for (const [bone, rest] of restBones) bone.quaternion.copy(rest);
      scene.updateMatrixWorld(true);
      const pose = new DummyPose(scene, joints), motion = new DummyMotion(1);
      motion.leftSign = DummyPose.leftSign(scene, joints);
      const controller = combined ? new DummyClips(scene, clips, variant) : null;
      for (let frame = 0; frame < 120; frame++) {
        motion.update(1 / 60); controller?.update(1 / 60); pose.apply(motion, combined, combined ? gain : 1);
      }
      const weight = Math.min(3, Math.max(0.3, scenario.amount / 25)) / mass;
      motion.hit({ px: 0.05, py: scenario.py, pz: 0.3, dx: 0.3, dz: -0.95, weight, headshot: scenario.headshot });
      if (scenario.stagger !== null) motion.shove(scenario.py, 0.5, -0.85, scenario.stagger, mass);
      controller?.hit(scenario.headshot ? 'head-hit' : 'body-hit', scenario.amount / 25, mass);
      if (scenario.stagger !== null && scenario.stagger >= 0.7) controller?.hit('heavy-hit', 1 + scenario.stagger, mass);
      let maxEdgeStretch = 1, minAreaRatio = 1, finite = true, worstStretch, worstCollapse, maxBaseDisplacement = 0, maxJointSpeed = 0;
      const previousPose = new Map();
      for (let frame = 0; frame <= 120; frame++) {
        if (frame > 0) motion.update(1 / 60);
        controller?.update(frame > 0 ? 1 / 60 : 0);
        pose.apply(motion, combined, combined ? gain : 1);
        for (const bone of restBones.keys()) {
          const before = previousPose.get(bone);
          if (before) maxJointSpeed = Math.max(maxJointSpeed, before.angleTo(bone.quaternion) * 60);
          previousPose.set(bone, bone.quaternion.clone());
        }
        if (frame % 2 !== 0) continue;
        scene.updateMatrixWorld(true);
        for (let m = 0; m < meshes.length; m++) {
          const values = positions(meshes[m]);
          finite &&= values.every(Number.isFinite);
          for (let v = 0; v < values.length; v += 3) if (bind[m][v + 1] < 0.2) {
            a.fromArray(values, v); b.fromArray(bind[m], v);
            maxBaseDisplacement = Math.max(maxBaseDisplacement, a.distanceTo(b));
          }
          for (let t = 0; t < triangles[m].length; t++) {
            const base = baseline[m][t];
            if (base.area < minRestTriangleArea) continue;
            const sample = triangleMeasure(values, triangles[m][t]), ratio = sample.area / base.area;
            const detail = () => ({ frame, indices: triangles[m][t], restArea: base.area,
              vertices: triangles[m][t].map((v) => ({ position: Array.from(bind[m].slice(v * 3, v * 3 + 3)),
                weights: [0, 1, 2, 3].map((j) => ({ bone: meshes[m].skeleton.bones[meshes[m].geometry.attributes.skinIndex.getComponent(v, j)]?.name,
                  weight: meshes[m].geometry.attributes.skinWeight.getComponent(v, j) })).filter((w) => w.weight > 0) })) });
            if (ratio < minAreaRatio) worstCollapse = detail();
            minAreaRatio = Math.min(minAreaRatio, ratio);
            for (let e = 0; e < 3; e++) if (base.edges[e] > 1e-7) {
              const stretch = sample.edges[e] / base.edges[e];
              if (stretch > maxEdgeStretch) worstStretch = { ...detail(), edge: e, restEdgeLength: base.edges[e] };
              maxEdgeStretch = Math.max(maxEdgeStretch, stretch);
            }
          }
        }
      }
      result[combined ? 'clipsPlusSprings' : 'existingSpringsOnly'] = { finite,
        gain: combined ? gain : 1, maxEdgeStretch: round(maxEdgeStretch), minTriangleAreaRatio: round(minAreaRatio),
        maxJointSpeedDegreesPerSecond: round(maxJointSpeed * 180 / Math.PI), maxBaseDisplacement: round(maxBaseDisplacement),
        worstStretch, worstCollapse };
      if (combined && (!finite || maxBaseDisplacement > 1e-4)) failures.push(`${variant}:${scenario.name}: combined runtime skin gate failed`);
      if (combined) deformations.push({ name: `${variant}:${scenario.name} clips + springs`, maxEdgeStretch, minAreaRatio, speed: maxJointSpeed * 180 / Math.PI });
    }
    row.springComparison.push(result);
    console.log(variant, scenario.name, `existing ${result.existingSpringsOnly.maxEdgeStretch}x / combined ${result.clipsPlusSprings.maxEdgeStretch}x`);
  }
  const shipped = row.springComparison.map((r) => r.existingSpringsOnly);
  row.springBaseline = { maxEdgeStretch: Math.max(...shipped.map((r) => r.maxEdgeStretch)),
    minTriangleAreaRatio: Math.min(...shipped.map((r) => r.minTriangleAreaRatio)),
    maxJointSpeedDegreesPerSecond: Math.max(...shipped.map((r) => r.maxJointSpeedDegreesPerSecond)) };
  for (const d of deformations) {
    if (round(d.maxEdgeStretch) > row.springBaseline.maxEdgeStretch || round(d.minAreaRatio) < row.springBaseline.minTriangleAreaRatio) failures.push(`${d.name}: deforms the skin more than the shipped springs (stretch ${round(d.maxEdgeStretch)} vs ${row.springBaseline.maxEdgeStretch}, area ${round(d.minAreaRatio)} vs ${row.springBaseline.minTriangleAreaRatio})`);
    if (round(d.speed) > row.springBaseline.maxJointSpeedDegreesPerSecond) failures.push(`${d.name}: turns a joint faster than the shipped springs (${round(d.speed)} vs ${row.springBaseline.maxJointSpeedDegreesPerSecond} °/s)`);
  }
  if (sha(source) !== row.sha256) failures.push(`${variant}: source GLB changed during verification`);
  rows.push(row);
}
const report = { schema: 1, originalRevision, motionPath, motionSHA256: sha(motionPath),
  method: 'Three.js GLTFLoader with original Meshopt geometry and bind matrices; all vertices and all nondegenerate triangles, 61 samples per clip. Texture pixels substituted in memory only. Clips evaluated through AnimationMixer by bone name. Separate springComparison uses the actual DummyMotion, DummyPose and DummyClips TypeScript classes on four weapon hits at the arena material masses; existing springs alone and the new clips plus springs are sampled over two seconds at 30 Hz.',
  runtimeSourceSHA256: { dummyMotion: sha('src/client/engine/practice/DummyMotion.ts'), dummyClips: sha('src/client/engine/practice/DummyClips.ts') },
  units: 'original GLB model units, before TrainingDummyAssets game scaling',
  limits: { maxBindPositionError: 0.0001, maxWeightSumError: 'half a storage quantum per weight, × 4 (float32: 4 × 2^-24)',
    deformationAndJointSpeed: 'no worse than the variant\'s shipped springs alone, measured in this run (springBaseline): max edge stretch, min triangle area ratio, max joint speed',
    minRestTriangleArea, excludedSliverReason: 'Area below 1e-8 model units squared is already a numerical sliver in the original bind. These are counted separately; the same cutoff is used by the existing Blender dummy rig gate.',
    maxSeamPositionError: 0.0001, maxQuaternionLengthError: 0.00001, maxFixedJointRotationRadians: 0.00001,
    maxYawScaleLocalPositionError: 0.00001 },
  historyNote: 'beforeSkinRepair records the first complete trial with original weights, earlier clip caps, and full spring gain. Comparing it with this report measures the whole remaster; it does not isolate the effect of weight repair alone.',
  beforeSkinRepair: firstTake, variants: rows, passed: failures.length === 0, failures };
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Report ${reportPath}: ${report.passed ? 'PASS' : 'FAIL'}`);
if (!report.passed) process.exitCode = 1;
