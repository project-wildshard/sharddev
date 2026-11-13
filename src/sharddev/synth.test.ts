// oxlint-disable-next-line import/no-nodejs-modules -- Own only temporary author projects and inspect their published bytes.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Observe native execution and refuse encoded author-module transport.
import { registerHooks } from 'node:module';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve paths inside the owned fixture and check completed execution cleanup.
import { dirname, resolve } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- Inspect the native module location after execution has settled.
import { fileURLToPath } from 'node:url';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Scene } from 'three';
import { expect, test } from 'vitest';
import { encodeCanonicalJson, hashImmutableBytes } from './immutable';
import { readScene } from './scene';
import { synthProject } from './synth';

function project(source: string): string {
  mkdirSync('tmp', { recursive: true });
  const directory = mkdtempSync(resolve('tmp', 'synth-bytes-'));
  writeFileSync(resolve(directory, 'shard.config.ts'), source);
  writeFileSync(resolve(directory, 'keep.txt'), 'independent project bytes');
  return directory;
}

function nativeExecutions() {
  const urls: string[] = [];
  const sizes: number[] = [];
  const hook = registerHooks({ load(url, context, next) {
    if (url.startsWith('data:text/javascript;base64,')) {
      console.info('Synth encoded execution characters', url.length - 'data:text/javascript;base64,'.length);
      throw new Error('Encoded author-module execution is forbidden');
    }
    if (url.includes('/tmp/sdk-execution/module-') && url.endsWith('/bundle.mjs')) {
      urls.push(url); sizes.push(readFileSync(fileURLToPath(url)).byteLength);
    }
    return next(url, context);
  } });
  return { urls, sizes, close: () => hook.deregister() };
}

test('synth publishes exact scene bytes through native text execution and cleans its private module', async () => {
  const directory = project(`import {BoxGeometry,Group,Mesh,MeshStandardMaterial,Scene} from 'three';
export const identity={slug:'synth-byte-fixture'};
export const scene=new Scene();scene.name='舟 é';
const group=new Group();group.name='translated';group.position.set(3,4,5);scene.add(group);
const mesh=new Mesh(new BoxGeometry(2,3,4),new MeshStandardMaterial({color:0xabc123,roughness:.6,metalness:.2}));
mesh.name='box';mesh.position.set(-1,2,-3);group.add(mesh);`);
  const scene = new Scene(); scene.name = '舟 é';
  const group = new Group(); group.name = 'translated'; group.position.set(3, 4, 5); scene.add(group);
  const geometry = new BoxGeometry(2, 3, 4), material = new MeshStandardMaterial({ color: 0xabc123, roughness: .6, metalness: .2 });
  const mesh = new Mesh(geometry, material); mesh.name = 'box'; mesh.position.set(-1, 2, -3); group.add(mesh);
  const execution = nativeExecutions();
  try {
    const expected = new TextEncoder().encode(encodeCanonicalJson(readScene(scene)));
    const first = await synthProject(directory), second = await synthProject(directory);
    expect(first).toEqual(second);
    expect(new Uint8Array(readFileSync(first.path))).toEqual(expected);
    expect(first.hash).toBe(hashImmutableBytes(expected));
    expect(new Uint8Array(readFileSync(resolve(directory, '.wildshard/cache/synth-byte-fixture', first.hash, 'scene.json')))).toEqual(expected);
    expect(execution.urls).toHaveLength(1);
    for (const url of execution.urls) expect(existsSync(dirname(fileURLToPath(url)))).toBe(false);
    expect(readFileSync(resolve(directory, 'keep.txt'), 'utf8')).toBe('independent project bytes');
    console.info('Synth scene parity', { sceneBytes: expected.length, hash: first.hash, nativeExecutions: execution.urls.length, sourceBytes: execution.sizes });
  } finally { execution.close(); geometry.dispose(); material.dispose(); rmSync(directory, { recursive: true, force: true }); }
});

test('failed author evaluation removes its private module and preserves independent project bytes', async () => {
  const directory = project("throw new Error('synth evaluation refusal'); export const identity={slug:'failed-synth'};");
  const execution = nativeExecutions();
  try {
    await expect(synthProject(directory)).rejects.toThrow('synth evaluation refusal');
    expect(execution.urls).toHaveLength(1);
    for (const url of execution.urls) expect(existsSync(dirname(fileURLToPath(url)))).toBe(false);
    expect(readFileSync(resolve(directory, 'keep.txt'), 'utf8')).toBe('independent project bytes');
  } finally { execution.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('raw execution keeps missing-scene and trusted-runtime source refusals', async () => {
  for (const [source, message] of [
    ["export const identity={slug:'missing-scene'};", 'must export a real three.js scene'],
    ["import {Scope} from '@wildshard/engine/app/scope'; export const scene=new Scope('refused');", 'cannot import trusted runtime'],
  ]) {
    if (source === undefined || message === undefined) throw new Error('Missing refusal fixture');
    const directory = project(source);
    try { await expect(synthProject(directory)).rejects.toThrow(message); }
    finally { rmSync(directory, { recursive: true, force: true }); }
  }
});
