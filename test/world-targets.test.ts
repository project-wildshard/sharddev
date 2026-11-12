import { expect, test } from 'vitest';
// oxlint-disable-next-line import/no-nodejs-modules -- Exercise the real author writer and inventory verifier in one owned fixture.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve only files in the test's owned generated product.
import { resolve } from 'node:path';
import { Vector3 } from 'three';
import { Flags } from '../src/shared/engine/world/interact/flags';
import { ContactFamily, type ContactMoveRow, type WeaponContactMove } from '../src/server/engine/combat/contactWeapon';
import { WorldTargetHost } from '../src/shared/game/shardfile/worldTargets';
import { parseWorldTargets, worldTargetSpots, worldTargetRules } from '@wildshard/format/worldTargets';
import { buildDecisionRegistries } from '@wildshard/format/decisionBindings';
import { emptyShardfile } from '../src/sharddev/author';
import { emitPlatformSections } from '../src/sharddev/platformSections';
import { parsePlatformDataSection } from '@wildshard/format/platformDataSections';
import { headlessSections } from '../src/sdk/headlessSections';
import { writeOutputProduct, validateOutputProduct } from '../src/sharddev/outputProduct';
import { encodeCanonicalJson, hashImmutableBytes } from '../src/sdk/immutable';
import { FAN_CONTACTS } from '../src/shards/far-reach/generators/rows/fanContacts';
import { WHIP_CONTACT_MOVES } from '../src/shards/sunscar-dunes/generators/rows/whipContacts';

const from = new Vector3(), dir = new Vector3(0, 0, -1);
function contacts(rows: typeof FAN_CONTACTS | typeof WHIP_CONTACT_MOVES, weaponId: string): ContactMoveRow[] {
  const result: ContactMoveRow[] = [];
  for (const row of rows) {
    const hits: WeaponContactMove[] = [];
    for (const hit of row.hits) hits.push({ ...hit, source: 'env', weaponId });
    result.push({ ...row, hits });
  }
  return result;
}

function fixture() {
  const flags = new Flags('world-targets', false), hints: string[] = [], actions: string[] = [];
  const owners = { flags, hints: { show: (text: string) => { hints.push(text); } },
    interactions: new Map([['crank', { run: () => { flags.set('raised'); actions.push('crank'); return true; } }],
      ['refused', { run: () => false }]]) };
  return { flags, hints, actions, owners };
}
function cone() {
  return parseWorldTargets({ targets: ['grove', 'keeper', 'ruin'].map((id, index) => ({ id, weapon: 'weapon.far-reach.fan',
    at: [index - 1, 0, -5], radius: 0, needs: { all: ['far.notes'], none: [`far.vane.${id}`] },
    scan: { kind: 'cone', reach: 11, halfAngle: .75, selection: 'all' }, rules: [{ move: 'far.fan.gust', contact: 0,
      effects: [{ kind: 'flag', id: `far.vane.${id}` }, { kind: 'hint', text: 'A vane turns' }], caught: 'if-applied' }] })), spots: [] });
}
function ray() {
  return parseWorldTargets({ targets: [{ id: 'crank', weapon: 'weapon.sunscar-dunes.whip', at: [0, 0, -4], radius: .8,
    needs: { none: ['raised'] }, scan: { kind: 'ray', selection: 'nearest' }, rules: [
      { move: 'sunscar.whip.crack', contact: 0, effects: [{ kind: 'hint', text: 'Pull' }], caught: 'always' },
      { move: 'sunscar.whip.double.1', contact: 0, effects: [], caught: 'always' },
      { move: 'sunscar.whip.double.2', contact: 1, effects: [{ kind: 'interaction', id: 'crank' }], caught: 'if-applied' },
    ] }], spots: [] });
}

test('actual fan landing turns every eligible target in authored order, only on gust ordinal zero', () => {
  const f = fixture(), host = new WorldTargetHost(cone(), f.owners);
  const family = new ContactFamily(contacts(FAN_CONTACTS, 'weapon.far-reach.fan'), { hit: () => null, targets: () => [] });
  family.bindWorldTargets(host);
  family.land(2, 0, from, dir); expect(f.hints).toEqual([]);
  f.flags.set('far.notes'); family.land(0, 0, from, dir); expect(f.hints).toEqual([]);
  family.land(2, 0, from, dir);
  expect(f.flags.all).toEqual(['far.notes', 'far.vane.grove', 'far.vane.keeper', 'far.vane.ruin']);
  expect(f.hints).toEqual(['A vane turns', 'A vane turns', 'A vane turns']);
  family.land(2, 0, from, dir); expect(f.hints).toHaveLength(3);
});

test('actual delayed lash preserves light hint, silent absorbed first contact, and second-contact crank', () => {
  const f = fixture(), host = new WorldTargetHost(ray(), f.owners), catches: number[] = [];
  const family = new ContactFamily(contacts(WHIP_CONTACT_MOVES, 'weapon.sunscar-dunes.whip'),
    { hit: () => null, targets: () => [], aim: (out, direction) => { out.copy(from); direction.copy(dir); return true; }, caught: (_target, second) => { catches.push(Number(second)); } });
  family.bindWorldTargets(host);
  family.swing(0); family.advance(.12); expect(f.hints).toEqual(['Pull']); expect(f.actions).toEqual([]);
  family.cancel(); family.cool(1); family.swing(1); family.advance(.12);
  expect(f.actions).toEqual([]); expect(catches).toEqual([0, 0]);
  family.advance(.2); expect(f.actions).toEqual(['crank']); expect(catches).toEqual([0, 0, 1]);
  family.land(1, 1, from, dir); expect(f.actions).toEqual(['crank']); expect(catches).toEqual([0, 0, 1]);
});

test('nearest geometry is chosen before gates or rules and ties keep authored order', () => {
  const f = fixture(), rows = ray();
  const first = rows.targets[0]; if (first === undefined) throw new Error('Missing target');
  rows.targets.push({ ...first, id: 'behind', at: [0, 0, -6], needs: {}, rules: [{ move: 'sunscar.whip.crack', contact: 0, effects: [{ kind: 'flag', id: 'behind' }], caught: 'if-applied' }] });
  f.flags.set('raised'); const host = new WorldTargetHost(rows, f.owners);
  expect(host.scan({ weapon: first.weapon, move: 'sunscar.whip.crack', contact: 0, reach: 8, width: .9, from, dir })).toEqual([]);
  expect(f.flags.has('behind')).toBe(false);
});

test('ray targets retain the shipping light and heavy reach rather than sharing a wider range', () => {
  const f = fixture(), rows = ray(), target = rows.targets[0]; if (target === undefined) throw new Error('Missing target');
  target.at = [0, 0, -8.4]; let caught = 0;
  const family = new ContactFamily(contacts(WHIP_CONTACT_MOVES, 'weapon.sunscar-dunes.whip'),
    { hit: () => null, targets: () => [], caught: () => { caught++; } });
  family.bindWorldTargets(new WorldTargetHost(rows, f.owners));
  family.land(0, 0, from, dir); expect(f.hints).toEqual([]); expect(caught).toBe(0);
  family.land(1, 0, from, dir); expect(caught).toBe(1);
});

test('full three-dimensional cone keeps boundary, coincident and zero-aim laws without occlusion', () => {
  const f = fixture(), rows = cone(), first = rows.targets[0]; if (first === undefined) throw new Error('Missing target');
  f.flags.set('far.notes'); rows.targets = [{ ...first, at: [0, 11, 0] }];
  expect(new WorldTargetHost(rows, f.owners).scan({ weapon: first.weapon, move: 'far.fan.gust', contact: 0, reach: 8, width: .9, from, dir })).toEqual([]);
  const up = new Vector3(0, 2, 0);
  expect(new WorldTargetHost(rows, f.owners).scan({ weapon: first.weapon, move: 'far.fan.gust', contact: 0, reach: 8, width: .9, from, dir: up })).toHaveLength(1);
  f.flags.clear('far.vane.grove'); rows.targets = [{ ...first, at: [0, 0, 0] }];
  expect(new WorldTargetHost(rows, f.owners).scan({ weapon: first.weapon, move: 'far.fan.gust', contact: 0, reach: 8, width: .9, from, dir: new Vector3() })).toHaveLength(1);
});

test('refused interaction leaves later flags/hints untouched and does not claim an applied catch', () => {
  const f = fixture(), rows = ray(), first = rows.targets[0]; if (first === undefined) throw new Error('Missing target');
  first.rules = [{ move: 'sunscar.whip.crack', contact: 0, effects: [{ kind: 'flag', id: 'bad' }, { kind: 'interaction', id: 'refused' }, { kind: 'hint', text: 'bad' }], caught: 'if-applied' }];
  const host = new WorldTargetHost(rows, f.owners);
  expect(host.contact({ weapon: first.weapon, move: 'sunscar.whip.crack', contact: 0, reach: 8, width: .9, from, dir })).toBeNull();
  expect(f.flags.all).toEqual([]); expect(f.hints).toEqual([]);
});

test('named perch resolver and compiler catalogue share real immutable point identities across section/worker admission', () => {
  const data = parseWorldTargets({ targets: [], spots: [{ id: 'high.perch', at: [1, 2, 3], yaw: .25 }] });
  const emitted = emitPlatformSections(new Map([['world/targets', data]]));
  const admitted = parsePlatformDataSection('world/targets', data);
  expect(emitted.sections[0]?.schema).toBe('wildshard:world/targets@1');
  expect(headlessSections(new Map([['world/targets', admitted]])).get('world/targets')).toEqual(data);
  expect(worldTargetSpots(data).get('high.perch')).toEqual({ x: 1, y: 2, z: 3, yaw: .25 });
  expect(buildDecisionRegistries(emptyShardfile({ slug: 'targets', name: 'Targets', author: 'Test', revision: 1, seed: 1 }), [], data).spots?.get('high.perch')).toBe(1);
});

test('bad declarations refuse before the world is touched', () => {
  const f = fixture(), rows = ray();
  expect(() => new WorldTargetHost(rows, { ...f.owners, interactions: new Map() })).toThrow('Missing world target interaction');
  expect(() => parseWorldTargets({ ...rows, targets: [...rows.targets, ...rows.targets] })).toThrow();
  expect(() => parseWorldTargets({ ...rows, extra: () => true })).toThrow();
  expect(worldTargetRules(rows, emptyShardfile({ slug: 'targets', name: 'Targets', author: 'Test', revision: 1, seed: 1 }))).toContain('world target move/contact resolves on its declared weapon');
  expect(f.flags.all).toEqual([]); expect(f.hints).toEqual([]);
});

test('writer and full inventory validator refuse dangling target identities even with valid section hashes', () => {
  mkdirSync('tmp', { recursive: true }); const folder = mkdtempSync(resolve('tmp/world-target-output-'));
  try {
    const source = emptyShardfile({ slug: 'targets', name: 'Targets', author: 'Test', revision: 1, seed: 1 });
    const data = parseWorldTargets({ targets: [], spots: [{ id: 'perch', at: [1, 2, 3], yaw: 0 }] });
    const index = writeOutputProduct(source, new Map(), folder, { platform: emitPlatformSections(new Map([['world/targets', data]])) });
    expect(validateOutputProduct(folder).index.sections.some(row => row.name === 'world/targets')).toBe(true);
    const invalid = emitPlatformSections(new Map([['world/targets', ray()]]));
    expect(() => writeOutputProduct(source, new Map(), folder, { platform: invalid })).toThrow('world target move/contact');
    const entry = index.sections.find(row => row.name === 'world/targets'); if (entry === undefined) throw new Error('Missing section');
    const bytes = new TextEncoder().encode(encodeCanonicalJson(ray()));
    entry.hash = hashImmutableBytes(bytes); entry.bytes = bytes.length;
    writeFileSync(resolve(folder, entry.path), bytes); writeFileSync(resolve(folder, 'shard.json'), encodeCanonicalJson(index));
    expect(() => validateOutputProduct(folder)).toThrow('world target move/contact');
  } finally { rmSync(folder, { recursive: true, force: true }); }
});
