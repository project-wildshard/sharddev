import { expect, test } from 'vitest';
import { parseClientChannels, type ClientChannelProgram } from '@wildshard/format/clientChannels';
import { admittedClientChannels, planMergedChannels, publishMergedChannels } from '../src/shared/game/plugin/channels';
import { NumericInputError } from '../src/shared/engine/core/faults';
import { CRAB_CLIPS } from '../src/shards/driftwood-isle/generators/crabClips';
import { THRALL_CLIPS } from '../src/shards/pine-hollow/generators/thrallClips';

// DW story margin: a rig's pose programs evaluated as one merged lane publish exactly the values each lane computes on its
// own, frame after frame; signed zeros never merge; a refused merged frame refuses in the lanes too.
const table = (programs: readonly { readonly numeric: object }[]): ClientChannelProgram[] =>
  parseClientChannels(programs.map(program => ({ ...program, numeric: { ...program.numeric, inputs: [] } })));
const names = (programs: readonly ClientChannelProgram[]): string[] => [...new Set(programs.flatMap(program => program.reads))];

test.each([['crab', CRAB_CLIPS.programs], ['thrall', THRALL_CLIPS.programs]] as const)('%s pose programs: merged frames equal the lanes', (_name, rows) => {
  const programs = table(rows), reads = names(programs), plan = planMergedChannels(programs, reads);
  if (plan === null) throw new Error('unmerged');
  expect(plan.program.nodes.length).toBeLessThan(programs.reduce((sum, program) => sum + program.nodes.length, 0));
  const own = programs.map(program => admittedClientChannels(program)), lanes = programs.map(program => admittedClientChannels(program));
  const merged = admittedClientChannels(plan.program);
  let seed = 5; const rnd = (): number => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  let time = 0, values = reads.map(() => 0);
  for (let frame = 0; frame < 300; frame++) {
    const delta = 1 / 30; time += delta;
    // a third of the frames repeat their reads (the lanes' own repeat shortcut), the rest move every read
    if (frame % 3 !== 0) values = reads.map(() => rnd() * 4 - 2);
    for (const [i, lane] of own.entries()) { const program = programs[i]; if (program === undefined) throw new Error('program');
      lane.evaluate({ time, delta, values: program.reads.map(id => values[reads.indexOf(id)] ?? Number.NaN) }); }
    merged.evaluate({ time, delta, values }); publishMergedChannels(plan, merged, lanes);
    for (const [i, program] of programs.entries()) for (const channel of program.channels)
      expect(Object.is(lanes[i]?.frame[channel.property], own[i]?.frame[channel.property])).toBe(true);
  }
});

const program = (nodes: unknown[], property = 'x'): unknown => ({ id: `p-${property}`, reads: ['r'], nodes, channels: [{ property, value: nodes.length - 1 }] });
test('signed zeros stay distinct: atan2(0, -0) and atan2(0, 0) keep their own nodes', () => {
  const programs = parseClientChannels([
    program([{ op: 'constant', value: 0 }, { op: 'constant', value: -0 }, { op: 'atan2', a: 0, b: 1 }], 'x'),
    program([{ op: 'constant', value: 0 }, { op: 'constant', value: 0 }, { op: 'atan2', a: 0, b: 1 }], 'y'),
  ]);
  const plan = planMergedChannels(programs, ['r']); if (plan === null) throw new Error('unmerged');
  const lanes = programs.map(row => admittedClientChannels(row)), merged = admittedClientChannels(plan.program);
  merged.evaluate({ time: 0, delta: 0, values: [1] }); publishMergedChannels(plan, merged, lanes);
  expect(lanes[0]?.frame.x).toBe(Math.PI); expect(lanes[1]?.frame.y).toBe(0);
});

test('a refused merged frame is refused by the lane that owns the expression, which then evaluates itself', () => {
  const programs = parseClientChannels([program([{ op: 'read', index: 0 }, { op: 'sqrt', a: 0 }], 'x'), program([{ op: 'read', index: 0 }, { op: 'abs', a: 0 }], 'y')]);
  const plan = planMergedChannels(programs, ['r']); if (plan === null) throw new Error('unmerged');
  const lanes = programs.map(row => admittedClientChannels(row)), merged = admittedClientChannels(plan.program);
  merged.evaluate({ time: 0, delta: 0, values: [4] }); publishMergedChannels(plan, merged, lanes);
  expect([lanes[0]?.frame.x, lanes[1]?.frame.y]).toEqual([2, 4]);
  expect(() => { merged.evaluate({ time: 0, delta: 0, values: [-4] }); }).toThrow(NumericInputError);
  expect(() => { lanes[0]?.evaluate({ time: 0, delta: 0, values: [-4] }); }).toThrow(NumericInputError);
  lanes[1]?.evaluate({ time: 0, delta: 0, values: [-4] }); expect(lanes[1]?.frame.y).toBe(4);
});

test('programs with private locals are not merged', () => {
  const [row] = parseClientChannels([{ id: 'l', reads: ['r'], nodes: [{ op: 'local', index: 0 }, { op: 'read', index: 0 }], channels: [{ property: 'x', value: 0 }], locals: [{ initial: { op: 'constant', value: 0 }, next: 1 }] }]);
  if (row === undefined) throw new Error('row');
  expect(planMergedChannels([row], ['r'])).toBeNull();
});

test('detached source slots retain signed zero, both clocks and atomic private recurrence', () => {
  const row = parseClientChannels([{ id: 'sources', reads: ['r'],
    nodes: [{ op: 'constant', value: -0 }, { op: 'clock', value: 'time' }, { op: 'clock', value: 'delta' },
      { op: 'read', index: 0 }, { op: 'local', index: 0 }, { op: 'add', a: 4, b: 3 }],
    locals: [{ initial: { op: 'read', index: 0 }, next: 5 }],
    channels: [{ property: 'x', value: 0 }, { property: 'y', value: 1 }, { property: 'z', value: 2 },
      { property: 'scaleX', value: 3 }, { property: 'yaw', value: 4 }, { property: 'roll', value: 5 }],
  }])[0];
  if (row === undefined) throw new Error('Missing source fixture');
  const lane = admittedClientChannels(row);
  for (const [at, key, value] of [[0, 'value', 19], [1, 'value', 'delta'], [3, 'index', 9]] as const) {
    const node = row.nodes[at]; if (node === undefined) throw new Error('Missing source node');
    Reflect.set(node, key, value);
  }
  lane.evaluate({ time: 1, delta: .25, values: [-0] });
  expect(Object.is(lane.frame.x, -0)).toBe(true);
  expect(Object.is(lane.frame.yaw, -0)).toBe(true);
  expect(Object.is(lane.frame.roll, -0)).toBe(true);
  lane.evaluate({ time: 2, delta: .5, values: [2] });
  expect([lane.frame.y, lane.frame.z, lane.frame.scaleX, lane.frame.roll]).toEqual([2, .5, 2, 2]);
  const saved = { ...lane.frame };
  expect(() => { lane.evaluate({ time: 3, delta: .75, values: [Number.NaN] }); }).toThrow(NumericInputError);
  expect(lane.frame).toEqual(saved);
  lane.evaluate({ time: 4, delta: .25, values: [3] });
  expect([lane.frame.yaw, lane.frame.roll]).toEqual([2, 5]);
});

test('borrowed mutable source rows retain live opcode and getter order through refusal recovery', () => {
  const row = parseClientChannels([{ id: 'borrowed-sources', reads: ['r'],
    nodes: [{ op: 'constant', value: 0 }], channels: [{ property: 'x', value: 0 }],
  }])[0];
  const node = row?.nodes[0]; if (row === undefined || node === undefined) throw new Error('Missing borrowed fixture');
  let operation: 'constant' | 'read' = 'constant', value = -0;
  const calls: string[] = [];
  Object.defineProperties(node, {
    op: { configurable: true, enumerable: true, get: () => { calls.push('op'); return operation; } },
    value: { configurable: true, enumerable: true, get: () => { calls.push('value'); return value; } },
    index: { configurable: true, enumerable: true, value: 0 },
  });
  Object.freeze(row.nodes);
  const lane = admittedClientChannels(row);
  calls.length = 0; lane.evaluate({ time: 0, delta: .1, values: [7] });
  expect(calls).toEqual(['op', 'value']); expect(Object.is(lane.frame.x, -0)).toBe(true);
  operation = 'read'; calls.length = 0; lane.evaluate({ time: 0, delta: .1, values: [-0] });
  expect(calls).toEqual(['op']); expect(Object.is(lane.frame.x, -0)).toBe(true);
  operation = 'constant'; value = Number.NaN; calls.length = 0;
  expect(() => { lane.evaluate({ time: 0, delta: .1, values: [3] }); }).toThrow(NumericInputError);
  expect(calls).toEqual(['op', 'value']); expect(Object.is(lane.frame.x, -0)).toBe(true);
  value = 5; lane.evaluate({ time: 0, delta: .1, values: [3] }); expect(lane.frame.x).toBe(5);
});

test('private source specialization still refuses unused invalid arithmetic before first publication', () => {
  const row = parseClientChannels([{ id: 'unused-invalid', reads: [],
    nodes: [{ op: 'constant', value: 7 }, { op: 'constant', value: -1 }, { op: 'sqrt', a: 1 }],
    channels: [{ property: 'x', value: 0 }],
  }])[0];
  if (row === undefined) throw new Error('Missing invalid arithmetic fixture');
  const lane = admittedClientChannels(row);
  for (let frame = 0; frame < 2; frame++) {
    expect(() => { lane.evaluate({ time: frame, delta: .1, values: [] }); }).toThrow(NumericInputError);
    expect(lane.frame.x).toBe(0);
  }
});
