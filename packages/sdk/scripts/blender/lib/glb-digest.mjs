#!/usr/bin/env node
// glb-digest.mjs — a GLB's geometry digest, and the comparison `scripts/blender/build.sh --check` makes (M10, E315).
//
//   node scripts/blender/lib/glb-digest.mjs <a.glb>                  the digest as JSON
//   node scripts/blender/lib/glb-digest.mjs <rebuilt.glb> <committed.glb> [--json <out.json>]
//
// Bytes are not compared: the glTF exporter and meshopt are not byte-stable across versions, a Cycles bake is noisy,
// and some builders emit their vertices in a different order run to run. The digest holds the structure (meshes,
// primitives, vertex / triangle counts, attribute sets, materials, textures, nodes, skins, animations), the scene
// bounds, and a hash of each primitive's positions quantised to 0.1 mm, in any order.
//   IDENTICAL   the same structure and counts, and the same vertices (maybe in another order).
//   EQUIVALENT  the same structure and counts, bounds within 1 mm (or 0.1 % of the extent). It also reports the
//               Hausdorff distance between the two vertex sets (the worst primitive): float noise vs a changed shape.
//   DIFFERENT   anything else. The exit code is 1.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

const round = (x) => Math.round(x * 1000) / 1000;

/** a primitive's positions as a flat Float64Array */
function positions(attr) {
  const n = attr.getCount();
  const out = new Float64Array(n * 3);
  const el = [];
  for (let i = 0; i < n; i++) {
    attr.getElement(i, el);
    out[i * 3] = el[0];
    out[i * 3 + 1] = el[1];
    out[i * 3 + 2] = el[2];
  }
  return out;
}

/** the largest distance from a point of A to its nearest point of B (a uniform grid over B) */
function directed(A, B) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < B.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], B[i + k]);
      hi[k] = Math.max(hi[k], B[i + k]);
    }
  }
  const n = B.length / 3;
  const volume = (hi[0] - lo[0] + 1e-6) * (hi[1] - lo[1] + 1e-6) * (hi[2] - lo[2] + 1e-6);
  const cell = Math.max(1e-4, Math.cbrt(volume / Math.max(1, n)) * 2);
  const cellOf = (v, k) => Math.floor((v - lo[k]) / cell);
  const grid = new Map();
  for (let i = 0; i < n; i++) {
    const key = `${cellOf(B[i * 3], 0)},${cellOf(B[i * 3 + 1], 1)},${cellOf(B[i * 3 + 2], 2)}`;
    const list = grid.get(key);
    if (list === undefined) grid.set(key, [i]);
    else list.push(i);
  }
  let worst = 0;
  for (let j = 0; j < A.length; j += 3) {
    const c = [cellOf(A[j], 0), cellOf(A[j + 1], 1), cellOf(A[j + 2], 2)];
    let best = Infinity;
    // grow a shell of cells until no closer point can be outside it
    for (let r = 0; r < 256 && best > (r - 1) * cell; r++) {
      for (let x = c[0] - r; x <= c[0] + r; x++) {
        for (let y = c[1] - r; y <= c[1] + r; y++) {
          for (let z = c[2] - r; z <= c[2] + r; z++) {
            if (Math.max(Math.abs(x - c[0]), Math.abs(y - c[1]), Math.abs(z - c[2])) !== r) continue;
            for (const i of grid.get(`${x},${y},${z}`) ?? []) {
              best = Math.min(best, Math.hypot(A[j] - B[i * 3], A[j + 1] - B[i * 3 + 1], A[j + 2] - B[i * 3 + 2]));
            }
          }
        }
      }
    }
    worst = Math.max(worst, best);
  }
  return worst;
}

/** the symmetric Hausdorff distance (m) between the vertex sets of corresponding primitives, the worst primitive */
export async function maxVertexDelta(pathA, pathB) {
  const prims = async (f) => (await io.read(f)).getRoot().listMeshes().flatMap((m) => m.listPrimitives().map((p) => p.getAttribute('POSITION')));
  const [pa, pb] = await Promise.all([prims(pathA), prims(pathB)]);
  let worst = 0;
  pa.forEach((a, k) => {
    if (k >= pb.length) return;
    const b = pb[k];
    if (a === null || b === null || a.getCount() === 0 || b.getCount() === 0) return;
    const A = positions(a);
    const B = positions(b);
    worst = Math.max(worst, directed(A, B), directed(B, A));
  });
  return worst;
}

export async function digest(path) {
  const doc = await io.read(path);
  const root = doc.getRoot();
  const hash = createHash('sha1');
  let vertices = 0;
  let triangles = 0;
  const meshes = root.listMeshes().map((m) => ({
    name: m.getName(),
    primitives: m.listPrimitives().map((p) => {
      const pos = p.getAttribute('POSITION');
      const n = pos?.getCount() ?? 0;
      const idx = p.getIndices();
      const tris = Math.floor((idx?.getCount() ?? n) / 3);
      vertices += n;
      triangles += tris;
      const el = [];
      const keys = [];
      for (let i = 0; i < n; i++) {
        pos.getElement(i, el);
        keys.push(`${Math.round(el[0] * 1e4)},${Math.round(el[1] * 1e4)},${Math.round(el[2] * 1e4)}`);
      }
      hash.update(`${keys.sort().join(';')}|`);
      return {
        mode: p.getMode(),
        vertices: n,
        triangles: tris,
        attributes: p.listSemantics().sort(),
        material: p.getMaterial()?.getName() ?? null,
        targets: p.listTargets().length,
      };
    }),
  }));
  const scenes = root.listScenes();
  const bounds = scenes.length > 0 ? getBounds(scenes[0]) : { min: [0, 0, 0], max: [0, 0, 0] };
  return {
    file: path,
    totals: { meshes: meshes.length, primitives: meshes.reduce((s, m) => s + m.primitives.length, 0), vertices, triangles },
    materials: root.listMaterials().map((m) => m.getName()),
    textures: root.listTextures().length,
    nodes: root.listNodes().length,
    skins: root.listSkins().map((s) => s.listJoints().length),
    animations: root.listAnimations().map((a) => ({ name: a.getName(), channels: a.listChannels().length })),
    bounds: { min: bounds.min.map(round), max: bounds.max.map(round) },
    meshes,
    positionHash: hash.digest('hex').slice(0, 16),
  };
}

/** the structure without the file name, the bounds or the hash: what must match exactly */
const shape = (d) => JSON.stringify({ ...d, file: undefined, bounds: undefined, positionHash: undefined });

export function compare(a, b) {
  const notes = [];
  if (shape(a) !== shape(b)) {
    for (const k of ['totals', 'materials', 'textures', 'nodes', 'skins', 'animations']) {
      if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) notes.push(`${k}: ${JSON.stringify(a[k])} vs ${JSON.stringify(b[k])}`);
    }
    if (notes.length === 0) notes.push('per-mesh primitives differ (names, attributes or counts)');
    return { verdict: 'DIFFERENT', notes };
  }
  const extent = Math.max(...b.bounds.max.map((x, i) => x - b.bounds.min[i]), 1);
  const tol = Math.max(1e-3, extent * 1e-3);
  const drift = Math.max(...a.bounds.min.map((x, i) => Math.abs(x - b.bounds.min[i])), ...a.bounds.max.map((x, i) => Math.abs(x - b.bounds.max[i])));
  if (drift > tol) return { verdict: 'DIFFERENT', notes: [`bounds drift ${drift.toFixed(4)} m > ${tol.toFixed(4)} m`] };
  if (a.positionHash === b.positionHash) return { verdict: 'IDENTICAL', notes: [] };
  return { verdict: 'EQUIVALENT', notes: [`same structure and counts, bounds within ${drift.toFixed(4)} m`] };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const ji = args.indexOf('--json');
  const out = ji === -1 ? null : args[ji + 1];
  const files = args.filter((a, i) => a !== '--json' && (ji === -1 || i !== ji + 1));
  const [a, b] = await Promise.all(files.map((f) => digest(f)));
  if (files.length < 2) {
    console.log(JSON.stringify(a, null, 1));
  } else {
    const r = compare(a, b);
    if (r.verdict === 'EQUIVALENT') {
      r.hausdorff = await maxVertexDelta(files[0], files[1]);
      r.notes.push(`the vertex sets are within ${r.hausdorff.toExponential(2)} m of each other (Hausdorff, the worst primitive)`);
    }
    const t = (d) => `${d.totals.meshes} meshes / ${d.totals.primitives} prims / ${d.totals.vertices} v / ${d.totals.triangles} tris / ${d.materials.length} mats / ${d.textures} tex / ${d.animations.length} anims`;
    console.log(`[check] ${r.verdict}  rebuilt   ${t(a)}`);
    console.log(`[check] ${' '.repeat(r.verdict.length)}  committed ${t(b)}`);
    for (const n of r.notes) console.log(`[check]   ${n}`);
    if (out !== null) writeFileSync(out, JSON.stringify({ ...r, rebuilt: a, committed: b }, null, 1));
    process.exitCode = r.verdict === 'DIFFERENT' ? 1 : 0;
  }
}
