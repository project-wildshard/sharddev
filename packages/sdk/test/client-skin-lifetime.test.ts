import { afterEach, expect, test, vi } from 'vitest';
// oxlint-disable-next-line import/no-nodejs-modules -- Exercise the released skin bytes in a bounded Node collection fixture.
import { readFileSync } from 'node:fs';
import * as v from 'valibot';
import { AnimationAction, Bone, MeshLambertMaterial } from 'three';
import { Scope } from '@wildshard/engine/app/scope';
import { AnimMachine } from '@wildshard/engine/anim/machine';
import { realGc } from '@wildshard/engine/test/realGc';
import { FilesSchema } from '@wildshard/format/shardSections';
import { parseRows } from '@wildshard/format/rows';
import { SKIN_LOOK_RECIPE, SKIN_CLIPS_RECIPE } from '@wildshard/format/skins';
import * as skinAssets from '@wildshard/format/skinAssets';
import * as skinPlayback from '../src/client/game/shardfile/skinPlayback';
import * as skinLayers from '../src/client/game/shardfile/skinLayerPlayback';
import { loadClientSkins, SkinDriver, type ClientSkin } from '../src/client/game/shardfile/clientSkins';

afterEach(() => { vi.restoreAllMocks(); });

function poses(skin: ClientSkin): number[][] {
  const bones = Object.fromEntries(skin.bones.map(row => {
    const bone = new Bone(); bone.name = row.name; bone.position.fromArray(row.pos); return [row.name, bone];
  }));
  for (const row of skin.bones) {
    const bone = bones[row.name], parent = row.parent === null ? undefined : bones[row.parent];
    if (bone !== undefined && parent !== undefined) parent.add(bone);
  }
  const driver = new SkinDriver(skin, bones), frames: number[][] = [];
  for (const speed of [0, 2, 0]) {
    driver.step({ dt: 1 / 30, t: 1, alive: true, flinch: 0, attack: -1, speed, strafe: 0, scale: 1, phase: .2, state: 'graze' });
    frames.push(Object.values(bones).flatMap(bone => bone.position.toArray().concat(bone.quaternion.toArray(), bone.scale.toArray())));
  }
  return frames;
}

const name = 'a live client skin releases consumed numeric pose tables while its material and animation remain usable';
test(name, async () => {
  await realGc('test/client-skin-lifetime.test.ts', name, async collect => {
    const scope = new Scope('skin.lifetime'), refs: WeakRef<object>[] = [];
    let expectedMaterial: unknown;
    const read = skinAssets.parseSkinFile;
    const capture = vi.spyOn(skinAssets, 'parseSkinFile').mockImplementation(bytes => {
      const file = read(bytes);
      expectedMaterial = file.binding.material;
      for (const layers of Object.values(file.binding.poseLayers ?? {})) {
        for (const layer of layers ?? []) for (const track of layer.tracks) refs.push(new WeakRef(track.values));
      }
      return file;
    });
    const rows = parseRows(JSON.parse(readFileSync('src/shards/_template/data/rows.json', 'utf8')));
    const metadata = v.parse(v.array(v.object({ files: FilesSchema })), JSON.parse(readFileSync('src/shards/_template/data/skins.json', 'utf8')));
    const files = metadata.flatMap(row => row.files), assets = new Map(files.map(file => [file.hash,
      Uint8Array.from(readFileSync(`src/shards/_template/assets/${file.hash}`))]));
    const skins = await loadClientSkins({ rows: { ...rows, looks: [{ id: 'template.look.boar', species: 'boar', recipe: SKIN_LOOK_RECIPE,
      material: null, parameters: { skin: 'bfa4dfc9c18979f904557ee8deab0058b8a399be10266f5fb1578b403f482fd4' },
      animation: { recipe: SKIN_CLIPS_RECIPE, parameters: { attackSpan: 1 } } }] }, files }, assets,
      entry => { expect(entry).toEqual(expectedMaterial); return new MeshLambertMaterial({ color: 0x345678 }); }, scope);
    capture.mockClear(); // Mock call/result logs must not own the parsed binding.
    const skin = [...skins.values()][0];
    if (skin === undefined) throw new Error('Missing released boar skin');
    expect(refs.length).toBeGreaterThan(0);
    const positions = Array.from(skin.geometry.getAttribute('position').array), before = poses(skin);
    try {
      for (const ref of refs) await collect(ref);
      const first = skin.material(), second = skin.material();
      try {
        expect(first).not.toBe(second);
        expect(first.color.getHex()).toBe(0x345678);
        expect(second.color.getHex()).toBe(0x345678);
      } finally { first.dispose(); second.dispose(); }
      expect(Array.from(skin.geometry.getAttribute('position').array)).toEqual(positions);
      expect(skin.clips.size).toBeGreaterThan(0);
      expect(poses(skin)).toEqual(before);
      expect(before.flat().every(Number.isFinite)).toBe(true);
    } finally { scope.dispose(); }
  });
});

const extractedName = 'a live extracted skin releases its unused player and private layers before scope teardown';
test(extractedName, async () => {
  await realGc('test/client-skin-lifetime.test.ts', extractedName, async collect => {
    const scope = new Scope('skin.extracted'), refs: WeakRef<object>[] = [];
    const load = skinPlayback.loadSkin, layers = skinLayers.skinPoseLayers;
    const capturePlayer = vi.spyOn(skinPlayback, 'loadSkin').mockImplementation(async (...args) => {
      const player = await load(...args); refs.push(new WeakRef(player)); return player;
    });
    const captureLayers = vi.spyOn(skinLayers, 'skinPoseLayers').mockImplementation((...args) => {
      const playback = layers(...args); refs.push(new WeakRef(playback)); return playback;
    });
    const rows = parseRows(JSON.parse(readFileSync('src/shards/_template/data/rows.json', 'utf8')));
    const metadata = v.parse(v.array(v.object({ files: FilesSchema })), JSON.parse(readFileSync('src/shards/_template/data/skins.json', 'utf8')));
    const files = metadata.flatMap(row => row.files), assets = new Map(files.map(file => [file.hash,
      Uint8Array.from(readFileSync(`src/shards/_template/assets/${file.hash}`))]));
    const skins = await loadClientSkins({ rows: { ...rows, looks: [{ id: 'template.look.boar', species: 'boar', recipe: SKIN_LOOK_RECIPE,
      material: null, parameters: { skin: 'bfa4dfc9c18979f904557ee8deab0058b8a399be10266f5fb1578b403f482fd4' },
      animation: { recipe: SKIN_CLIPS_RECIPE, parameters: { attackSpan: 1 } } }] }, files }, assets,
      () => new MeshLambertMaterial({ color: 0x345678 }), scope);
    capturePlayer.mockClear(); captureLayers.mockClear();
    const skin = [...skins.values()][0];
    if (skin === undefined) throw new Error('Missing extracted boar skin');
    expect(refs.length).toBeGreaterThan(1);
    const positions = Array.from(skin.geometry.getAttribute('position').array), before = poses(skin);
    let disposed = 0; skin.geometry.addEventListener('dispose', () => { disposed++; });
    try {
      for (const ref of refs) await collect(ref);
      expect(poses(skin)).toEqual(before);
      expect(Array.from(skin.geometry.getAttribute('position').array)).toEqual(positions);
      expect(before.flat().every(Number.isFinite)).toBe(true);
      expect(disposed).toBe(0);
    } finally { scope.dispose(); }
    expect(disposed).toBe(1);
    scope.dispose(); expect(disposed).toBe(1);
  });
});

test.each(['player', 'scope'] as const)('a directly retained player keeps playback and %s-first teardown', async first => {
  const scope = new Scope('skin.direct'), material = new MeshLambertMaterial();
  const metadata = v.parse(v.array(v.object({ files: FilesSchema })), JSON.parse(readFileSync('src/shards/_template/data/skins.json', 'utf8')));
  const files = metadata.flatMap(row => row.files), assets = new Map(files.map(file => [file.hash,
    Uint8Array.from(readFileSync(`src/shards/_template/assets/${file.hash}`))]));
  const json = assets.get('bfa4dfc9c18979f904557ee8deab0058b8a399be10266f5fb1578b403f482fd4');
  if (json === undefined) throw new Error('Missing original boar binding');
  const { row, binding } = skinAssets.parseSkinFile(json), bytes = assets.get(row.file);
  if (bytes === undefined) throw new Error('Missing original boar GLB');
  const player = await skinPlayback.loadSkin(bytes, row, binding, material, scope);
  const joints = (): number[] => player.mesh.skeleton.bones.flatMap(bone => bone.position.toArray().concat(bone.quaternion.toArray(), bone.scale.toArray()));
  let disposed = 0; player.mesh.geometry.addEventListener('dispose', () => { disposed++; });
  try {
    player.play('idle'); const initial = joints(), action = player.machine.action('idle');
    player.update(.25);
    expect(player.clip).toBe('idle');
    expect(action.isRunning()).toBe(true);
    expect(joints()).not.toEqual(initial);
    player.play('idle'); expect(joints()).toEqual(initial);
    expect(disposed).toBe(0);
    if (first === 'player') player.dispose(); else scope.dispose();
    expect(disposed).toBe(1);
    expect(player.mesh.parent).toBeNull();
    expect(action.isRunning()).toBe(false);
  } finally { player.dispose(); scope.dispose(); material.dispose(); }
  expect(disposed).toBe(1);
});

const mixerName = 'an extracted skin releases unused mixer actions and property buffers while its scope lives';
test(mixerName, async () => {
  await realGc('test/client-skin-lifetime.test.ts', mixerName, async collect => {
    const scope = new Scope('skin.mixer'), refs: WeakRef<object>[] = [], seen = new WeakSet();
    let bufferBytes = 0;
    const action: unknown = Reflect.get(AnimMachine.prototype, 'action');
    if (typeof action !== 'function') throw new Error('Missing original animation action method');
    const capture = vi.spyOn(AnimMachine.prototype, 'action').mockImplementation(function captureAction(this: AnimMachine, ...args) {
      const result: unknown = Reflect.apply(action, this, args);
      if (!(result instanceof AnimationAction)) throw new Error('Missing original animation action');
      if (!seen.has(result)) { seen.add(result); refs.push(new WeakRef(result)); }
      const bindings: unknown = Reflect.get(result, '_propertyBindings');
      if (!Array.isArray(bindings)) throw new Error('Missing native animation property bindings');
      for (const binding of bindings) {
        if (typeof binding !== 'object' || binding === null) throw new Error('Invalid animation property binding');
        const buffer: unknown = Reflect.get(binding, 'buffer');
        if (!ArrayBuffer.isView(buffer)) throw new Error('Missing native animation property buffer');
        if (!seen.has(buffer)) { seen.add(buffer); refs.push(new WeakRef(buffer)); bufferBytes += buffer.byteLength; }
      }
      return result;
    });
    const rows = parseRows(JSON.parse(readFileSync('src/shards/_template/data/rows.json', 'utf8')));
    const metadata = v.parse(v.array(v.object({ files: FilesSchema })), JSON.parse(readFileSync('src/shards/_template/data/skins.json', 'utf8')));
    const files = metadata.flatMap(row => row.files), assets = new Map(files.map(file => [file.hash,
      Uint8Array.from(readFileSync(`src/shards/_template/assets/${file.hash}`))]));
    const skins = await loadClientSkins({ rows: { ...rows, looks: [{ id: 'template.look.boar', species: 'boar', recipe: SKIN_LOOK_RECIPE,
      material: null, parameters: { skin: 'bfa4dfc9c18979f904557ee8deab0058b8a399be10266f5fb1578b403f482fd4' },
      animation: { recipe: SKIN_CLIPS_RECIPE, parameters: { attackSpan: 1 } } }] }, files }, assets,
      () => new MeshLambertMaterial(), scope);
    capture.mockClear();
    const skin = [...skins.values()][0];
    if (skin === undefined) throw new Error('Missing extracted mixer skin');
    expect(refs.length).toBe(69); expect(bufferBytes).toBe(9072);
    const before = poses(skin), positions = Array.from(skin.geometry.getAttribute('position').array);
    let disposed = 0; skin.geometry.addEventListener('dispose', () => { disposed++; });
    try {
      for (const ref of refs) await collect(ref);
      expect(poses(skin)).toEqual(before);
      expect(Array.from(skin.geometry.getAttribute('position').array)).toEqual(positions);
      expect(disposed).toBe(0);
    } finally { scope.dispose(); }
    expect(disposed).toBe(1);
  });
});
