// oxlint-disable-next-line import/no-nodejs-modules -- This fixture owns its source inputs and compiler cache.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve only the small fixture and original author sources.
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { createProjectGeneration } from '../src/sharddev/projectGeneration';
import { hashImmutableBytes } from '../src/sdk/immutable';
import { templateBehaviour, TEMPLATE_BEHAVIOUR_INPUTS } from '../src/shards/_template/generators/behaviour';

test('cached source compilation retains current Wasm bytes, costs and source invalidation', async () => {
  mkdirSync('tmp', { recursive: true }); const root = mkdtempSync(resolve('tmp', 'template-behaviour-'));
  try {
    mkdirSync(resolve(root, 'behaviour'));
    for (const file of TEMPLATE_BEHAVIOUR_INPUTS) writeFileSync(resolve(root, file), readFileSync(resolve('src/shards/_template', file)));
    const assets = new Map<string, Uint8Array>(), ctx = createProjectGeneration(root, 'd'.repeat(64), assets, resolve(root, 'cache'));
    let calls = 0; const counted = { ...ctx, compileScript: (...args: Parameters<typeof ctx.compileScript>) => { calls++; return ctx.compileScript(...args); } };
    const original = await templateBehaviour(counted); expect(calls).toBe(3);
    expect(Object.keys(original).sort()).toEqual(['door', 'idle', 'items']);
    for (const row of Object.values(original)) {
      const bytes = assets.get(row.hash);
      if (bytes === undefined) throw new Error('Missing current compiled Template behaviour');
      expect(bytes.byteLength).toBe(row.compressed);
      expect(hashImmutableBytes(bytes)).toBe(row.hash);
    }
    expect(await templateBehaviour(counted)).toEqual(original); expect(calls).toBe(3);
    expect(await templateBehaviour(createProjectGeneration(root, 'd'.repeat(64), assets, resolve(root, 'cache')))).toEqual(original);
    const door = resolve(root, 'behaviour/door.as'); writeFileSync(door, `${readFileSync(door, 'utf8')}\n// changed source identity\n`);
    expect(await templateBehaviour(counted)).toEqual(original); expect(calls).toBe(6);
    expect([...assets.keys()].sort()).toEqual(Object.values(original).map(row => row.hash).sort());
  } finally { rmSync(root, { recursive: true, force: true }); }
});
