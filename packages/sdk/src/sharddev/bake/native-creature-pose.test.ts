import { expect, test } from 'vitest';
import { Vector3 } from 'three';
import { AnimalSim } from '@wildshard/engine/entities/AnimalSim';
import { createNativeCreaturePoses, NativeCreaturePose, type NativeCreaturePoseRecipe } from '@wildshard/engine/game/plugin/animation';
import { numericCreaturePose, numericCreaturePoseFromBook } from '@wildshard/engine/game/plugin/channelPrograms';
import { creaturePoseRows, numericChannelPrograms } from '../clientChannels';
import { parsePackedCreatureLooks } from '@wildshard/format/speciesLooks';

const recipe: NativeCreaturePoseRecipe = { custom: true, joints: [
  { name: 'body', parent: -1, position: [0, 1, 0], order: 'YXZ', scale: [1, 1, 1] },
  { name: 'head', parent: 0, position: [0, 1, 0], order: 'YXZ', scale: [1, 1, 1] },
] };
function actor(): AnimalSim {
  const body = new AnimalSim({ kind: 'hunter', label: 'Hunter', variant: 'common', rarity: 'common', hp: 30, aggressive: true,
    dims: { bodyY: 1, bodyHalfLen: 1, bodyRadius: .4, headRadius: .3, legLen: 1, feet: [], halfWidth: .4 },
    mods: { speed: 1, chargeDist: 1, damageTaken: 1, chargeDamage: 20, relentless: false } },
  1, 1, 'hunter', { heightAt: () => 0, random: () => .5 });
  body.position.set(10, 0, 20); return body;
}
test('a book pose preserves native joint publication and checks untrusted books', () => {
  const rows = creaturePoseRows({ group: 'pose', programs: [
    ...numericChannelPrograms('head.pose', 'pose', [{ target: 'joint.head', path: ['position', 'x'], expr: b => b.constant(.75) }]),
    ...numericChannelPrograms('body.pose', 'pose', [{ target: 'joint.body', path: ['rotation', 'y'], expr: b => b.constant(.25) }]),
    ...numericChannelPrograms('optional.pose', 'pose', [{ target: 'joint.optional', path: ['rotation', 'x'], expr: b => b.constant(1) }]),
  ] });
  const book = parsePackedCreatureLooks({ poses: { head: rows }, rows: [] });
  const direct = new NativeCreaturePose(actor(), recipe, numericCreaturePose(rows));
  const borrowed = new NativeCreaturePose(actor(), recipe, numericCreaturePoseFromBook(book, 'head'));
  direct.advance(.1, 1, true); borrowed.advance(.1, 1, true);
  direct.publish(); borrowed.publish();
  expect(borrowed.bones['head']?.position.x).toBe(.75);
  expect(borrowed.bones['body']?.rotation.y).toBe(.25);
  expect(borrowed.bones['optional']).toBeUndefined();
  expect(borrowed.snapshot()).toBe(direct.snapshot());
  expect(() => numericCreaturePoseFromBook(book, 'absent')).toThrow('Missing packed creature joint pose');
  const changed = structuredClone(book);
  const head = changed.poses['head'];
  if (head === undefined) throw new Error('Missing copied pose');
  head.programs[0]?.numeric.outputs.push({ property: 'value', target: 'player', path: ['hp'], restore: false, nullable: false });
  expect(() => numericCreaturePoseFromBook(changed, 'head')).toThrow();
  expect(() => numericCreaturePoseFromBook({ poses: { head: { ...rows, programs: 'invalid' } }, rows: [] }, 'head')).toThrow();
});
test('native poses keep contact publication separate and restore quietly before publishing current joints', () => {
  const advanceHead: NonNullable<ConstructorParameters<typeof NativeCreaturePose>[2]> = context => {
    const head = context.bones['head'];
    if (head === undefined) throw new Error('Missing test head');
    head.position.x = 2;
  };
  const body = actor(), pose = new NativeCreaturePose(body, recipe, advanceHead);
  pose.publish();
  const initial = new Vector3(); pose.headWorld(initial);
  body.position.x += 5; pose.advance(.1, 1, true);
  const held = new Vector3(); pose.headWorld(held);
  expect(held.equals(initial)).toBe(true);
  const wire = pose.snapshot(), resumedActor = actor(); resumedActor.position.copy(body.position);
  const resumed = new NativeCreaturePose(resumedActor, recipe, advanceHead);
  resumed.restore(wire); resumed.headWorld(held);
  expect(held.equals(initial)).toBe(true);
  const savedHead = resumed.bones['head'];
  if (savedHead === undefined) throw new Error('Missing restored head');
  expect(savedHead.position.x).toBeGreaterThan(0);
  const before = resumed.snapshot();
  const parsed: unknown = JSON.parse(wire);
  if (typeof parsed !== 'object' || parsed === null) throw new Error('Missing saved pose');
  const invalidScalar = JSON.stringify({ ...parsed, scalar: '{}' });
  for (const invalid of ['{}', invalidScalar, wire.replace('"version":1', '"version":99'), wire.replace('"recipe":', '"foreign":')]) {
    expect(() => resumed.restore(invalid)).toThrow();
    expect(resumed.snapshot()).toBe(before);
  }
  resumed.publish(); resumed.headWorld(held);
  expect(held.x).toBeGreaterThan(initial.x);
  const rear = new Vector3(), front = new Vector3(); resumed.bodyCapsule(rear, front);
  expect([rear.x, rear.y, rear.z].every(Number.isFinite)).toBe(true);
  expect(front.distanceTo(rear)).toBeGreaterThan(0);
  expect(() => new NativeCreaturePose(actor(), recipe)).toThrow('custom pose');
  expect(() => new NativeCreaturePose(actor(), { ...recipe, joints: recipe.joints.slice(0, 1) }, advanceHead)).toThrow('volume joint');
});

test('a bounded pose roster keeps attachment, publication and retirement under the existing owner', () => {
  let calls = 0;
  const animate = (c: Parameters<NonNullable<ConstructorParameters<typeof NativeCreaturePose>[2]>>[0]): void => {
    calls++; const head = c.bones['head']; if (head !== undefined) head.position.x = 2;
  };
  const stale: NativeCreaturePoseRecipe = { custom: true, joints: recipe.joints.slice(0, 1) };
  const poses = createNativeCreaturePoses([{ kind: 'hunter', variant: 'common', pose: stale },
    { kind: 'hunter', variant: 'common', pose: recipe }], 1, new Map([['hunter', animate]]));
  const row = { id: 'first', kind: 'hunter', variant: 'common' }, body = actor();
  expect(() => poses.binding.preflight({ ...row, variant: 'missing' })).toThrow('recipe');
  poses.binding.preflight(row); expect(calls).toBe(0);
  expect(poses.binding.attach(body, row)).toBe(body);
  const pose = poses.get(row.id); if (pose === undefined) throw new Error('Missing attached pose');
  const before = new Vector3(), after = new Vector3(); pose.headWorld(before);
  body.position.x += 5; pose.advance(.1, 1, true); pose.headWorld(after);
  expect(after.equals(before)).toBe(true);
  const wire = pose.snapshot(), callsBeforeRestore = calls;
  pose.restore(wire); expect(calls).toBe(callsBeforeRestore);
  expect(() => pose.restore('{}')).toThrow(); expect(pose.snapshot()).toBe(wire);
  const order: number[] = []; poses.publish(i => { order.push(i); return row.id; }); pose.headWorld(after);
  expect(order).toEqual([0]); expect(after.x).toBeGreaterThan(before.x);
  const next = actor(); expect(() => poses.binding.attach(next, { ...row, id: 'next' })).toThrow('bound');
  expect(Object.hasOwn(next, 'hidden')).toBe(false);
  poses.delete(row.id); expect(poses.get(row.id)).toBeUndefined();
  poses.binding.attach(next, { ...row, id: 'next' }); expect(poses.get('next')).toBeDefined();
  expect(() => createNativeCreaturePoses([], 0)).toThrow('bound');
});
