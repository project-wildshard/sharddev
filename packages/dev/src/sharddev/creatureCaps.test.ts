// ONE-FORMAT CC47: `wildshard check` holds every creature to 64 bones and 16 hit volumes, warns past its size class's
// triangle mark and prints each creature's numbers with the tier on the report card.
// oxlint-disable-next-line import/no-nodejs-modules -- Exercise a real bounded source project and remove it after the proof.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- All fixture assets and outputs belong to repository scratch.
import { resolve } from 'node:path';
import { afterAll, expect, test, vi } from 'vitest';
import * as THREE from 'three';
import { commonCreature } from '@wildshard/kit/creatures';
import { parseRows } from '@wildshard/format/rows';
import { parseShardfile } from '@wildshard/format/shardSchema';
import { prepareAssetDecoders, parseGlb } from '@wildshard/format/shardfileAssets';
import type { CreatureSize } from '@wildshard/format/creatureLayers';
import { creatureGlb, creatureSkin } from '../../../sdk/src/sharddev/scene/creature';
import { hashImmutableBytes } from '../../../sdk/src/sharddev/immutable';
import { emptyShardfile } from '../../../sdk/src/sharddev/author';
import { CREATURE_BONE_CAP, CREATURE_CLASS_MARKS, creatureCapRefusals, creatureCapWarnings, creatureReportLine, type CreatureNumbers } from '../../../sdk/src/sharddev/creatureCaps';
import { closeFixtures, fixtureRoot } from '../../../sdk/src/sharddev/test/ownedScratch';
import { checkProject } from './checkProject';
import { checkLines } from './check';

afterAll(closeFixtures);

const numbers = (row: Partial<CreatureNumbers>): CreatureNumbers => ({ species: 'x', size: 'medium', bones: 20, volumes: 4, triangles: 3_000, decodedBytes: 1_000, ...row });

test('the caps refuse 65 bones and 17 volumes by name and pass 64 and 16', () => {
  expect(creatureCapRefusals([numbers({ bones: 64, volumes: 16 })])).toEqual([]);
  expect(creatureCapRefusals([numbers({ species: 'wyrm', bones: 65 })])).toEqual([{ code: 'creature-bone-cap', message: 'creature wyrm has 65 bones, over the cap of 64' }]);
  expect(creatureCapRefusals([numbers({ species: 'mech', volumes: 17 })])).toEqual([{ code: 'creature-volume-cap', message: 'creature mech has 17 hit volumes, over the cap of 16' }]);
  expect(creatureCapRefusals([numbers({ bones: null })])).toEqual([]);
});

test('each size class warns past its own triangle and texture marks', () => {
  const giant = CREATURE_CLASS_MARKS.giant;
  expect(creatureCapWarnings([numbers({ size: 'giant', triangles: giant.triangles })])).toEqual([]);
  expect(creatureCapWarnings([numbers({ species: 'colossus', size: 'giant', triangles: giant.triangles + 1 })]))
    .toEqual([{ code: 'creature-triangles', message: `creature colossus draws ${giant.triangles + 1} triangles, over the giant mark of ${giant.triangles}` }]);
  // The same triangles a giant may carry warn on a medium body.
  expect(creatureCapWarnings([numbers({ triangles: giant.triangles })]).map(row => row.code)).toEqual(['creature-triangles']);
  expect(creatureCapWarnings([numbers({ size: 'tiny', triangles: 1_000, decodedBytes: 2 * 1_048_576 })]).map(row => row.code)).toEqual(['creature-textures']);
  const marks = Object.values(CREATURE_CLASS_MARKS).map(row => row.triangles);
  expect(marks).toEqual([...marks].sort((a, b) => a - b));
});

test('the report line names the tier and each creature', () => {
  expect(creatureReportLine([numbers({ species: 'deer' }), numbers({ species: 'tree.spirit', bones: null, triangles: null })], 'medium'))
    .toBe('tier medium; deer (medium) 20 bones, 4 volumes, 3000 triangles; tree.spirit (medium) - bones, 4 volumes, - triangles');
  expect(creatureReportLine([], 'small')).toBe('tier small; no creatures');
});

/** A chain of `bones` named bones (`body`, `head`, then `b2`…); one mesh on `body`, a box or a sphere of `detail` segments
 *  (a skin draws one skinned mesh). */
function rig(bones: number, detail = 0) {
  const root = new THREE.Group(), material = new THREE.MeshStandardMaterial();
  root.name = 'fixture';
  let parent: THREE.Object3D = root;
  for (let index = 0; index < bones; index++) {
    const bone = new THREE.Group(); bone.name = ['body', 'head'][index] ?? `b${index}`; bone.position.y = index === 0 ? 0.5 : 0.05;
    parent.add(bone); parent = bone;
  }
  root.children[0]?.add(new THREE.Mesh(detail > 0 ? new THREE.SphereGeometry(0.4, detail, detail) : new THREE.BoxGeometry(0.4, 0.3, 0.6), material));
  return creatureGlb(root, { clips: [new THREE.AnimationClip('idle', 1, [new THREE.VectorKeyframeTrack('body.position', [0, 1], [0, 0.5, 0, 0, 0.5, 0])])] });
}

interface FixtureOptions { readonly bones: number; readonly size?: CreatureSize; readonly volumes?: number; readonly detail?: number }
async function project(options: FixtureOptions): Promise<string> {
  await prepareAssetDecoders();
  const input = rig(options.bones, options.detail), root = fixtureRoot('creature-caps-');
  const content = commonCreature('boar', { id: 'author.caps', look: 'author.caps.look' }), source = emptyShardfile({ slug: 'creature-caps', name: 'Creature caps', author: 'Test', revision: 1, seed: 23 });
  content.species.body = { size: options.size ?? 'small', scale: 1, look: 'author.caps.look' };
  // Every bone of a three.js rig is a socket, and a skin names at most 32: name one, so the rig's own bones are what counts.
  const skin = creatureSkin(input, { id: 'author.caps', binding: { loops: ['idle'], material: { family: 'pbr', vertexColours: true } } });
  (skin.row['rig'] as { sockets: string[] }).sockets = ['body', 'head'];
  const glb = input.glb, file = hashImmutableBytes(glb), cost = parseGlb(glb), metadata = new TextEncoder().encode(JSON.stringify(skin)), hash = hashImmutableBytes(metadata);
  source.rows = parseRows({ ...source.rows, species: [content.species], strikes: content.strikes,
    looks: [{ id: 'author.caps.look', species: 'author.caps', recipe: 'platform.skin', material: null, parameters: { skin: hash }, animation: { recipe: 'platform.clips', parameters: { attackSpan: 1 } } }] });
  source.items.catalogue = content.items;
  const variant = content.species.variants[0]; if (variant === undefined) throw new Error('Missing fixture variant');
  source.creatures.spawns = [{ id: 'caps.actor', species: 'author.caps', variant: variant.id, at: [0, 0, 30], yaw: 0, scale: 1, seed: 1, brain: null, strike: null }];
  source.files = [{ hash: file, kind: 'glb', compressed: glb.length, ...cost, dependencies: [], critical: false },
    { hash, kind: 'json', compressed: metadata.length, decoded: metadata.length * 2, gpu: 0, triangles: 0, draws: 0, dependencies: [file], critical: false }];
  source.library = [hash];
  source.budgets.library = { resident: source.files.reduce((sum, row) => sum + row.decoded + row.gpu, 0), compressed: source.files.reduce((sum, row) => sum + row.compressed, 0) };
  const text = JSON.stringify(parseShardfile(source));
  // Over the cap the format's own parse refuses, so the over-cap source is written as an author would type it.
  const body = source.rows.species[0]?.body;
  if (options.volumes !== undefined && body !== undefined) body.volumes = Array.from({ length: options.volumes }, (_, index) => ({ part: `p${index}`, bone: 'body', shape: 'sphere' as const, radius: 0.1, halfLength: 0, axis: 'y' as const, multiplier: 1 }));
  mkdirSync(resolve(root, 'assets'));
  for (const [name, bytes] of [[file, glb], [hash, metadata]] as const) writeFileSync(resolve(root, 'assets', name), bytes);
  writeFileSync(resolve(root, 'data.json'), options.volumes === undefined ? text : JSON.stringify(source));
  writeFileSync(resolve(root, 'shard.config.ts'), "import input from './data.json' with { type: 'json' };\nexport default input;\n");
  return root;
}

async function check(options: FixtureOptions) {
  const root = await project(options), warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  try { return await checkProject(root, resolve(root, 'checked')); }
  finally { warn.mockRestore(); rmSync(root, { recursive: true, force: true }); }
}

test('check refuses a 65-bone creature by name, passes 64 and prints its numbers and tier', async () => {
  const over = await check({ bones: CREATURE_BONE_CAP + 1 });
  expect(over.verdict).toBe('fail');
  expect(over.refusals).toEqual([expect.objectContaining({ step: 'validate', rule: 'creature-bones', message: 'creature author.caps has 65 bones, over the cap of 64' })]);
  const at = await check({ bones: CREATURE_BONE_CAP });
  expect(at.refusals).toEqual([]); expect(at.verdict).toBe('pass');
  expect(at.steps.find(step => step.name === 'report')?.note).toMatch(/creatures: tier small; author\.caps \(small\) 64 bones, 0 volumes, 12 triangles/u);
}, 120_000);

test('check refuses 17 hit volumes by name', async () => {
  const over = await check({ bones: 2, volumes: 17 });
  expect(over.verdict).toBe('fail');
  expect(over.refusals.map(row => row.rule)).toEqual(['creature-volumes']);
  expect(checkLines(over).join('\n')).toMatch(/17|hit volumes|creature volumes/u);
}, 120_000);

test('a giant over its class\'s triangle mark warns and still passes', async () => {
  const giant = await check({ bones: 2, size: 'giant', detail: 128 });
  expect(giant.refusals).toEqual([]); expect(giant.verdict).toBe('pass');
  expect(giant.warnings.filter(row => row.rule.startsWith('creature-'))).toEqual([expect.objectContaining({ rule: 'creature-triangles', message: expect.stringMatching(/^creature author\.caps draws \d+ triangles, over the giant mark of 24000$/u) })]);
}, 120_000);
