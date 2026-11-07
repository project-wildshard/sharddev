import originalFinds from './fixtures/nalati-finds-original.json' with {type:'json'};
import { parseFindsCatalogue } from '@wildshard/format/findsCatalogue';
import { nalatiFindsCatalogue } from '../src/shards/nalati-grasslands/generators/finds';
import { NALATI_ECOLOGY as ecology } from '../src/shards/nalati-grasslands/generators/ecology.mjs';
import { expect, test } from 'vitest';
import { createFindsCatalogue } from '../src/shared/game/bag/findsCatalogue';
import type { OwnedId } from '../src/shared/game/loot/Owned';
import { DRIFTWOOD_FINDS } from '../src/shards/driftwood-isle/generators/finds';
import { DRIFTWOOD_PLACES } from '../src/shards/driftwood-isle/generators/discovery';
import { SHARD_FLAGS } from '../src/shards/driftwood-isle/generators/interactables';
import content from '../src/shards/nalati-grasslands/data/questContent.json' with { type: 'json' };

const finds = nalatiFindsCatalogue();
const islandCatalogue = createFindsCatalogue(DRIFTWOOD_FINDS);
const driftwoodFinds = (flags: { has: (id: string) => boolean }, owned: { has: (id: OwnedId) => boolean }) => islandCatalogue({ flags, owned });

test('Driftwood reads live flags and owned trophies while preserving milestones and chip colors', () => {
  const set = new Set<string>(), have = new Set<OwnedId>();
  const flags = { has: (flag: string) => set.has(flag) }, owned = { has: (id: OwnedId) => have.has(id) };
  for (const [n, next] of [[0, 5], [4, 5], [5, 10], [9, 10], [10, 15], [14, 15], [15, null]] as const) {
    set.clear(); for (let i = 1; i <= n; i++) set.add(`glass:${String(i)}`);
    set.add('glass:16');
    const view = driftwoodFinds(flags, owned);
    expect(view.counters[0]).toEqual({ label: 'Sea glass', n, of: 15 });
    expect(view.next).toBe(next === null ? null : `Next charm at ${String(next)}`);
    expect(view.glass).toHaveLength(15);
    expect(view.glass.filter(chip => chip.found)).toHaveLength(n);
    expect(view.glass.map(chip => chip.color)).toEqual(Array.from({ length: 15 }, (_, i) => DRIFTWOOD_FINDS.glass.colors[i % 5]));
  }
  have.add('bear-claw'); have.add('captain-hat'); set.add('found:reef-treasure');
  for (const place of DRIFTWOOD_PLACES) set.add(`seen:${place.id}`);
  for (const flag of SHARD_FLAGS) set.add(flag);
  const full = driftwoodFinds(flags, owned);
  expect(full.counters.slice(1)).toEqual([{ label: 'Places', n: 9, of: 9 }, { label: 'Glyph shards', n: 3, of: 3 }]);
  expect(full.sections[0]?.items.map(item => item.found)).toEqual([true, false, true]);
  expect(full.sections[1]?.items[0]?.found).toBe(true);
  have.delete('bear-claw'); expect(driftwoodFinds(flags, owned).sections[0]?.items[0]?.found).toBe(false);
});

test('Nalati sticker rows preserve prizes and read the live encounter/place flags',()=>{
  expect(finds).toEqual(originalFinds);
  const catalogue=createFindsCatalogue(parseFindsCatalogue(finds)),set=new Set<string>(),flags={has:(flag:string)=>set.has(flag)};
  const empty=catalogue({flags});expect(empty.counters).toEqual([{label:'Elites',n:0,of:5},{label:'Places',n:0,of:17}]);
  const aqbars=ecology.elites['aqbars'];if(aqbars===undefined)throw new Error('Missing Aqbars row');
  expect(empty.sections[0]?.items[0]).toEqual({label:aqbars.name,icon:'leopard',found:false,prize:['Irbis skin','Crazy Cat Person']});
  set.add('felled:aqbars');expect(catalogue({flags}).sections[0]?.items[0]?.found).toBe(true);
  for(const section of finds.sections)for(const row of section.items)if('flag' in row)set.add(row.flag);
  expect(catalogue({flags}).counters).toEqual([{label:'Elites',n:5,of:5},{label:'Places',n:content.places.length,of:content.places.length}]);
});

test('orchard sticker JSON refuses callbacks and uses independent flag identities',()=>{
  const rows={counters:[{label:'Seeds',flags:['orchard.apple']}],sections:[{title:'Harvest',items:[{label:'Apple',icon:'pin',flag:'orchard.apple',prize:['Seed']}]}]};
  const catalogue=createFindsCatalogue(parseFindsCatalogue(rows)),set=new Set<string>(),flags={has:(flag:string)=>set.has(flag)};
  expect(catalogue({flags}).sections[0]?.items[0]?.found).toBe(false);set.add('orchard.apple');expect(catalogue({flags}).counters[0]?.n).toBe(1);
  expect(()=>parseFindsCatalogue({...rows,render:()=>undefined})).toThrow();
});

test('catalogues refuse unbounded metadata, invalid milestones and missing ownership', () => {
  expect(() => createFindsCatalogue({ ...DRIFTWOOD_FINDS, counters: Array.from({ length: 33 }, () => ({ label: 'No', flags: [] })) })).toThrow('capacity');
  expect(() => createFindsCatalogue({ ...DRIFTWOOD_FINDS, glass: { ...DRIFTWOOD_FINDS.glass, colors: [] } })).toThrow('colors');
  expect(() => createFindsCatalogue({ ...DRIFTWOOD_FINDS, next: { ...DRIFTWOOD_FINDS.next, every: 0 } })).toThrow('milestone');
  expect(() => createFindsCatalogue({ ...DRIFTWOOD_FINDS, counters: [{ label: 'No', flags: { prefix: 'a', count: 257 } }] })).toThrow('range');
  const refusingCatalogue = createFindsCatalogue(DRIFTWOOD_FINDS);
  expect(() => refusingCatalogue({ flags: { has: () => false } })).toThrow('ownership');
});
