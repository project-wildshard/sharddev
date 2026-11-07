import { expect, test } from 'vitest';
import { HeldSlotsSchema, parseHeldSlots } from '@wildshard/format/heldArms';
import { namedJsonSchema } from '../src/sharddev/formatJsonSchema';
import arms from '../src/shards/driftwood-isle/data/heldArms.json' with { type: 'json' };
import primary from '../src/shards/nine-dragon-stack/data/heldPrimary.json' with { type: 'json' };
import authored from '../src/shards/nalati-grasslands/data/loadout.json' with { type: 'json' };
import rewards from '../src/shards/nalati-grasslands/data/legendaryWeapons.json' with { type: 'json' };

const loadout = { ...authored, variants: {
  bow: { id: `weapon.${rewards.goldenBow.id}`, name: rewards.goldenBow.name },
  blade: { id: `weapon.${rewards.naizagai.id}`, name: rewards.naizagai.name },
} };

function mounted() {
  const firearm = loadout.page.firearm;
  return { version: 1, id: 'kit', bindAt: 'equipment', pause: true, slots: [
    { id: 'blade', kind: 'blade', item: loadout.blade.item, source: { kind: 'passes', file: loadout.blade.file } },
    { id: 'polearm', kind: 'polearm', ...loadout.polearm },
    { id: 'bow', kind: 'bow', ...loadout.bow },
    { id: 'firearm', kind: 'firearm', ...firearm },
  ], registration: ['bow', 'blade', 'polearm', 'firearm'],
  equipment: { primary: 'blade', rifle: 'firearm', extras: ['bow', 'polearm'], order: ['blade', 'bow', 'polearm', 'firearm'] },
  selection: { initial: loadout.initial, unlock: ['bow', 'polearm'] }, mount: ['blade', 'polearm', 'bow'],
  refills: [{ slot: 'polearm', kind: 'fill-capacity' }, { slot: 'bow', kind: 'add-magazine' }],
  upgrades: [
    { id: 'bow-reward', slot: 'bow', kind: 'bow', replacement: { item: loadout.variants.bow.id, name: loadout.variants.bow.name } },
    { id: 'blade-reward', slot: 'blade', kind: 'blade-pass', replacement: { item: loadout.variants.blade.id, name: loadout.variants.blade.name } },
  ] };
}

test('the real mounted declaration keeps construction, metadata registration and initial selection separate', () => {
  const rows = parseHeldSlots(mounted());
  expect(rows.slots.map(row => row.item)).toEqual([loadout.blade.item, loadout.polearm.item, loadout.bow.item, loadout.page.firearm.item]);
  expect(rows.registration).toEqual(['bow', 'blade', 'polearm', 'firearm']);
  expect(rows.bindAt).toBe('equipment');expect(rows.pause).toBe(true);
  expect(rows.equipment.primary).toBe('blade'); expect(rows.selection.initial).toBe('bow');
  expect(rows.upgrades.map(row => row.replacement)).toEqual([loadout.variants.bow, loadout.variants.blade].map(row => ({ item: row.id, name: row.name })));
});

test('the actual two-sword and sword-with-tool declarations fit the same finite slot grammar', () => {
  const swords = arms.weapons.map((row, index) => ({ id: `blade-${index}`, kind: 'blade', item: row.item,
    source: { kind: 'starter', blade: row.blade, viewmodel: row.blade } }));
  const first = swords[0]; if (first === undefined) throw new Error('Missing original starter');
  const shared = { version: 1, id: 'kit', bindAt: 'equipment', pause: true, selection: { unlock: [] }, mount: [], refills: [], upgrades: [] };
  const driftwood = parseHeldSlots({ ...shared, slots: swords, registration: swords.map(row => row.id), equipment: { primary: first.id, extras: swords.slice(1).map(row => row.id) } });
  expect(driftwood.slots.map(row => row.item)).toEqual(arms.weapons.map(row => row.item));
  const tool = primary.tools[0]; if (tool === undefined) throw new Error('Missing original tool');
  const nine = parseHeldSlots({ ...shared, bindAt: 'entered', pause: false, slots: [
    { id: 'primary', kind: 'blade', item: primary.primary.item, source: { kind: 'starter', blade: primary.primary.blade, viewmodel: 'declared', framing: primary.primary.file } },
    { id: 'tool', kind: 'tool', item: tool, tool: 'grapple', source: 'sim/headless-constants.json', presentation: primary.primary.file },
  ], registration: ['primary', 'tool'], equipment: { primary: 'primary', extras: [] } });
  expect(nine.bindAt).toBe('entered');expect(nine.pause).toBe(false);
  expect(nine.slots.map(row => row.item)).toEqual([primary.primary.item, ...primary.tools]);
  expect(nine.slots[1]).toMatchObject({ kind: 'tool', tool: 'grapple', presentation: primary.primary.file });
});

test('local reference admission refuses ambiguous owners, wrong native operations and unresolved suffixes', () => {
  const rows = mounted(), first = rows.slots[0]; if (first === undefined) throw new Error('Missing blade fixture');
  const invalid = [
    { ...rows, slots: [...rows.slots, first] },
    { ...rows, registration: ['blade', 'blade', 'bow', 'firearm'] },
    { ...rows, registration: ['blade', 'polearm', 'bow', 'missing'] },
    { ...rows, equipment: { ...rows.equipment, rifle: 'bow' } },
    { ...rows, equipment: { ...rows.equipment, extras: ['blade', 'polearm'] } },
    { ...rows, selection: { ...rows.selection, initial: 'missing' } },
    { ...rows, mount: ['firearm'] }, { ...rows, mount: ['bow', 'bow'] },
    { ...rows, refills: [{ slot: 'polearm', kind: 'add-magazine' }] },
    { ...rows, refills: [{ slot: 'bow', kind: 'fill-capacity' }] },
    { ...rows, upgrades: [{ id: 'reward', slot: 'blade', kind: 'bow', replacement: { item: 'weapon.reward', name: 'Reward' } }] },
    { ...rows, upgrades: [{ id: 'reward', slot: 'bow', kind: 'bow', replacement: { item: first.item, name: 'Reward' } }] },
  ];
  for (const input of invalid) expect(() => parseHeldSlots(input)).toThrow();
});

test('the defining structure emits closed JSON Schema and accepts no executable selectors', () => {
  const rows = mounted(), schema = namedJsonSchema(HeldSlotsSchema);
  expect(schema).toMatchObject({ type: 'object', additionalProperties: false });
  expect(() => parseHeldSlots({ ...rows, create: () => null })).toThrow();
  expect(() => parseHeldSlots({ ...rows, selection: { initial: () => 'bow', unlock: [] } })).toThrow();
  expect(() => parseHeldSlots({ ...rows, slots: [{ id: 'bow', kind: 'bow', item: loadout.bow.item, file: () => null }] })).toThrow();
});


test('binding phase and construction yielding are finite admitted data', () => {
  const rows = mounted();
  const { bindAt: _binding, pause: _pause, ...original } = rows;
  expect(parseHeldSlots(original)).toMatchObject({bindAt:'equipment',pause:false});
  for (const input of [{...rows,bindAt:'kit'}, {...rows,bindAt:()=> 'entered'},
    {...rows,pause:1}, {...rows,pause:()=>true}]) expect(()=>parseHeldSlots(input)).toThrow();
});


test('only explicit polearm geometry can wait until selection; legacy rows stay byte-identical', () => {
  const original=mounted(), eager=parseHeldSlots(original);
  expect(eager.slots.find(row=>row.kind==='polearm')).not.toHaveProperty('geometry');
  const late={...original,slots:original.slots.map(row=>row.kind==='polearm'?{...row,geometry:'on-select'}:row)};
  expect(parseHeldSlots(late).slots.find(row=>row.kind==='polearm')).toMatchObject({geometry:'on-select'});
  for(const geometry of ['lazy','',false,()=>null])expect(()=>parseHeldSlots({...original,slots:original.slots.map(row=>row.kind==='polearm'?{...row,geometry}:row)})).toThrow();
  for(const kind of ['blade','bow','firearm'])expect(()=>parseHeldSlots({...original,slots:original.slots.map(row=>row.kind===kind?{...row,geometry:'on-select'}:row)})).toThrow();
  expect(parseHeldSlots(original)).toEqual(eager);
});
