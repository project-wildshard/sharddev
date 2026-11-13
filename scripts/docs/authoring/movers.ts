import { Group, AnimationClip, VectorKeyframeTrack } from 'three';
import { Mover } from '@wildshard/sdk/movers';

/** Template-style moving door: two local positions and an explicit interaction trigger. */
export function moversExample() {
  const body = new Group(); body.name = 'template.door';
  const clip = new AnimationClip('door.open', 1, [
    new VectorKeyframeTrack('template.door.position', [0, 1], [0, 0, 0, 0, 3, 0]),
  ]);
  const door = new Mover(body, { clip, loop: 'once', trigger: { kind: 'interact', permission: 0 }, driver: { kind: 'track' } });
  const pendulumBody = new Group(); pendulumBody.name = 'template.pendulum';
  const pendulum = new Mover(pendulumBody, { trigger: { kind: 'always' }, driver: { kind: 'pendulum', axis: 'z', amplitude: 0.4, period: 3 } });
  const rest = { id: 'template.door', entity: 1, kind: 'platform' as const,
    at: { x: 0, y: 0, z: -8 }, euler: { x: 0, y: 0, z: 0 }, enabled: true,
    boxes: [{ x: 0, y: 1.5, z: 0, hx: 1, hy: 1.5, hz: 0.2, rot: { x: 0, y: 0, z: 0, w: 1 } }] };
  return { door: door.toMoverData(rest), pendulum: pendulum.toMotionData() };
}
