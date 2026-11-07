import * as v from 'valibot';
import { parseAudioData as parseData, type AudioData as Data } from './audio';
import { AudioZonesSchema, type AudioZones } from '@wildshard/format/audioProfiles';
import { Matrix4, Object3D, Quaternion, Vector3 } from 'three';
import { updateAuthoringMatrix } from './sceneTransform';

/** A named event-to-catalogue voice binding in the author graph, never an AudioContext or a decoder. */
export class Cue extends Object3D {
  /** The admitted voice identity used when the named cue fires. */
  voice: string;
  constructor(id = '', voice = '') { super(); this.name = id; this.voice = voice; }
  /** Copy the voice together with ordinary graph transforms and children. */
  override copy(source: this, recursive = true): this { super.copy(source, recursive); this.voice = source.voice; return this; }
  /** Emit an existing cue row; its event owner, rather than this declaration, supplies any moving sound position. */
  toCueData(): Data['cues'][number] {
    const cue = parseData({ cues: [{ id: this.name, voice: this.voice }], ambience: null, score: 'silent' }).cues[0];
    if (cue === undefined) throw new Error('Missing authored cue'); return cue;
  }
}

/** One horizontal ambience region, using the existing bounded zone/mixer wire contract. */
export class AmbienceZone extends Object3D {
  private recipe: AudioZones['zones'][number];
  constructor(recipe?: AudioZones['zones'][number]) { super(); const data = recipe ?? { id: 'zone', x: 0, z: 0, inner: 0, outer: 1, gain: 1 }; this.recipe = structuredClone(data); this.name = data.id; this.position.set(data.x, 0, data.z); }
  /** Copy the zone recipe without aliasing mutable author objects. */
  override copy(source: this, recursive = true): this { super.copy(source, recursive); this.recipe = structuredClone(source.recipe); return this; }
  /** Horizontal similarity transforms move the centre and scale its radii once; tilted or elliptic zones refuse. */
  toZoneData(): AudioZones['zones'][number] {
    updateAuthoringMatrix(this);
    const at = new Vector3(), rotation = new Quaternion(), scale = new Vector3(); this.matrixWorld.decompose(at, rotation, scale);
    const composed = new Matrix4().compose(at, rotation, scale);
    if (this.matrixWorld.elements.some((value, index) => Math.abs(value - (composed.elements[index] ?? Infinity)) > 1e-8)) throw new Error('Ambience zone requires an unsheared transform');
    if (![...at, ...rotation, ...scale].every(Number.isFinite) || at.y !== 0 || Math.abs(rotation.x) > 1e-8 || Math.abs(rotation.z) > 1e-8 || scale.x <= 0 || Math.abs(scale.x - scale.z) > 1e-8) throw new Error('Ambience zone requires a horizontal circular transform');
    return { ...this.recipe, id: this.name, x: at.x, z: at.z, inner: this.recipe.inner * scale.x, outer: this.recipe.outer * scale.x, ...(this.recipe.fade === undefined ? {} : { fade: this.recipe.fade * scale.x }) };
  }
}

/** A retained audio profile plus graph cue/zone declarations. It emits data without loading or playing a sound. */
export class Score extends Object3D {
  private recipe: Data;
  constructor(recipe: Data = parseData({ cues: [], ambience: null, score: 'silent' })) { super(); this.recipe = structuredClone(parseData(recipe)); this.name = 'audio'; }
  /** Adopt an existing profile with cue and zone objects in their exact original registration order. */
  static fromData(recipe: Data): Score {
    const data = parseData(recipe), score = new Score({ ...data, cues: [], ...(data.zones === undefined ? {} : { zones: { ...data.zones, zones: [] } }) });
    score.add(...data.cues.map(cue => new Cue(cue.id, cue.voice)));
    score.add(...(data.zones?.zones.map(zone => new AmbienceZone(zone)) ?? []));
    return score;
  }
  /** Copy the data profile without sharing mutable rows with the original. */
  override copy(source: this, recursive = true): this { super.copy(source, recursive); this.recipe = structuredClone(source.recipe); return this; }
  /** Combine graph rows with the retained music/sample/mixer profile under the single defining format schema. */
  toAudioData(cues?: readonly Data['cues'][number][], zones?: readonly AudioZones['zones'][number][]): Data {
    const ownedCues: Data['cues'] = [], ownedZones: AudioZones['zones'] = [];
    if (cues === undefined || zones === undefined) this.traverse(object => {
      if (cues === undefined && object instanceof Cue) ownedCues.push(object.toCueData());
      if (zones === undefined && object instanceof AmbienceZone) ownedZones.push(object.toZoneData());
    });
    const selectedCues = cues ?? ownedCues, selectedZones = zones ?? ownedZones;
    if (selectedZones.length > 0 && this.recipe.zones === undefined) throw new Error('Ambience zones require a declared mixer profile');
    const data = { ...this.recipe, cues: [...this.recipe.cues, ...selectedCues], ...(this.recipe.zones === undefined ? {} : { zones: { ...this.recipe.zones, zones: [...this.recipe.zones.zones, ...selectedZones] } }) };
    if (data.zones !== undefined) v.parse(AudioZonesSchema, data.zones);
    return parseData(data);
  }
}
