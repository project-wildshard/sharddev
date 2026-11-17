import { BufferAttribute, BufferGeometry, Object3D, Vector3 } from 'three';
import { BoxCollider, CapsuleCollider, Collider, HullCollider, MeshCollider, type ColliderData } from './physics';
import { Entry, SocketLift, type EntryData } from './entries';
import { PlayerStart, Spawn } from './spawns';
import { AmbienceZone, Cue, Score } from './sceneAudio';
import type { AudioData } from './audio';
import { Director } from './director';
import type { DirectorStagesData } from '@wildshard/format/directorStages';
import { Mover, type MoverOptions } from './movers';
import { Grapple, Mount, Updraft, Zipline, Ladder, type LadderOptions, type UpdraftOptions, type ZiplineOptions } from './modes';
import type { GrappleMode, RideMode } from '@wildshard/format/modes';
import { readSceneAnimations, restoreSceneAnimations, type SceneAnimation } from './sceneAnimation';

/** Lossless local author parameters, distinct from transformed compiler rows and ordinary node TRS. */
export type SceneDeclaration =
  | { kind: 'entry'; data: EntryData }
  | { kind: 'playerStart' }
  | { kind: 'spawn'; species: string }
  | { kind: 'collider'; shape: ColliderData }
  | { kind: 'cue'; voice: string }
  | { kind: 'zone'; recipe: NonNullable<AudioData['zones']>['zones'][number] }
  | { kind: 'score'; recipe: AudioData }
  | { kind: 'director'; recipe: DirectorStagesData }
  | { kind: 'mover'; body: string; options: Omit<MoverOptions, 'clip'>; clip?: SceneAnimation }
  | { kind: 'zipline'; top: number[]; bottom: number[]; options: ZiplineOptions }
  | { kind: 'updraft'; from: number[]; to: number[]; options: UpdraftOptions }
  | { kind: 'ladder'; bottom: number[]; top: number[]; exit: number[]; normal: number[]; options: LadderOptions }
  | { kind: 'mount'; gaits: RideMode['gaits'] }
  | { kind: 'grapple'; options: Partial<Omit<GrappleMode, 'id'>> };

function identity<T extends Object3D>(object: T): T {
  const copy = object.clone(false);
  copy.matrixAutoUpdate = true; copy.position.set(0, 0, 0); copy.quaternion.identity(); copy.scale.set(1, 1, 1);
  copy.updateMatrixWorld(true);
  return copy;
}

/** Capture original local data, never reverse world scale/rotation from already-rounded compiler output. */
export function readSceneDeclaration(object: Object3D, ids: ReadonlyMap<Object3D, string>): SceneDeclaration | undefined {
  if (object instanceof Entry) return { kind: 'entry', data: object.toEntryData() };
  if (object instanceof PlayerStart) return { kind: 'playerStart' };
  if (object instanceof Spawn) return { kind: 'spawn', species: object.kind };
  if (object instanceof Collider) return { kind: 'collider', shape: identity(object).toColliderData() };
  if (object instanceof Cue) return { kind: 'cue', voice: object.voice };
  if (object instanceof AmbienceZone) return { kind: 'zone', recipe: identity(object).toZoneData() };
  if (object instanceof Score) return { kind: 'score', recipe: object.toAudioData([], []) };
  const director: unknown = object.userData['director'];
  if (director instanceof Director) return { kind: 'director', recipe: director.toJSON() };
  if (object instanceof Mover) {
    const body = ids.get(object.body); if (body === undefined) throw new Error('Mover body is outside the scene');
    object.toMotionData();
    const { clip, ...options } = object.options;
    const animation = clip === undefined ? undefined : readSceneAnimations([clip])[0];
    return { kind: 'mover', body, options: structuredClone(options), ...(animation === undefined ? {} : { clip: animation }) };
  }
  if (object instanceof Zipline) return { kind: 'zipline', top: object.top.toArray(), bottom: object.bottom.toArray(), options: { ...object.options } };
  if (object instanceof Updraft) return { kind: 'updraft', from: object.from.toArray(), to: object.to.toArray(), options: { ...object.options } };
  if (object instanceof Ladder) return { kind: 'ladder', bottom: object.bottom.toArray(), top: object.top.toArray(), exit: object.exit.toArray(), normal: object.normal.toArray(), options: { ...object.options } };
  if (object instanceof Mount) return { kind: 'mount', gaits: { ...object.gaits } };
  if (object instanceof Grapple) return { kind: 'grapple', options: { ...object.options } };
  return undefined;
}

function collider(shape: ColliderData): Collider {
  if (shape.kind === 'box') return BoxCollider.fromData(shape);
  if (shape.kind === 'capsule') return new CapsuleCollider(shape.radius, shape.halfHeight * 2, shape.surface);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float64Array(shape.kind === 'hull' ? shape.points : shape.vertices), 3));
  if (shape.kind === 'trimesh') geometry.setIndex(shape.indices);
  return shape.kind === 'hull' ? new HullCollider(geometry, shape.surface) : new MeshCollider(geometry, shape.surface);
}

/** Recreate the defining SDK declaration without services, physics bodies, sound playback or gameplay grants. */
export function restoreSceneDeclaration(row: SceneDeclaration, node: (id: string) => Object3D): Object3D {
  switch (row.kind) {
    case 'entry': return row.data.kind === 'portalLink' ? new Entry(row.data.edge, 'portalLink', row.data.portal === undefined ? {} : { portal: row.data.portal }) : row.data.kind === 'socketLift' ? new SocketLift(row.data.edge, row.data.lift) : new Entry(row.data.edge, row.data.kind);
    case 'playerStart': return new PlayerStart();
    case 'spawn': return new Spawn(row.species);
    case 'collider': return collider(row.shape);
    case 'cue': return new Cue('', row.voice);
    case 'zone': return new AmbienceZone(row.recipe);
    case 'score': return new Score(row.recipe);
    case 'director': {
      const object = new Object3D(); object.userData['director'] = new Director(row.recipe); return object;
    }
    case 'mover': {
      const clip = row.clip === undefined ? undefined : restoreSceneAnimations([row.clip])[0];
      return new Mover(node(row.body), { ...structuredClone(row.options), ...(clip === undefined ? {} : { clip }) });
    }
    case 'zipline': return new Zipline(new Vector3().fromArray(row.top), new Vector3().fromArray(row.bottom), row.options);
    case 'updraft': return new Updraft(new Vector3().fromArray(row.from), new Vector3().fromArray(row.to), row.options);
    case 'ladder': {
      const ladder = new Ladder(new Vector3().fromArray(row.bottom), new Vector3().fromArray(row.top), new Vector3().fromArray(row.exit), row.options);
      ladder.normal.fromArray(row.normal); return ladder;
    }
    case 'mount': return new Mount(row.gaits);
    case 'grapple': return new Grapple(row.options);
    default: throw new Error('Unknown SDK scene declaration');
  }
}
