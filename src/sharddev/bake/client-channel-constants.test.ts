import { expect, test, vi } from 'vitest';
import { ClientChannels } from '../clientChannels';
import { admittedClientChannels, createClientChannels } from '@wildshard/engine/game/plugin/channels';

const observation = { time: 1, delta: 1 / 60, values: [1] };

test('constant subexpressions run once per lane while copied reads and private recurrence remain fresh', () => {
  const dag = new ClientChannels('constants.recurrence'), constant = dag.unary('sin', dag.constant(.5));
  const previous = dag.local(0), input = dag.read('input'), next = dag.binary('add', previous, dag.binary('add', constant, input));
  dag.retain(previous, next); dag.output('value', next); dag.output('x', dag.constant(-0));
  const row = dag.build(); row.nodes.forEach(node => { Object.freeze(node); }); Object.freeze(row.nodes);
  const first = admittedClientChannels(row), second = admittedClientChannels(row), sine = Math.sin(.5);
  const sin = vi.spyOn(Math, 'sin');
  try {
    let expected = 0;
    for (const value of [1, 2, -0, -1]) {
      first.evaluate({ ...observation, values: [value] }); expected += sine + value;
      expect(first.frame.value).toBe(expected); expect(Object.is(first.frame.x, -0)).toBe(true);
    }
    expect(sin).toHaveBeenCalledTimes(1);
    second.evaluate(observation); expect(second.frame.value).toBe(sine + 1);
    expect(sin).toHaveBeenCalledTimes(2);
  } finally { sin.mockRestore(); }
});

test('unused invalid constants refuse at evaluation and failed frames publish neither values nor recurrence', () => {
  const invalid = new ClientChannels('constants.invalid');
  invalid.binary('div', invalid.constant(1), invalid.constant(0)); invalid.output('value', invalid.constant(2));
  const bad = createClientChannels(invalid.build());
  for (let frame = 0; frame < 2; frame++) {
    expect(() => bad.evaluate({ ...observation, values: [] })).toThrow('Non-finite');
    expect(bad.frame.value).toBe(0);
  }
  const dag = new ClientChannels('constants.refusal'), previous = dag.local(0);
  const next = dag.binary('add', previous, dag.constant(2)); dag.retain(previous, next); dag.output('value', next);
  dag.binary('div', dag.constant(1), dag.read('input'));
  const lane = createClientChannels(dag.build());
  expect(() => lane.evaluate({ ...observation, values: [0] })).toThrow('Non-finite');
  expect(lane.frame.value).toBe(0);
  lane.evaluate(observation); expect(lane.frame.value).toBe(2);
  expect(() => lane.evaluate({ ...observation, values: [0] })).toThrow('Non-finite');
  expect(lane.frame.value).toBe(2);
  lane.evaluate(observation); expect(lane.frame.value).toBe(4);
});

test('shallow-frozen admitted rows and frozen accessors retain their original live reads', () => {
  const dag = new ClientChannels('constants.mutable'); dag.output('value', dag.constant(2));
  const row = dag.build(), node = row.nodes[0]; if (node?.op !== 'constant') throw new Error('Missing constant fixture');
  Object.freeze(row.nodes);
  const lane = admittedClientChannels(row);
  lane.evaluate({ ...observation, values: [] }); expect(lane.frame.value).toBe(2);
  node.value = 7;
  lane.evaluate({ ...observation, values: [] }); expect(lane.frame.value).toBe(7);
  let value = 3, reads = 0;
  const accessorRow = dag.build(), accessorNode = accessorRow.nodes[0];
  if (accessorNode?.op !== 'constant') throw new Error('Missing accessor fixture');
  Object.defineProperty(accessorNode, 'value', { enumerable: true, get: () => { reads++; return value; } });
  Object.freeze(accessorNode); Object.freeze(accessorRow.nodes);
  const accessor = admittedClientChannels(accessorRow);
  accessor.evaluate({ ...observation, values: [] }); expect(accessor.frame.value).toBe(3);
  value = 4; accessor.evaluate({ ...observation, values: [] }); expect(accessor.frame.value).toBe(4);
  expect(reads).toBe(2);
});

test('a frozen sample row cannot retain a result while its key pairs remain mutable', () => {
  const row = { id: 'constants.keys', reads: [], nodes: [
    { op: 'constant' as const, value: .5 },
    { op: 'sample' as const, a: 0, interpolation: 'linear' as const, keys: [[0, 0] as [number, number], [1, 2] as [number, number]] },
  ], channels: [{ property: 'value' as const, value: 1 }] };
  const sample = row.nodes[1]; if (sample?.op !== 'sample') throw new Error('Missing sample fixture');
  Object.freeze(row.nodes); row.nodes.forEach(node => { Object.freeze(node); }); Object.freeze(sample.keys);
  const lane = admittedClientChannels(row);
  lane.evaluate({ ...observation, values: [] }); expect(lane.frame.value).toBe(1);
  const key = sample.keys[1]; if (key === undefined) throw new Error('Missing sample key'); key[1] = 8;
  lane.evaluate({ ...observation, values: [] }); expect(lane.frame.value).toBe(4);
});

test('a frozen opcode accessor keeps one live read when it changes from its installed opcode', () => {
  const dag=new ClientChannels('constants.live-opcode');dag.output('value',dag.read('input'));
  const row=dag.build(),node=row.nodes[0];if(node===undefined)throw new Error('Missing read node');
  let live=false,reads=0;
  Object.defineProperty(node,'value',{value:7,enumerable:true});
  Object.defineProperty(node,'op',{enumerable:true,get:()=>{if(!live)return 'read';reads++;return reads===1?'constant':'read';}});
  Object.freeze(node);Object.freeze(row.nodes);
  const lane=admittedClientChannels(row);live=true;lane.evaluate(observation);
  expect(lane.frame.value).toBe(7);expect(reads).toBe(1);
});

test('a clockless stateless lane keeps its values for repeated reads, and a refused call refuses again', () => {
  const lane = (name: string, build: (dag: ClientChannels, input: number) => number) => {
    const dag = new ClientChannels(name); dag.output('value', build(dag, dag.read('input')));
    const row = dag.build(); row.nodes.forEach(node => { Object.freeze(node); }); Object.freeze(row.nodes);
    return admittedClientChannels(row);
  };
  const at = (value: number): { time: number; delta: number; values: number[] } => ({ ...observation, values: [value] });
  const quarter = lane('constants.repeat', (dag, input) => dag.binary('div', input, dag.constant(4)));
  quarter.evaluate(at(2)); expect(quarter.frame.value).toBe(0.5);
  quarter.evaluate(at(2)); expect(quarter.frame.value).toBe(0.5);
  quarter.evaluate(at(0)); expect(Object.is(quarter.frame.value, 0)).toBe(true);
  quarter.evaluate(at(-0)); expect(Object.is(quarter.frame.value, -0)).toBe(true);
  const inverse = lane('constants.refuse', (dag, input) => dag.binary('div', dag.constant(1), input));
  inverse.evaluate(at(4)); expect(inverse.frame.value).toBe(0.25);
  expect(() => { inverse.evaluate(at(0)); }).toThrow();
  expect(() => { inverse.evaluate(at(0)); }).toThrow();
  expect(inverse.frame.value).toBe(0.25);
  inverse.evaluate(at(4)); expect(inverse.frame.value).toBe(0.25);
});
