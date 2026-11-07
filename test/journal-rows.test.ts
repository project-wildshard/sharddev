import * as v from 'valibot';
import { expect, test } from 'vitest';
import { JournalRowSchema, journalImageRefs, journalRowRules } from '@wildshard/format/compendiumRows';
import { parseRows } from '@wildshard/format/rows';
import { preflightAssetGraph } from '@wildshard/format/product';
import { emptyShardfile } from '../src/sharddev/author';
import { declaredCompendium } from '../src/shared/game/shard/declaredRows';
import templateRows from '../src/shards/_template/data/rows.json' with { type: 'json' };
import { PINE_JOURNAL as emitted } from './fixtures/pine-program';

const TEMPLATE_ROWS = parseRows(templateRows);
const row = v.parse(JournalRowSchema, emitted.row);
const base = emptyShardfile({ slug: 'journal-test', name: 'Journal', author: 'Test', revision: 1, seed: 1 });
const def = declaredCompendium(row, base.rows, row.chunkId, hash => `https://test.invalid/${hash}.webp`);
const required = (id: string) => { const entry = def.entries.find(value => value.id === id); if (entry === undefined) throw new Error('Missing journal fixture'); return entry; };

test('rich display rows preserve stamps, icon precedence, all knowledge states and best mass', () => {
  const ghost = required('ghost-stag'), boar = required('ironhide'), place = required('pond');
  expect(def.skin.stamp(ghost)).toBe('Taken'); expect(def.skin.stamp(place)).toBe('Visited');
  expect(def.skin.icon?.(ghost)).toBe('ghost'); expect(def.skin.icon?.(boar)).toBe('ironhide');
  expect(def.skin.icon?.(required('antler-king'))).toBe('antlers'); expect(def.skin.icon?.(place)).toBeUndefined();
  for (const state of ['unknown', 'discovered', 'seen', 'taken'] as const) {
    const stats = { state, seen: 2, taken: 1, best: 0 };
    expect(def.skin.stats(place, stats)).toEqual([{ label: 'Visits', value: '2' },
      { label: 'Status', value: state === 'seen' ? 'Visited' : state === 'unknown' ? '???' : 'Heard of' }]);
    expect(def.skin.stats(ghost, stats)).toEqual([{ label: 'Seen', value: '2' }, { label: 'Taken', value: '1' },
      { label: 'Best', value: '—' }, { label: 'Rarity', value: state === 'unknown' ? '???' : 'Legendary' }]);
  }
  expect(def.skin.stats(ghost, { state: 'taken', seen: 4, taken: 2, best: 123.25 })[2]).toEqual({ label: 'Best', value: '123.25 kg' });
  expect(def.chunkId).toBe('chunk://local/pine-hollow');
  expect(required('ghost-stag').plate.silhouette).not.toBe(required('ghost-stag').plate.sketch);
  expect(def.wall).toEqual({ cabin: 0, at: [-2.27, 0.22, -1.7], yaw: Math.PI / 2, width: 3, rows: [3, 4], rowY: [1.98, 1.12] });
});

test('rich data refuses callbacks, dangling references and uncharged or wrong-kind image roots', () => {
  expect(journalRowRules(row)).toEqual([]);
  expect(() => parseRows({ ...base.rows, compendiums: [{ ...row, stamp: () => 'Taken' }] })).toThrow();
  expect(() => parseRows({ ...base.rows, compendiums: [{ ...row, trophies: [{ entry: 'missing', outline: 'stag', title: 'Missing' }] }] })).toThrow();
  expect(() => parseRows({ ...base.rows, compendiums: [{ ...row, wall: { ...row.wall, rows: [1] } }] })).toThrow();
  const source = { ...base, rows: { ...base.rows, compendiums: [row] } };
  expect(() => preflightAssetGraph(source)).toThrow('Journal image');
  const refs = journalImageRefs(row), files = refs.map(hash => ({ hash, kind: 'image' as const, compressed: 1, decoded: 4, gpu: 4, triangles: 0, draws: 0, dependencies: [], critical: false }));
  expect(() => preflightAssetGraph({ ...source, files, library: [...refs] })).not.toThrow();
  expect(() => preflightAssetGraph({ ...source, files: refs.map(hash => ({ hash, kind: 'binary' as const, compressed: 1, decoded: 4, gpu: 4, triangles: 0, draws: 0, dependencies: [], critical: false })), library: [...refs] })).toThrow('Journal image');
  expect(() => declaredCompendium(row, base.rows, 'test')).toThrow('admitted image');
});

test('the Template keeps its existing basic compendium row and display output', () => {
  const basic = TEMPLATE_ROWS.compendiums[0]; if (basic === undefined || 'kind' in basic) throw new Error('Missing basic compendium fixture');
  const current = declaredCompendium(basic, TEMPLATE_ROWS, 'template');
  expect(current.skin.stamp(current.entries[0] ?? required('pond'))).toBe(basic.stamp);
  expect(current.skin.stats(current.entries[0] ?? required('pond'), { state: 'taken', seen: 1, taken: 1, best: 4 })).toEqual(basic.stats);
  expect(current.entries.map(entry => entry.name)).toEqual(basic.entries.map(entry => entry.name));
});
