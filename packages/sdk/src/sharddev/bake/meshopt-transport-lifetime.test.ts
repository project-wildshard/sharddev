import { expect, test } from 'vitest';
import { BoxGeometry, Mesh, MeshStandardMaterial, type Object3D } from 'three';
// oxlint-disable-next-line import/no-nodejs-modules -- The lifetime proof runs the real decoder in an isolated GC-enabled worker.
import { execFileSync } from 'node:child_process';
// oxlint-disable-next-line import/no-nodejs-modules -- The child configuration stays in owned repository scratch.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve the installed runner without shell interpolation.
import { resolve } from 'node:path';
import { createRigLoader } from '@wildshard/engine/anim/rigParser';
import { MemoryAttribution } from '@wildshard/engine/core/memoryAttribution';
import { staticGlb } from './glb';
import { compressGlb } from './glbCompression';

function isMesh(node: Object3D): node is Mesh { return node instanceof Mesh; }

async function decoded(packed: boolean) {
  const geometry = new BoxGeometry(), material = new MeshStandardMaterial();
  const raw = staticGlb([{ geometry, material, nativeAttributes: true }], 'transport');
  geometry.dispose(); material.dispose();
  const wire = packed ? compressGlb(raw) : raw, ledger = new MemoryAttribution();
  ledger.buffer(wire, { owner: 'transport', asset: 'wire' });
  const gltf = await createRigLoader().parseBytesAsync(wire, '');
  const bin: unknown = await gltf.parser.getDependency('buffer', 0);
  if (!(bin instanceof ArrayBuffer)) throw new Error('Missing physical GLB buffer');
  ledger.buffer(bin, { owner: 'transport', asset: 'parser-bin' });
  let channelBytes = 0;
  gltf.scene.traverse(node => {
    if (!isMesh(node)) return;
    for (const attribute of Object.values(node.geometry.attributes)) {
      ledger.buffer(attribute.array, { owner: 'geometry', asset: 'decoded' });
      channelBytes += attribute.array.byteLength;
    }
    if (node.geometry.index !== null) {
      ledger.buffer(node.geometry.index.array, { owner: 'geometry', asset: 'decoded' });
      channelBytes += node.geometry.index.array.byteLength;
    }
  });
  return { scene: gltf.scene, ledger, channelBytes, wire: new WeakRef(wire.buffer), bin: new WeakRef(bin), parser: new WeakRef(gltf.parser) };
}

test('decoded props retain identical backing after raw and meshopt transport is released', async () => {
  const gc: unknown = Reflect.get(globalThis, 'gc');
  if (typeof gc !== 'function') {
    if (process.env['WS_MESHOPT_GC'] === '1') throw new Error('Meshopt lifetime proof requires --expose-gc');
    mkdirSync('tmp', { recursive: true }); const directory = mkdtempSync(resolve('tmp/meshopt-gc-'));
    try {
      const config = resolve(directory, 'vitest.config.mjs');
      writeFileSync(config, `export default {root:${JSON.stringify(resolve('.'))},test:{include:['src/sharddev/bake/meshopt-transport-lifetime.test.ts'],setupFiles:[],pool:'forks',maxWorkers:1,execArgv:['--expose-gc']}};`);
      const output = execFileSync(process.execPath, ['--expose-gc', resolve('node_modules/vitest/vitest.mjs'), 'run', '--config', config], {
        env: { ...process.env, WS_MESHOPT_GC: '1', NO_COLOR: '1' }, encoding: 'utf8', stdio: 'pipe', timeout: 20_000,
      });
      expect(output).toContain('1 passed');
    } finally { rmSync(directory, { recursive: true, force: true }); }
    return;
  }
  const raw = await decoded(false), packed = await decoded(true);
  try {
    // Keep both decoded scenes alive, including their channel backing, across collection.
    for (let turn = 0; turn < 30; turn++) {
      await new Promise<void>(_resolve => { setTimeout(_resolve, 0); }); Reflect.apply(gc, globalThis, []);
      if ([raw, packed].every(row => row.wire.deref() === undefined && row.bin.deref() === undefined && row.parser.deref() === undefined)) break;
    }
    for (const row of [raw, packed]) {
      expect(row.wire.deref()).toBeUndefined(); expect(row.bin.deref()).toBeUndefined(); expect(row.parser.deref()).toBeUndefined();
      const live = row.ledger.snapshot();
      expect(live.allocations.every(allocation => allocation.owner === 'geometry')).toBe(true);
      expect(live.totals.ram).toBe(row.channelBytes);
      expect(row.scene.children.length).toBeGreaterThan(0);
    }
    expect(packed.ledger.snapshot().totals.ram).toBe(raw.ledger.snapshot().totals.ram);
  } finally {
    for (const row of [raw, packed]) row.scene.traverse(node => {
      if (!isMesh(node)) return;
      node.geometry.dispose(); for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.dispose();
    });
  }
});
