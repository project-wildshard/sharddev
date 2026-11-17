// oxlint-disable-next-line import/no-nodejs-modules -- Trusted author fixture writes immutable products to the supplied local directory.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Artifact paths are controlled by the local baker CLI.
import { join } from 'node:path';
import { MeshStandardMaterial, Vector3 } from 'three';
import { loadSkin } from '../../../../src/client/game/shardfile/skinPlayback';
import { parseSkinBindings, parseSkinRows } from '@wildshard/format/skinData';
import { skinLayerDecoded } from '@wildshard/format/skinLayers';
import { bakePoseLayers, type PoseLayer } from './layers';
import type { ClipName } from '../../../../src/client/engine/anim/rig';
import { creatureSkinSource, rangerSkinSource, type SkinSource } from './sources';
import { sampleSkinClip, skinnedGlb, type SampledSkinClip } from '../../../../src/sharddev/bake/export';
import { contentHash, canonicalJson } from '../../../../src/sharddev/project';
import { parseGlb } from '../../../../src/sharddev/assets';

/** The three required export representatives, created independently for every clip to reset closure-owned state. */
export type SkinFixtureKind = 'grey-blob' | 'boar' | 'pine-ranger';
/** The original engine/kit rig and its exact pose closure; Opus uses it for side-by-side motion playback. */
export async function skinFixtureSource(kind: SkinFixtureKind): Promise<SkinSource> { return kind === 'pine-ranger' ? rangerSkinSource() : creatureSkinSource(kind); }
/** Produce deterministic GLB bytes and a data rig binding, never a procedural runtime identifier. */
export async function bakeSkinFixture(kind: SkinFixtureKind): Promise<{ bytes: Uint8Array; metadata: { id: string; file: string; family: string; rig: { skeleton: string; joints: string[][]; clips: readonly ClipName[]; sockets: string[] }; cost: ReturnType<typeof parseGlb>; poseLayers: Partial<Record<ClipName, PoseLayer[]>>; materialNote: string } }> {
  const source = await skinFixtureSource(kind), clips: SampledSkinClip[] = [], poseLayers: Partial<Record<ClipName, PoseLayer[]>> = {};
  try {
    for (const name of source.clips) { const fresh = await skinFixtureSource(kind), base = await skinFixtureSource(kind); try {
      const loops = name === 'walk' || name.startsWith('idle');
      clips.push(sampleSkinClip(fresh.mesh, name, name === 'walk' ? 1 : 2, (time, dt) => loops ? fresh.pose(name, 0, 0, time % 1) : fresh.pose(name, time, dt), name === 'walk' ? 120 : 60));
      if (loops) { const observed = await skinFixtureSource(kind); try { poseLayers[name] = bakePoseLayers(kind, observed, base, name).map((layer) => ({ ...layer, tracks: layer.tracks.map((track) => ({ ...track, values: track.values.map((value) => Math.round(value * 1e7) / 1e7) })) })); } finally { observed.dispose(); } }
    } finally { fresh.dispose(); base.dispose(); } }
    const bytes = await skinnedGlb(source.mesh, clips, kind), cost = parseGlb(bytes);
    cost.decoded += skinLayerDecoded(poseLayers, source.mesh.skeleton.bones.length);
    if (cost.decoded > 25_000_000) throw new Error('Skin layer decoded cap');
    return { bytes, metadata: { id: kind, file: contentHash(bytes), family: kind === 'pine-ranger' ? 'pbr' : 'toon', rig: { skeleton: source.skeleton, joints: [source.mesh.skeleton.bones.map((bone) => bone.name)], clips: source.clips, sockets: source.sockets }, cost, poseLayers, materialNote: kind === 'pine-ranger' ? 'Exact phone hull, UVs and current NPC rig; atlas and normal map remain external KTX2 bindings for the playback builder.' : 'Exact template factory facets, palette, joints and current Animal pose; untextured toon material.' } };
  } finally { source.dispose(); }
}
/** Measure every source vertex at every 60 Hz frame through today's loader, rig binding and animation mixer. */
export async function measureSkinFixture(kind: SkinFixtureKind, result: Awaited<ReturnType<typeof bakeSkinFixture>>): Promise<{ compared: number; maximumVertexError: number }> {
  const rows = parseSkinRows([result.metadata]), row = rows[0]; if (row === undefined) throw new Error('Missing row');
  const bindings = parseSkinBindings([{ skin: kind, material: {}, loops: Object.keys(result.metadata.poseLayers), poseLayers: result.metadata.poseLayers }], rows), binding = bindings[0]; if (binding === undefined) throw new Error('Missing binding');
  const material = new MeshStandardMaterial(), player = await loadSkin(result.bytes, row, binding, material);
  let worst = 0, compared = 0;
  try { for (const name of row.rig.clips) {
    const original = await skinFixtureSource(kind), clip = player.rig.clips.get(name); if (clip === undefined) throw new Error('Missing exported clip'); player.play(name);
    try { const frames = Math.round(clip.duration * 60); for (let frame = 0; frame <= frames; frame++) {
      if (frame > 0) player.update(1 / 60); original.pose(name, frame / 60, frame === 0 ? 0 : 1 / 60); original.mesh.updateMatrixWorld(true); player.root.updateMatrixWorld(true);
      const position = original.mesh.geometry.getAttribute('position'); for (let index = 0; index < position.count; index++) { const expected = original.mesh.getVertexPosition(index, new Vector3()).applyMatrix4(original.mesh.matrixWorld), actual = player.mesh.getVertexPosition(index, new Vector3()).applyMatrix4(player.mesh.matrixWorld); worst = Math.max(worst, actual.distanceTo(expected)); compared++; }
    } } finally { original.dispose(); }
  } } finally { player.dispose(); material.dispose(); }
  return { compared, maximumVertexError: worst };
}
/** Write the three immutable assets and their cost/rig receipt for the engine playback fixture. */
export async function writeSkinFixtures(directory: string): Promise<void> { mkdirSync(directory, { recursive: true }); const rows: (Awaited<ReturnType<typeof bakeSkinFixture>>['metadata'] & {motion: Awaited<ReturnType<typeof measureSkinFixture>>})[] = []; for (const kind of ['grey-blob', 'boar', 'pine-ranger'] as const) { const result = await bakeSkinFixture(kind); writeFileSync(join(directory, result.metadata.file), result.bytes); const motion = await measureSkinFixture(kind, result); if (motion.maximumVertexError >= 0.001) throw new Error('Exported skin motion differs from its source'); rows.push({ ...result.metadata, motion }); } writeFileSync(join(directory, 'skins.json'), canonicalJson(rows.map(({ poseLayers: _layers, ...row }) => row)));
  const bindingPath = join(directory, 'bindings.json'), bindings: unknown = JSON.parse(readFileSync(bindingPath, 'utf8'));
  const old = parseSkinBindings(Array.isArray(bindings) ? bindings.map((binding: unknown) => { if (typeof binding !== 'object' || binding === null) throw new Error('Invalid saved binding'); const copy = { ...binding }; if ('poseLayers' in copy) delete copy.poseLayers; return copy; }) : bindings, parseSkinRows(rows));
  writeFileSync(bindingPath, canonicalJson(old.map((binding) => { const row = rows.find((r) => r.id === binding.skin); if (row === undefined) throw new Error('Missing exported binding'); return { ...binding, loops: Object.keys(row.poseLayers), poseLayers: row.poseLayers }; })));  }
