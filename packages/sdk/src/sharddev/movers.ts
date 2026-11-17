import { parseMovers } from '@wildshard/format/movers';
import { type AnimationClip, InterpolateLinear, LinearInterpolant, QuaternionLinearInterpolant, Object3D, PropertyBinding } from 'three';
import { lowerMoverMotion, MoverMotionSchema, type MoverMotion, type MoverTrack } from '@wildshard/format/moverMotion';
import { WAVES } from '@wildshard/format/waterWaves';
import * as v from 'valibot';

/** Typed numeric mover declarations: local collider primitives and admitted fixed-step scripts. */
export type MoverData = ReturnType<typeof parseMovers>;

/** Admit detached numeric mover headers through the defining platform grammar, without installing an owner. */
export function parseMoverRows(input: unknown): MoverData { return parseMovers(input); }

/** Lower an admitted stop/trigger/driver recipe to the native fixed-step ABI.
 * Rest coordinates remain caller-owned; all numeric limits and cross-field refusals are defining format checks. */
export function compileMoverMotion(input: unknown, rest: Parameters<typeof lowerMoverMotion>[1]): ReturnType<typeof lowerMoverMotion> {
  return lowerMoverMotion(input, rest);
}

/** A `waves` driver for a body floating in `depth` metres of water: the format's four swell rows, damped over the shore as
 * the drawn sea is. test/mover-swell-parity.test.ts fences the damping against the engine's `seaDamp`. */
export function swellDriver(depth: number): Extract<MoverMotion['driver'], { kind: 'waves' }> {
  const [a, b, c, d] = WAVES;
  if (WAVES.length !== 4 || a === undefined || b === undefined || c === undefined || d === undefined) throw new Error('Four authored wave components required');
  const x = Math.min(1, Math.max(0, depth / 1.5));
  return { kind: 'waves', damping: 0.35 + 0.65 * x * x * (3 - 2 * x), waves: [[...a], [...b], [...c], [...d]] };
}

/** Motion options on a real three.js object, with explicit gameplay activation. */
export interface MoverOptions {
  clip?: AnimationClip;
  trigger: MoverMotion['trigger'];
  driver: MoverMotion['driver'];
  speed?: number;
  loop?: MoverTrack['loop'];
}
/** An ordinary scene object with a stop clip and a fixed data-only mover policy. */
export class Mover extends Object3D {
  /** Actual authored body; its stable name binds the clip. */
  readonly body: Object3D;
  /** Options retained for build-time compilation. */
  readonly options: MoverOptions;
  constructor(body: Object3D, options: MoverOptions) {
    super(); this.body = body; this.options = options; this.name = body.name; this.add(body);
  }
  /** Read real clip keys; unrelated objects, unsupported interpolation or incomplete stops refuse. */
  toMotionData(): MoverMotion {
    const clip = this.options.clip;
    let track: MoverTrack | undefined;
    if (clip !== undefined) {
      if (clip.tracks.length === 0 || clip.tracks.length > 2) throw new Error('Mover clip requires position and/or quaternion');
      const times = [...new Set(clip.tracks.flatMap(channel => [...channel.times]))].sort((a, b) => a - b);
      const common = { clip: clip.name, duration: clip.duration, loop: this.options.loop ?? 'once', speed: this.options.speed ?? 1, times };
      let position: MoverTrack['position'], quaternion: MoverTrack['quaternion'];
      for (const channel of clip.tracks) {
        const binding = PropertyBinding.parseTrackName(channel.name);
        if (channel.getInterpolation() !== InterpolateLinear || Boolean(binding.objectName) || Boolean(binding.propertyIndex) || !['', '.', this.body.name, this.body.uuid].includes(binding.nodeName)) throw new Error('Mover clip must linearly bind its own body');
        // Interpolants are the actual three.js clip law, including shortest-arc quaternion interpolation.
        const sample = binding.propertyName === 'quaternion' ? new QuaternionLinearInterpolant(channel.times, channel.values, 4, new Float64Array(4)) : new LinearInterpolant(channel.times, channel.values, channel.getValueSize(), new Float64Array(channel.getValueSize()));
        if (binding.propertyName === 'position' && channel.getValueSize() === 3 && position === undefined) {
          position = times.map(t => { const [x, y, z] = sample.evaluate(t); if (x === undefined || y === undefined || z === undefined) throw new Error('Missing position key'); return [x, y, z]; });
        } else if (binding.propertyName === 'quaternion' && channel.getValueSize() === 4 && quaternion === undefined) {
          quaternion = times.map(t => { const [x, y, z, w] = sample.evaluate(t); if (x === undefined || y === undefined || z === undefined || w === undefined) throw new Error('Missing quaternion key'); return [x, y, z, w]; });
        } else throw new Error('Mover clips animate each position or quaternion channel once');
      }
      track = { ...common, ...(position === undefined ? {} : { position }), ...(quaternion === undefined ? {} : { quaternion }) };

    }
    return v.parse(MoverMotionSchema, { ...(track === undefined ? {} : { track }), trigger: this.options.trigger, driver: this.options.driver });
  }
  /** Bind authored motion to a numeric collider/rest row while retaining the fixed guest continuation ABI. */
  toMoverData(rest: Omit<MoverData[number], 'module' | 'input' | 'track' | 'trigger' | 'driver'>): MoverData[number] {
    const motion = this.toMotionData(), compiled = compileMoverMotion(motion, rest), row = { ...rest, ...compiled, ...motion };
    parseMovers([row]); return row;
  }
}
