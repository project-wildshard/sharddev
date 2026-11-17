import { afterEach, expect, test } from 'vitest';
import { BufferGeometry, IcosahedronGeometry, Matrix4, MeshBasicMaterial, PerspectiveCamera, Scene, SphereGeometry, TorusGeometry, Vector3, type Mesh } from 'three';
import { Scope } from '@wildshard/engine/app/scope';
import { numericChannelPrograms } from '../clientChannels';
import { parsePrivateScene } from '@wildshard/format/clientChannels';
import { parse } from 'valibot';
import { CloudBodySchema } from '@wildshard/format/encounterRows';
import { CloudBody, cloudBodySpecimen } from '@wildshard/engine/game/boss/encounterView';
import { lendLooks } from '@wildshard/engine/game/shardfile/lentLooks';

// A made-up sky whale (the cloud body's fixture second user): a two-bone body, a pearl that opens, its own look and rows.
const geometry = (made: BufferGeometry) => { const { uuid: _uuid, ...row } = new BufferGeometry().copy(made).toJSON(); return row; };
const scene = parsePrivateScene({ version: 1, root: 'view', materials: ['pearl', 'halo', 'band', 'shell', 'eyes'].map(id => ({ kind: 'port', id, source: id })), nodes: [
  { kind: 'group', id: 'view', children: ['root', 'band'] }, { kind: 'group', id: 'root', children: ['tail'] }, { kind: 'group', id: 'tail', position: [0, 0, -10], children: ['pearl', 'eyes'] },
  { kind: 'mesh', id: 'pearl', position: [0, 2, 0], geometry: 'pearl', material: 'pearl', missing: 'empty', children: ['halo', 'shell'] },
  { kind: 'mesh', id: 'halo', geometry: 'halo', material: 'halo', missing: 'empty' }, { kind: 'mesh', id: 'shell', geometry: 'shell', material: 'shell', missing: 'empty', visible: false },
  { kind: 'mesh', id: 'eyes', geometry: 'pearl', material: 'eyes', missing: 'empty' }, { kind: 'mesh', id: 'band', geometry: 'band', material: 'band', missing: 'empty', visible: false }] });
const poses = numericChannelPrograms('whale.pose', 'whale.pose', [
  { target: 'root', path: ['position', 'y'], expr: (b, r) => b.binary('add', r('sky', ['height']), b.binary('mul', b.constant(5), r('pose', ['rise']))) }]);
const whale = parse(CloudBodySchema,{ scene, poses, group: 'whale.pose', root: 'root', scale: 2, shown: ['pearl', 'eyes'],
  geometry: { pearl: geometry(new IcosahedronGeometry(1, 1)), halo: geometry(new SphereGeometry(2, 8, 6)), shell: geometry(new SphereGeometry(3, 8, 6)), band: geometry(new TorusGeometry(3, 0.2, 4, 12)) },
  materials: { pearl: { kind: 'basic', colour: [1, 1, 1], additive: false }, halo: { kind: 'fx', mode: 'beam', colour: [0.5, 0.5, 1], alpha: 0.5 },
    band: { kind: 'basic', colour: [1, 0.8, 0.2], additive: true, opacity: 0 }, shell: { kind: 'fx', mode: 'dome', colour: [1, 1, 1], alpha: 0.5 }, eyes: { kind: 'basic', colour: [2, 2, 2], additive: false } },
  puffs: { rows: [{ bone: 'root', p: [0, 0, 0], r: 2, ph: 0, colour: [0.4, 0.4, 0.5] }, { bone: 'tail', p: [1, 0, 0], r: 1, ph: 1, colour: [0.3, 0.3, 0.4] }],
    bones: ['root', 'tail'], detail: 0, name: 'whale-cloud', look: 'whale-cloud', swell: [0, 1], drift: [1, 1, 0], spin: 0, squash: 1 },
  params: { time: 'uT', focus: 'uPearl', glow: 'uGlow', flash: 'uFlash', alpha: 'uAlpha', fogColour: 'uFogC', fog: 'uFog' },
  focus: { part: 'pearl', open: 'open', colour: [[1, 1, 1], [3, 2, 1]], glow: 'halo', glowAlpha: [0.2, 0.6], lookGlow: [0.1, 0.9], ring: 'band', spin: 1, pulse: [1, 0, 1], dome: 'shell' },
  strip: { from: 'pearl', back: 'tail', reach: 10, colour: [1, 1, 2], segments: 4, every: 0.1, held: [0.5, 0.2], struck: [1, 0.3] } });

let scope = new Scope('unused');
afterEach(() => { scope.dispose(); });

function build(): { body: CloudBody; pose: { rise: number; open: number }; world: Scene; params: Map<string, unknown> } {
  scope = new Scope('sky-whale');
  const params = new Map<string, unknown>(), world = new Scene(), pose = { rise: 0, open: 0 };
  lendLooks(scope, { materials: new Map([['whale-cloud', new MeshBasicMaterial()]]), setParam: (_id, key, value) => { params.set(key, value); }, setTexture: () => undefined,
    bindMeshMap: () => { throw new Error('Unused'); } });
  return { body: new CloudBody(world, whale, pose, new Map([['sky', { height: 40 }]])), pose, world, params };
}

test('a second shard\'s body poses from its own channel rows and churns its puffs on its own bones', () => {
  const { body, pose, world } = build();
  expect(body.visible).toBe(false); expect(body.puffs.visible).toBe(false);
  body.setVisible(true); expect(body.part('eyes').visible).toBe(true);
  pose.rise = 1; body.update(0, new PerspectiveCamera());
  expect(body.part('root').position.y).toBe(45); expect(body.part('root').scale.x).toBe(2);
  const puff = new Vector3().setFromMatrixPosition(new Matrix4().fromArray(body.puffs.instanceMatrix.array, 16));
  expect(puff.toArray().map(n => Math.round(n * 1000) / 1000)).toEqual([2, 45, -20]);
  expect(body.focusWorld(new Vector3()).toArray()).toEqual([0, 49, -20]);
  expect(world.getObjectByName('whale-cloud')).toBe(body.puffs);
});

test('the focus blazes, glows and turns its ring to the camera only while open; the look hears every param', () => {
  const { body, pose, params } = build();
  body.setVisible(true);
  body.update(1, new PerspectiveCamera());
  expect(body.part('band').visible).toBe(false); expect(params.get('uGlow')).toBeCloseTo(0.1);
  pose.open = 1; body.flash.value = 0.7; body.update(2, new PerspectiveCamera());
  const pearl = body.part('pearl') as Mesh, band = body.part('band') as Mesh;
  expect(pearl.material).toHaveProperty('color.r', 3); expect(band.visible).toBe(true); expect(band.material).toHaveProperty('opacity', 1);
  expect([...params.keys()].sort()).toEqual(['uAlpha', 'uFlash', 'uFog', 'uFogC', 'uGlow', 'uPearl', 'uT']);
  expect(params.get('uFlash')).toBe(0.7); expect(params.get('uGlow')).toBeCloseTo(1);
  body.setVisible(false); expect(band.visible).toBe(false); expect(body.part('shell').visible).toBe(false);
});

test('rows refuse a puff on an undeclared bone and a focus part with no declared material', () => {
  scope = new Scope('sky-whale-refusals');
  lendLooks(scope, { materials: new Map([['whale-cloud', new MeshBasicMaterial()]]), setParam: () => undefined, setTexture: () => undefined, bindMeshMap: () => { throw new Error('Unused'); } });
  expect(() => new CloudBody(new Scene(), { ...whale, puffs: { ...whale.puffs, bones: ['root'] } }, { rise: 0, open: 0 }, new Map([['sky', { height: 0 }]]))).toThrow('undeclared bone');
  expect(() => new CloudBody(new Scene(), { ...whale, focus: { ...whale.focus, glow: 'tail' } }, { rise: 0, open: 0 }, new Map([['sky', { height: 0 }]]))).toThrow('declared material');
});

test('the strip shows only while aimed, struck to a point or held out past its part', () => {
  const { body, world } = build();
  const strips = (): number => world.children.filter(child => child.visible && child.type === 'Mesh').length;
  body.setVisible(true); body.update(0, new PerspectiveCamera());
  const shown = strips();
  body.aim(null, 1); body.update(0.2, new PerspectiveCamera()); expect(strips()).toBe(shown + 1);
  body.aim(new Vector3(0, 0, 0), 1); body.update(0.4, new PerspectiveCamera()); expect(strips()).toBe(shown + 1);
  body.aim(null, 0); body.update(0.6, new PerspectiveCamera()); expect(strips()).toBe(shown);
  body.aim(null, 1); body.setVisible(false); expect(strips()).toBe(0);
});


test('the sky whale specimen admits its rows and normalizes the same cloud body', () => {
  build();
  const input = { name: 'whale-specimen', phone: whale, desktop: whale, pose: { rise: 1, open: 0 }, ports: { sky: { height: 40 } } };
  const view = cloudBodySpecimen(input);
  expect(view.name).toBe('whale-specimen');
  const own = view.children[0]; if (own === undefined) throw new Error('Missing normalized hierarchy');
  expect(own.position.y).toBeLessThan(-40);
  expect(() => cloudBodySpecimen({ ...input, surprise: 1 })).toThrow();
  expect(() => cloudBodySpecimen({ ...input, pose: 'open' })).toThrow();
});
