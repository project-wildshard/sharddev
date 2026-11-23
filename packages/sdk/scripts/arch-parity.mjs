#!/usr/bin/env node
// QA-FEEDBACK-2026-11-23-b row 14 (meta): the same build bytes on x86-64 and arm64. Prints one `<name> <sha256>` line per
// check; .github/workflows/arch-parity.yml runs it on an x86-64 and an arm64 runner and fails when the two outputs
// differ. `--native` prints what the host's own Math gives instead (the bug: those lines differ between the runners).
//
//   node scripts/arch-parity.mjs [--native]
//
// math <fn>: deterministicMath over a fixed spread of inputs (specials, tiny to huge, multiples of pi).
// three-rotations: the chain that split Brasscap (three.js rotations from Euler angles, parts turned by them and their
// normals recomputed): with native Math, Brasscap had one normal component 0 on x86-64 and 1.4e-18 on arm64.
import { createHash } from 'node:crypto';
import process from 'node:process';
import { BoxGeometry, CylinderGeometry, Euler, Matrix4, Quaternion, TorusGeometry, Vector3 } from 'three';
import { deterministicMath, installDeterministicMath } from '../src/sharddev/deterministicMath.ts';

const native = process.argv.includes('--native');
if (!native) installDeterministicMath();
const f64 = new Float64Array(1), u8 = new Uint8Array(f64.buffer);
const SPECIAL = [0, -0, 1, -1, 0.5, -0.5, Infinity, -Infinity, Math.PI, -Math.PI, Math.PI / 2, 709.78, -745.1, 5e-324, 1e-310, 22, 710, 2 ** 52, 2 ** 1023];
const RANGES = [1e-9, 1e-3, 0.5, 1, 1.5, 4, 20, 100, 700, 1e5, 1e9, 1e300];

let seed = 0x2545f491;
const random = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
for (const name of Object.keys(deterministicMath)) {
  const fn = native ? Math[name] : deterministicMath[name], hash = createHash('sha256');
  const add = (x, y) => { const v = name === 'atan2' ? fn(x, y) : fn(x); f64[0] = Number.isNaN(v) ? NaN : v; if (!Number.isNaN(v)) hash.update(u8); };
  for (const x of SPECIAL) for (const y of SPECIAL) add(x, y);
  seed = 0x2545f491;
  for (const range of RANGES) for (let i = 0; i < 4000; i++) {
    const x = (random() * 2 - 1) * range, y = (random() * 2 - 1) * range;
    add(name === 'acosh' ? Math.abs(x) + 1 : x, y);
  }
  for (let k = -64; k <= 64; k++) for (const d of [2, 3, 4, 6, 8, 12, 180]) add((k * Math.PI) / d, (k + 0.5) / d);
  console.log(`math ${name} ${hash.digest('hex')}`);
}

const three = createHash('sha256'), row = new Float64Array(16 + 4 + 3), e = new Euler(), q = new Quaternion(), m = new Matrix4(), v = new Vector3();
seed = 0x9e3779b9;
for (let i = 0; i < 20000; i++) {
  e.set((random() * 2 - 1) * Math.PI * 4, (random() * 2 - 1) * Math.PI * 4, (random() * 2 - 1) * Math.PI * 4, i % 2 === 0 ? 'XYZ' : 'YXZ');
  m.makeRotationFromEuler(e);
  q.setFromEuler(e);
  v.set(0, 1, 0).applyQuaternion(q).applyAxisAngle(new Vector3(1, 0, 0), i * 0.01);
  row.set(m.elements, 0); row.set([q.x, q.y, q.z, q.w], 16); row.set([v.x, v.y, v.z], 20);
  three.update(new Uint8Array(row.buffer));
}
const parts = [];
for (let i = 0; i < 24; i++) {
  const angle = (i * Math.PI) / 12, turn = new Matrix4().makeRotationFromEuler(new Euler(angle / 3, angle, Math.PI / 2 - angle / 5));
  for (const geometry of [new BoxGeometry(3.2, 1, 0.1), new CylinderGeometry(0.6, 0.8, 4, 12), new TorusGeometry(2, 0.3, 8, 24)]) {
    const flat = geometry.toNonIndexed();
    flat.applyMatrix4(turn);
    flat.computeVertexNormals();
    parts.push(new Uint8Array(flat.getAttribute('position').array.buffer), new Uint8Array(flat.getAttribute('normal').array.buffer));
  }
}
for (const part of parts) three.update(part);
console.log(`three-rotations ${three.digest('hex')}`);
