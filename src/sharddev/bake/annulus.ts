import * as THREE from 'three';

/** Authored horizontal annulus with native vertex, UV and triangle order. */
export function annulus(inner: number, outer: number, seg: number, arc: number = Math.PI * 2): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], nrm: number[] = [], idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * arc, c = Math.cos(a), s = Math.sin(a);
    pos.push(c * inner, 0, -s * inner, c * outer, 0, -s * outer);
    uv.push(i / seg, 0, i / seg, 1);
    nrm.push(0, 1, 0, 0, 1, 0);
    if (i < seg) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
