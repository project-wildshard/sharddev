// oxlint-disable-next-line import/no-nodejs-modules -- Own and remove only bounded author publication fixtures.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Keep every publication under the owned project root.
import { resolve } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { build, createFilter } from 'vite';
import * as v from 'valibot';
import { BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial } from 'three';
import { bake, bakeOwned, BakedPiece, Scatter, WholeShape, confined, type BakeInputs } from './bake';
import { BoxCollider } from './physics';
import { encodeCanonicalJson, hashImmutableBytes } from '@wildshard/engine/host/immutable';
import { assertConfigBoundary } from './configBoundary';

const owned: string[] = [];
afterEach(() => { for (const root of owned.splice(0)) rmSync(root, { recursive: true, force: true }); });
function directory(): string { mkdirSync('tmp', { recursive: true }); const root = mkdtempSync(resolve('tmp/bake-owned-')); owned.push(root); return root; }
const hash = (value: unknown): string => hashImmutableBytes(new TextEncoder().encode(encodeCanonicalJson(value)));
function fixture() {
  const geometry = new BoxGeometry(2, 2, 2), material = new MeshStandardMaterial({ color: 0x7b513c, roughness: 1 });
  const scene = new Group(); scene.name = 'owned-fixture';
  const mesh = new Mesh(geometry, material); mesh.name = 'plain'; mesh.position.set(-220, 1, -220); scene.add(mesh);
  const instanced = new InstancedMesh(geometry, material, 2);
  instanced.setMatrixAt(0, new Matrix4().makeTranslation(2, 1, 0)); instanced.setMatrixAt(1, new Matrix4().makeTranslation(-2, 1, 0));
  scene.add(new BakedPiece('piece', [['beam', instanced]], [{ kind: 'box', x: 0, y: 1, z: 0, hx: 3, hy: 1, hz: 1 }], {}, { anchor: [0, 2, 0] }));
  const scatter = new Mesh(geometry, material); scatter.name = 'scatter-model';
  scene.add(new Scatter('scatter', scatter, [new Matrix4().makeTranslation(180, 1, 180)]));
  const white = new MeshStandardMaterial({ color: 0xffffff });
  const whole = new Mesh(geometry, white); whole.name = 'whole-model'; whole.position.set(100, 1, -100); scene.add(new WholeShape('whole', whole));
  const collider = new BoxCollider(4, 2, 2, 'stone'); collider.name = 'wall'; collider.position.set(10, 1, 10); scene.add(collider);
  return { scene, dispose: () => { geometry.dispose(); material.dispose(); white.dispose(); } };
}

test('owned bake names every asset by its bytes and repeats exactly', () => {
  const graph = fixture();
  try {
    const result = bakeOwned(graph.scene, { slug: 'owned-fixture' });
    expect(result.sceneHash).toBeNull(); expect(result.scenePath).toBeNull();
    expect(result.assets.size).toBeGreaterThan(0);
    for (const [id, bytes] of result.assets) expect(hashImmutableBytes(bytes)).toBe(id);
    expect(bake(graph.scene, { slug: 'owned-fixture' })).toEqual(result);
  } finally { graph.dispose(); }
});

test('publication writes the canonical scene under its own hash, both paths, and refuses a changed cache', () => {
  const root = directory(), graph = fixture(), project = realpathSync(root);
  try {
    const result = bake(graph.scene, { slug: 'owned-fixture' }, { project }), sceneHash = hash(result.scene);
    const path = resolve(project, '.wildshard/cache/owned-fixture/scene.json');
    const immutable = resolve(project, '.wildshard/cache/owned-fixture', sceneHash, 'scene.json');
    expect(result.sceneHash).toBe(sceneHash); expect(result.scenePath).toBe(path);
    const expected = encodeCanonicalJson(result.scene);
    expect(readFileSync(path, 'utf8')).toBe(expected); expect(readFileSync(immutable, 'utf8')).toBe(expected);
    expect(bake(graph.scene, { slug: 'owned-fixture' }, { project }).sceneHash).toBe(sceneHash);
    writeFileSync(immutable, 'changed');
    expect(() => bake(graph.scene, { slug: 'owned-fixture' }, { project })).toThrow('cached bytes disagree');
  } finally { graph.dispose(); }
});

test('owned compilation does not publish even when a wider options object retains a project', () => {
  const root = directory(), graph = fixture(); const options: BakeInputs = { project: root };
  try {
    expect(bakeOwned(graph.scene, { slug: 'owned-fixture' }, options).scenePath).toBeNull();
    expect(existsSync(resolve(root, '.wildshard'))).toBe(false);
  } finally { graph.dispose(); }
});

for (const compile of [bake, bakeOwned]) {
  test(`${compile.name} retains identity, duplicate-piece and scatter placement refusals`, () => {
    expect(() => compile(new Group(), { slug: '../escape' })).toThrow('bounded shard slug');
    const duplicates = new Group().add(new BakedPiece('same', [], []), new BakedPiece('same', [], []));
    expect(() => compile(duplicates, { slug: 'fixture' })).toThrow('unique name');
    const scatter = new Scatter('moved', new Group(), []); scatter.position.x = 1;
    expect(() => compile(new Group().add(scatter), { slug: 'fixture' })).toThrow('world origin');
  });
}

test('existing publication still refuses project symlink escapes', () => {
  const root = directory(), outside = directory(); symlinkSync(outside, resolve(root, '.wildshard'));
  expect(() => bake(new Group(), { slug: 'fixture' }, { project: root })).toThrow('outside project');
  expect(() => confined(realpathSync(root), '../outside')).toThrow('outside project');
});

test('only the private publication leaf is marked side-effect-free in source and packed SDK', () => {
  const data = v.parse(v.object({ sideEffects: v.array(v.string()) }), JSON.parse(readFileSync(resolve('src/sharddev/package.json'), 'utf8')));
  const filter = createFilter(data.sideEffects, null, { resolve: resolve('src/sharddev') });
  for (const file of ['bakePublication.ts', 'dist/bakePublication.js']) expect(filter(resolve('src/sharddev', file)), file).toBe(false);
  for (const file of ['bake.ts', 'assets.ts', 'package.json', 'bake/rawTexture.ts', 'future.mjs', 'bake/bakePublication.ts', 'dist/bake.js', 'dist/assets.js', 'dist/bake/props.js']) {
    expect(filter(resolve('src/sharddev', file)), file).toBe(true);
  }
});

for (const name of ['bake', 'bakeOwned']) {
  test(`${name} keeps the unchanged config import boundary`, async () => {
    const entry = resolve('owned-bake-entry');
    const result = await build({ configFile: false, logLevel: 'silent', plugins: [{ name: 'bake-boundary-entry',
      resolveId(id) { return id === entry || id === 'owned-bake-entry' ? '\0owned-bake-entry' : null; },
      load(id) { return id === '\0owned-bake-entry' ? `import {${name}} from '@wildshard/sharddev/bake';export function compile(scene,identity,inputs){return ${name}(scene,identity,inputs);}` : null; },
    }], build: { write: false, minify: false, lib: { entry, formats: ['es'] }, rolldownOptions: { external: [/^node:/u], output: { codeSplitting: false } } } });
    const built = Array.isArray(result) ? result[0] : result;
    if (built === undefined || !('output' in built)) throw new Error('Missing author bundle');
    const chunks = built.output.filter(row => row.type === 'chunk'); expect(chunks).toHaveLength(1);
    for (const chunk of chunks) {
      const imports = [...chunk.imports, ...chunk.dynamicImports];
      const boundary = () => assertConfigBoundary(imports);
      if (name === 'bake') { expect(boundary).toThrow('file access'); expect(imports).toContain('node:fs'); expect(imports).toContain('node:path'); }
      else { expect(boundary).not.toThrow(); expect(imports).not.toContain('node:fs'); expect(imports).not.toContain('node:path'); expect(chunk.code).not.toContain('publishSceneDescription'); }
    }
  });
}
