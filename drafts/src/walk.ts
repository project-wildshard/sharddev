// Map Lab B (J31): an eye-height walk on the bare terrain, full screen, in its own chunk (three.js loads on the tap).
// Sketch look: flat-shaded region colours. Left half of the screen: a drag stick to walk; right half: drag to look.
// Ground steeper than the player's max climb blocks (AGENTS.md ▸ Physics: 40°).
import * as THREE from 'three';
import type { Atlas, Terrain } from './atlas';
import { h } from './dom';
import { MAX_CLIMB_DEG, cellOf, type Field } from './maplab-math';

const EYE_M = 1.7;
const WALK_MPS = 5;

export function openWalk(a: Atlas, t: Terrain, field: Field, slope: Float32Array): void {
  const { res, size } = t;
  const listeners = new AbortController();
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0b1626');
  scene.fog = new THREE.Fog('#0b1626', 120, 420);
  const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 1000);

  const geo = new THREE.PlaneGeometry(size, size, res - 1, res - 1);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const cats = t.cats.map((c) => new THREE.Color(c.color));
  for (let i = 0; i < pos.count; i++) {
    // PlaneGeometry's rows run from z = −size/2 (north) to +size/2 after the rotation, matching the field's row 0 = north.
    pos.setY(i, field.heights[i] ?? 0);
    const c = cats[field.labels[i] ?? 0] ?? new THREE.Color('#888');
    const steep = (slope[i] ?? 0) > MAX_CLIMB_DEG ? 0.6 : 1;
    colors[i * 3] = c.r * steep;
    colors[i * 3 + 1] = c.g * steep;
    colors[i * 3 + 2] = c.b * steep;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const flat = geo.toNonIndexed();
  flat.computeVertexNormals();
  scene.add(new THREE.Mesh(flat, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  scene.add(new THREE.HemisphereLight('#cfe8ff', '#203040', 1.1));
  const sun = new THREE.DirectionalLight('#ffffff', 1.4);
  sun.position.set(-1, 2, -1);
  scene.add(sun);
  for (const p of t.places) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 14, 8), new THREE.MeshBasicMaterial({ color: '#f2a640' }));
    m.position.set(p.x, heightAt(field, p.x, p.z) + 7, p.z);
    scene.add(m);
  }

  const spawn = t.places[0] ?? { x: 0, z: 0 };
  const me = { x: spawn.x, z: spawn.z - 6, yaw: 0, pitch: 0 }; // facing north, up the fjord
  const stick = { x: 0, y: 0 };
  const hud = h('div', { class: 'wd-label', style: 'position:absolute;left:12px;bottom:calc(env(safe-area-inset-bottom,0px) + 14px);color:#e8f1f5' });
  const close = h('button', { class: 'wd-viewer-close', 'aria-label': 'Close' }, '×');
  const root = h('div', { class: 'wd-viewer', style: 'touch-action:none' }, renderer.domElement, close, hud,
    h('div', { class: 'wd-label', style: 'position:absolute;left:12px;top:calc(env(safe-area-inset-top,0px) + 16px);color:#e8f1f5' }, `${a.name} · walk · left: move · right: look`));
  document.body.append(root);
  const resize = (): void => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize, { signal: listeners.signal });

  const touches = new Map<number, { x0: number; y0: number; x: number; y: number; left: boolean }>();
  const el = renderer.domElement;
  el.style.touchAction = 'none';
  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    touches.set(e.pointerId, { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, left: e.clientX < window.innerWidth / 2 });
  });
  el.addEventListener('pointermove', (e) => {
    const tt = touches.get(e.pointerId);
    if (!tt) return;
    if (tt.left) {
      stick.x = Math.max(-1, Math.min(1, (e.clientX - tt.x0) / 60));
      stick.y = Math.max(-1, Math.min(1, (e.clientY - tt.y0) / 60));
    } else {
      me.yaw -= (e.clientX - tt.x) * 0.005;
      me.pitch = Math.max(-1.2, Math.min(1.2, me.pitch - (e.clientY - tt.y) * 0.005));
    }
    tt.x = e.clientX;
    tt.y = e.clientY;
  });
  const up = (e: PointerEvent): void => {
    const tt = touches.get(e.pointerId);
    if (tt?.left) { stick.x = 0; stick.y = 0; }
    touches.delete(e.pointerId);
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  const keys = new Set<string>();
  let raf = 0;
  const stop = (): void => {
    cancelAnimationFrame(raf);
    listeners.abort();
    renderer.dispose();
    flat.dispose();
    geo.dispose();
    root.remove();
  };
  window.addEventListener('keydown', (e) => { keys.add(e.key.toLowerCase()); if (e.key === 'Escape') stop(); }, { signal: listeners.signal });
  window.addEventListener('keyup', (e) => { keys.delete(e.key.toLowerCase()); }, { signal: listeners.signal });

  let last = performance.now();
  const frame = (now: number): void => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    let fx = stick.x;
    let fy = stick.y;
    if (keys.has('w')) fy -= 1;
    if (keys.has('s')) fy += 1;
    if (keys.has('a')) fx -= 1;
    if (keys.has('d')) fx += 1;
    const fwd = -fy;
    const nx = me.x + (Math.sin(me.yaw) * -fwd + Math.cos(me.yaw) * fx) * WALK_MPS * dt;
    const nz = me.z + (Math.cos(me.yaw) * -fwd - Math.sin(me.yaw) * fx) * WALK_MPS * dt;
    const [ci, cj] = cellOf(field, nx, nz);
    const inside = ci >= 0 && ci < res && cj >= 0 && cj < res;
    const sl = inside ? (slope[cj * res + ci] ?? 90) : 90;
    if (inside && sl <= MAX_CLIMB_DEG) { me.x = nx; me.z = nz; }
    const ground = heightAt(field, me.x, me.z);
    camera.position.set(me.x, ground + EYE_M, me.z);
    camera.rotation.set(me.pitch, me.yaw, 0, 'YXZ');
    const [hi, hj] = cellOf(field, me.x, me.z);
    hud.textContent = `slope ${Math.round(slope[hj * res + hi] ?? 0)}° · ${sl > MAX_CLIMB_DEG ? 'too steep' : 'walkable'} · x ${Math.round(me.x)} z ${Math.round(me.z)}`;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  close.addEventListener('click', stop);
}

/** Bilinear height at (x, z). */
export function heightAt(f: Field, x: number, z: number): number {
  const d = f.size / (f.res - 1);
  const fx = Math.max(0, Math.min(f.res - 1.001, (x + f.size / 2) / d));
  const fz = Math.max(0, Math.min(f.res - 1.001, (z + f.size / 2) / d));
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const tx = fx - i;
  const tz = fz - j;
  const H = (ii: number, jj: number): number => f.heights[jj * f.res + ii] ?? 0;
  return (H(i, j) * (1 - tx) + H(i + 1, j) * tx) * (1 - tz) + (H(i, j + 1) * (1 - tx) + H(i + 1, j + 1) * tx) * tz;
}
