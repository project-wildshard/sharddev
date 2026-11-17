import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseClientChannels } from '@wildshard/format/clientChannels';
import { NumericInputError } from '@wildshard/engine/core/faults';
import { admittedClientChannels, planMergedChannels, publishMergedChannels } from '@wildshard/engine/game/plugin/channels';

function timed(name, run) {
  test(name, { timeout: 9500 }, () => {
    const started = performance.now();
    run();
    assert.ok(performance.now() - started < 9500, 'Numeric contract exceeded 9500 ms');
  });
}
const program = (nodes, property = 'x') => ({ id: `p-${property}`, reads: ['r'], nodes, channels: [{ property, value: nodes.length - 1 }] });
function planned(programs) {
  const plan = planMergedChannels(programs, ['r']);
  assert.ok(plan !== null);
  return { plan, lanes: programs.map(row => admittedClientChannels(row)), merged: admittedClientChannels(plan.program) };
}

timed('merged signed-zero constants retain their independent atan2 results', () => {
  const programs = parseClientChannels([
    program([{ op: 'constant', value: 0 }, { op: 'constant', value: -0 }, { op: 'atan2', a: 0, b: 1 }], 'x'),
    program([{ op: 'constant', value: 0 }, { op: 'constant', value: 0 }, { op: 'atan2', a: 0, b: 1 }], 'y'),
  ]);
  const { plan, lanes, merged } = planned(programs);
  merged.evaluate({ time: 0, delta: 0, values: [1] });
  publishMergedChannels(plan, merged, lanes);
  assert.equal(lanes[0].frame.x, Math.PI);
  assert.equal(lanes[1].frame.y, 0);
});

timed('a refused merged expression also refuses its lane and leaves another lane usable', () => {
  const programs = parseClientChannels([
    program([{ op: 'read', index: 0 }, { op: 'sqrt', a: 0 }], 'x'),
    program([{ op: 'read', index: 0 }, { op: 'abs', a: 0 }], 'y'),
  ]);
  const { plan, lanes, merged } = planned(programs);
  merged.evaluate({ time: 0, delta: 0, values: [4] });
  publishMergedChannels(plan, merged, lanes);
  assert.deepEqual([lanes[0].frame.x, lanes[1].frame.y], [2, 4]);
  assert.throws(() => merged.evaluate({ time: 0, delta: 0, values: [-4] }), NumericInputError);
  assert.throws(() => lanes[0].evaluate({ time: 0, delta: 0, values: [-4] }), NumericInputError);
  lanes[1].evaluate({ time: 0, delta: 0, values: [-4] });
  assert.equal(lanes[1].frame.y, 4);
});

timed('private recurrence remains local to its lane', () => {
  const [row] = parseClientChannels([{ id: 'l', reads: ['r'], nodes: [{ op: 'local', index: 0 }, { op: 'read', index: 0 }],
    channels: [{ property: 'x', value: 0 }], locals: [{ initial: { op: 'constant', value: 0 }, next: 1 }] }]);
  assert.ok(row !== undefined);
  assert.equal(planMergedChannels([row], ['r']), null);
  const first = admittedClientChannels(row), second = admittedClientChannels(row);
  first.evaluate({ time: 0, delta: .1, values: [7] });
  second.evaluate({ time: 0, delta: .1, values: [2] });
  first.evaluate({ time: 1, delta: .1, values: [8] });
  second.evaluate({ time: 1, delta: .1, values: [3] });
  assert.deepEqual([first.frame.x, second.frame.x], [7, 2]);
});

timed('detached source slots retain signed zero, both clocks and atomic recurrence', () => {
  const [row] = parseClientChannels([{ id: 'sources', reads: ['r'],
    nodes: [{ op: 'constant', value: -0 }, { op: 'clock', value: 'time' }, { op: 'clock', value: 'delta' },
      { op: 'read', index: 0 }, { op: 'local', index: 0 }, { op: 'add', a: 4, b: 3 }],
    locals: [{ initial: { op: 'read', index: 0 }, next: 5 }],
    channels: [{ property: 'x', value: 0 }, { property: 'y', value: 1 }, { property: 'z', value: 2 },
      { property: 'scaleX', value: 3 }, { property: 'yaw', value: 4 }, { property: 'roll', value: 5 }],
  }]);
  assert.ok(row !== undefined);
  const lane = admittedClientChannels(row);
  for (const [at, key, value] of [[0, 'value', 19], [1, 'value', 'delta'], [3, 'index', 9]]) {
    const node = row.nodes[at]; assert.ok(node !== undefined); Reflect.set(node, key, value);
  }
  lane.evaluate({ time: 1, delta: .25, values: [-0] });
  for (const key of ['x', 'yaw', 'roll']) assert.ok(Object.is(lane.frame[key], -0));
  lane.evaluate({ time: 2, delta: .5, values: [2] });
  assert.deepEqual([lane.frame.y, lane.frame.z, lane.frame.scaleX, lane.frame.roll], [2, .5, 2, 2]);
  const saved = { ...lane.frame };
  assert.throws(() => lane.evaluate({ time: 3, delta: .75, values: [Number.NaN] }), NumericInputError);
  assert.deepEqual(lane.frame, saved);
  lane.evaluate({ time: 4, delta: .25, values: [3] });
  assert.deepEqual([lane.frame.yaw, lane.frame.roll], [2, 5]);
});

timed('borrowed mutable sources preserve live opcode values through refusal recovery', () => {
  const [row] = parseClientChannels([{ id: 'borrowed-sources', reads: ['r'], nodes: [{ op: 'constant', value: 0 }], channels: [{ property: 'x', value: 0 }] }]);
  assert.ok(row?.nodes[0] !== undefined);
  let operation = 'constant', value = -0;
  Object.defineProperties(row.nodes[0], {
    op: { configurable: true, enumerable: true, get: () => operation },
    value: { configurable: true, enumerable: true, get: () => value },
    index: { configurable: true, enumerable: true, value: 0 },
  });
  Object.freeze(row.nodes);
  const lane = admittedClientChannels(row);
  lane.evaluate({ time: 0, delta: .1, values: [7] });
  assert.ok(Object.is(lane.frame.x, -0));
  value = 19; operation = 'read'; lane.evaluate({ time: 0, delta: .1, values: [-0] });
  assert.ok(Object.is(lane.frame.x, -0));
  operation = 'constant'; value = Number.NaN;
  assert.throws(() => lane.evaluate({ time: 0, delta: .1, values: [3] }), NumericInputError);
  assert.ok(Object.is(lane.frame.x, -0));
  value = 5; lane.evaluate({ time: 0, delta: .1, values: [3] });
  assert.equal(lane.frame.x, 5);
});

timed('unused invalid arithmetic refuses before any channel publication', () => {
  const [row] = parseClientChannels([{ id: 'unused-invalid', reads: [], nodes: [{ op: 'constant', value: 7 }, { op: 'constant', value: -1 }, { op: 'sqrt', a: 1 }], channels: [{ property: 'x', value: 0 }] }]);
  assert.ok(row !== undefined);
  const lane = admittedClientChannels(row);
  for (let frame = 0; frame < 2; frame++) {
    assert.throws(() => lane.evaluate({ time: frame, delta: .1, values: [] }), NumericInputError);
    assert.equal(lane.frame.x, 0);
  }
});
