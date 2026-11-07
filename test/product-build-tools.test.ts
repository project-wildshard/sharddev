import { expect, test } from 'vitest';
import { prepareProductBuildTools } from '../scripts/product-build-tools.mjs';
import { runShardBuildPool } from '../scripts/shard-build-pool.mjs';

test('only selected product prerequisites run, once, before every product worker', async () => {
  const started: number[] = [];
  let calls = 0, release = (): void => undefined;
  const ports = { basis: () => { calls++; return new Promise<void>(resolve => { release = resolve; }); } };
  const pool = runShardBuildPool([1, 2], item => { started.push(item); return Promise.resolve(); },
    () => prepareProductBuildTools(['_template', 'blender-template', 'other', 'far-reach', 'far-reach'], undefined, ports));
  expect(calls).toBe(1); expect(started).toEqual([]);
  release(); await pool;
  expect(started).toEqual([1, 2]); expect(calls).toBe(1);
});

test('unselected products and an explicit empty registry invoke no installer', async () => {
  let calls = 0;
  const ports = { basis: () => { calls++; return Promise.resolve(); } };
  expect(await prepareProductBuildTools(['other'], undefined, ports)).toEqual([]);
  expect(await prepareProductBuildTools([], undefined, ports)).toEqual([]);
  expect(await prepareProductBuildTools(['far-reach'], {}, ports)).toEqual([]);
  expect(calls).toBe(0);
});

test('invalid product or tool declarations refuse before installation or worker startup', async () => {
  let calls = 0, workers = 0;
  const ports = { basis: () => { calls++; return Promise.resolve(); } };
  for (const input of [null, [], { 'far-reach': ['foreign'] }, { '../escape': ['basis'] },
    { 'far-reach': [] }, { 'far-reach': ['basis', 'basis'] }]) {
    await expect(runShardBuildPool([1], () => { workers++; return Promise.resolve(); },
      () => prepareProductBuildTools(['far-reach'], input, ports))).rejects.toThrow();
  }
  await expect(prepareProductBuildTools(['../escape'], {}, ports)).rejects.toThrow();
  expect(calls).toBe(0); expect(workers).toBe(0);
});

test('a pinned native prerequisite failure refuses without starting any product', async () => {
  let workers = 0;
  await expect(runShardBuildPool([1, 2], () => { workers++; return Promise.resolve(); },
    () => prepareProductBuildTools(['far-reach'], undefined,
      { basis: () => Promise.reject(new Error('Pinned Basis configure failed')) }))).rejects.toThrow('Pinned Basis configure failed');
  expect(workers).toBe(0);
});
