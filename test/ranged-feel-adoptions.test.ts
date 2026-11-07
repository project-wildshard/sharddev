import { expect, test, vi } from 'vitest';
import { Scope } from '../src/shared/engine/app/scope';
import { Events } from '../src/shared/engine/events/events';
import * as feel from '../src/client/engine/combat/view/rangedFeel';
import { ItemCatalogue } from '../src/shared/game/loadout/itemCatalogue';
import { installHeldRangedFeel } from '../src/client/game/plugin/heldEquipment';
import type { ShardContext } from '../src/client/game/plugin/context';
import { parseClientPlan } from '@wildshard/format/clientPlan';
import { outputPlatformPayloads } from '../src/sharddev/outputProduct';
import { emptyShardfile } from '../src/sharddev/author';
import { createShardProduct } from '../src/shared/game/shardfile/shardProduct';
import { admitClientPlan } from '../src/client/game/shardfile/clientPlan';
import { PINE_ITEMS } from '../src/shards/pine-hollow/generators/items';
import pinePlan from '../src/shards/pine-hollow/data/clientPlan.json';
import nalatiItems from '../src/shards/nalati-grasslands/data/items.json';
import { output as nalatiOutput } from './fixtures/nalati-output-original';

test('Pine and Nalati declare the real ranged-feel host with nonzero live equipment rows', () => {
  const nalatiPlan = outputPlatformPayloads(nalatiOutput.platform, ['client/plan']).get('client/plan');
  for (const plan of [pinePlan, nalatiPlan]) expect(parseClientPlan(plan).features.filter(row => row.kind === 'held.ranged-feel')).toHaveLength(1);
  for (const [items, ids] of [[PINE_ITEMS, ['weapon.crossbow', 'weapon.lever', 'weapon.longbow']], [nalatiItems, ['weapon.bow', 'weapon.rifle']]] as const) {
    for (const id of ids) {
      const row = new ItemCatalogue(items).equipment(id);
      expect(row.rangedFeel?.kick.body).toBeGreaterThan(0);
      expect(row.rangedFeel?.kick.kill).toBeGreaterThan(0);
    }
  }
  expect(() => parseClientPlan({ version: 1, features: [{ kind: 'held.ranged-feel', install: () => undefined }] })).toThrow();
});

test('entered ranged feel resolves the current weapon row after a replacement', () => {
  let read: Parameters<ReturnType<typeof feel.prepareRangedFeel>>[2] | undefined;
  const prepare = vi.spyOn(feel, 'prepareRangedFeel').mockImplementation(() => (_events, _scope, reader) => { read = reader; });
  const scope = new Scope('ranged-feel-adoption'), base: Pick<ShardContext, 'scope'> = { scope }, context = base as ShardContext;
  const weapons = { events: new Events(), list: [{ row: new ItemCatalogue(nalatiItems).equipment('weapon.bow') }] };
  Object.defineProperty(context, 'game', { value: { runtime: { world: { game: {} }, play: { weapons } } } });
  try {
    installHeldRangedFeel(context);
    if (read === undefined) throw new Error('Missing live equipment reader');
    expect(read('weapon.bow')).toBe(weapons.list[0]?.row);
    weapons.list.splice(0, 1, { row: new ItemCatalogue(nalatiItems).equipment('weapon.rifle') });
    expect(read('weapon.bow')).toBeUndefined();
    expect(read('weapon.rifle')).toBe(weapons.list[0]?.row);
  } finally { scope.dispose(); prepare.mockRestore(); }
});

test('ranged-feel admission requires a real equipment feedback row', () => {
  const source=emptyShardfile({slug:'fixture-feedback',name:'Feedback',author:'Test',revision:1,seed:1});
  const product=createShardProduct({slug:source.identity.slug,revision:1,shardfile:source,sections:new Map(),files:new Map(),read:()=>Promise.reject(new Error('No fixture blobs'))});
  expect(()=>admitClientPlan({version:1,features:[{kind:'held.ranged-feel'}]},product)).toThrow('requires admitted equipment feedback rows');
});
