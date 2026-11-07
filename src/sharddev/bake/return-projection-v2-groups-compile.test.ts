import { expect, test } from 'vitest';
import { Scope } from '@wildshard/engine/app/scope';
import { Rng } from '@wildshard/engine/core/rng';
import { ReturnProgram } from '@wildshard/engine/game/population/returnProgram';
import { parseGroupStepV2 } from '@wildshard/format/scriptGroupStepV2';
import { compileReturnProjectionV2 } from '../returnProjectionV2';
import { groupBankSourceV2 } from '../as/groupBankV2';

// R10b: one compiled programme serves its numeric signals and a group profile (the shared pasture composition)
const groups = parseGroupStepV2({ bank: [{ name: 'count', kind: 'number' }], columns: [], members: 4, signals: ['advance'], actions: [],
  outputs: 1, pages: 1, fuel: 400000 });
const row = { id: 'groupedFixture', abi: '1.0', side: 'sim', module: `blobs/wasm/${'0'.repeat(64)}.wasm`, source: 'behaviour/rules.as', binding: { shard: true },
  pages: 1, onFail: 'hold', on: ['signal'], reads: ['field', 'random'], commands: ['channel'], fields: { value: 'value' }, signals: { run: 'run' },
  channels: { out: 'out' }, stateVersion: 1, state: [], params: {} };
const authored = new Map([
  ['behaviour/rules.as', `import { Read, Do, Field, Channel } from './generated/groupedFixture';
    export function onSignal(signal:i32,value:f64,source:i32):void{Do.channel(Channel.out,Read.field(0,Field.value)*2);}`],
  ['behaviour/project.as', `import { onSignal as rules } from './rules';
    import * as bank from '../sdk/as/groupBankV2.fixture';
    import * as core from '../sdk/as/wsV2';
    export function onSignal(signal:i32,value:f64,source:i32):void{rules(signal,value,source);}
    // the group's signal ordinal through the core (advance = 1)
    export function groupStep():void{bank.write(0,bank.value(0)+core.parameter(0));}`],
]);

test('a projection compiled with group rows serves its signals and its group steps from one programme', async () => {
  const built = await compileReturnProjectionV2(row, { fields: new Map([['value', 1]]), signals: new Map([['run', 1]]), channels: new Map([['out', 1]]) }, authored,
    { asLineCeiling: 20, projectSource: 'behaviour/project.as', groups: { rows: groups, helpers: { 'sdk/as/groupBankV2.fixture.ts': groupBankSourceV2(0, 1) } } });
  expect(built.candidate.groups).toStrictEqual(groups);
  const owner = new Scope('grouped-projection');
  try {
    const programme = ReturnProgram.page({ ...built.legacy, v2: built.candidate }, owner);
    expect(programme.project('run', { value: 3 }, new Rng(1))).toStrictEqual({ out: 6 });
    const prepare = programme.prepareGroup; if (prepare === undefined) throw new Error('Missing group loan');
    const state = Float64Array.of(4);
    prepare({ group: 'g', handle: 1, signal: 'advance', tick: 0, state, members: [], references: [] }).accept();
    expect(Array.from(state)).toStrictEqual([5]);
  } finally { owner.dispose(); }
  await expect(compileReturnProjectionV2(row, { fields: new Map([['value', 1]]), signals: new Map([['run', 1]]), channels: new Map([['out', 1]]) }, authored,
    { asLineCeiling: 20, projectSource: 'behaviour/project.as', groups: { rows: groups, helpers: { 'sdk/as/other.ts': '' } } })).rejects.toThrow('Invalid group helper source');
});
