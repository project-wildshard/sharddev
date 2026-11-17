import { AnimationClip, KeyframeTrack, type Bone, type SkinnedMesh, type AnimationBlendMode, type KeyframeTrackJSON } from 'three';

/** Ordered skeleton references and exact bind matrices, independent of randomly generated UUIDs. */
export interface SceneSkin {
  bones: string[];
  inverses: number[][];
  bindMode: SkinnedMesh['bindMode'];
  bindMatrix: number[];
  bindMatrixInverse: number[];
}

/** An ordinary three.js clip with its authored order, duration, blend mode and typed keyframe laws. */
export interface SceneAnimation {
  name: string;
  duration: number;
  blendMode: AnimationBlendMode;
  tracks: KeyframeTrackJSON[];
}

/** Serialize actual rest joints and weights; every joint must belong to the inspected hierarchy. */
export function readSceneSkin(mesh: SkinnedMesh, ids: ReadonlyMap<Bone, string>): SceneSkin {
  const { bones, boneInverses } = mesh.skeleton;
  if (bones.length === 0 || bones.length > 128 || boneInverses.length !== bones.length || new Set(bones).size !== bones.length) throw new Error('Scene skin requires distinct ordered joints and inverse binds');
  const indices = mesh.geometry.getAttribute('skinIndex'), weights = mesh.geometry.getAttribute('skinWeight'), positions = mesh.geometry.getAttribute('position');
  if (!mesh.geometry.hasAttribute('skinIndex') || !mesh.geometry.hasAttribute('skinWeight') || !mesh.geometry.hasAttribute('position') || indices.itemSize !== 4 || weights.itemSize !== 4 || indices.count !== positions.count || weights.count !== positions.count) throw new Error('Scene skin requires four weights and joint indices per vertex');
  for (let vertex = 0; vertex < positions.count; vertex++) for (let component = 0; component < 4; component++) {
    const index = indices.getComponent(vertex, component), weight = weights.getComponent(vertex, component);
    if (!Number.isInteger(index) || index < 0 || index >= bones.length || !Number.isFinite(weight) || weight < 0) throw new Error('Invalid scene skin influence');
  }
  return { bones: bones.map(bone => { const id = ids.get(bone); if (id === undefined) throw new Error('Scene skin joint lies outside its hierarchy'); return id; }),
    inverses: boneInverses.map(matrix => Array.from(matrix.elements)), bindMode: mesh.bindMode, bindMatrix: [...mesh.bindMatrix.elements], bindMatrixInverse: [...mesh.bindMatrixInverse.elements] };
}

/** Preserve standard track interpolation and values; UUID-bound targets and custom interpolants refuse. */
export function readSceneAnimations(clips: readonly AnimationClip[]): SceneAnimation[] {
  if (clips.length > 32 || new Set(clips.map(clip => clip.name)).size !== clips.length) throw new Error('Scene clips require distinct names within the clip cap');
  return clips.map(clip => {
    if (!clip.name || !Number.isFinite(clip.duration) || clip.duration < 0 || clip.duration > 60 || !clip.validate()) throw new Error('Invalid scene animation');
    const tracks = clip.tracks.map(track => {
      if (/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/iu.test(track.name)) throw new Error('Animation must bind stable author names, never UUIDs');
      if (track.times.length === 0 || track.times.length > 4097 || track.times.some((time, index) => !Number.isFinite(time) || time < 0 || time > clip.duration || index > 0 && time <= (track.times[index - 1] ?? Infinity))) throw new Error('Invalid bounded scene track times');
      const row = KeyframeTrack.toJSON(track);
      const restored = AnimationClip.parse({ name: clip.name, duration: clip.duration, blendMode: clip.blendMode, tracks: [row], uuid: '' }).tracks[0];
      if (restored === undefined || !('createInterpolant' in restored) || !('createInterpolant' in track) || restored.createInterpolant !== track.createInterpolant) throw new Error('Custom animation interpolants require their own compiler');
      return row;
    });
    return { name: clip.name, duration: clip.duration, blendMode: clip.blendMode, tracks };
  });
}

/** Reconstruct standard three.js clips without mutating, optimizing or resampling their authored channels. */
export function restoreSceneAnimations(clips: readonly SceneAnimation[]): AnimationClip[] {
  return clips.map(clip => AnimationClip.parse({ ...clip, uuid: '' }));
}
