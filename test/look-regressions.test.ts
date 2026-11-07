import { expect, it } from 'vitest';
import { validateGraph, type GraphIr, type GraphRef } from '@wildshard/format/materialGraph';
import sky from '../src/shards/far-reach/data/lookGraphs.json';
import nalati from '../src/shards/nalati-grasslands/data/lookGraphs.json';

function graph(input: unknown): GraphIr {
  const checked = validateGraph(input, {trustedBudget: true});
  if (!checked.ok) throw new Error(checked.errors.join('; '));
  return checked.graph;
}

/** Evaluate the admitted scalar timing nodes, so this tests the shipped rows. */
function scalar(row: GraphIr, ref: GraphRef, time: number): number {
  if (typeof ref === 'number') return ref;
  if (typeof ref !== 'string') throw new Error('Expected a scalar timing input');
  const node = row.nodes[ref];
  if (node === undefined) throw new Error(`Missing timing node ${ref}`);
  if (node.op === 'time') return time;
  const input = (index: number): number => {
    const value = node.in?.[index];
    if (value === undefined) throw new Error(`Missing timing operand ${ref}`);
    return scalar(row, value, time);
  };
  switch (node.op) {
    case 'mul': return input(0) * input(1);
    case 'div': return input(0) / input(1);
    case 'mod': return input(0) % input(1);
    case 'sub': return input(0) - input(1);
    case 'floor': return Math.floor(input(0));
    case 'fract': { const value = input(0); return value - Math.floor(value); }
    case 'sin': return Math.sin(input(0));
    default: throw new Error(`Unexpected timing operation ${node.op}`);
  }
}

it('keeps storm strikes random within 3.5–8 seconds and the ring and bolt in sync', () => {
  const ring = graph(sky['storm-ring'].graph), bolt = graph(sky['storm-bolt'].graph);
  const period = ring.nodes['fN']?.in?.[1];
  expect(period).toBe(5.75);
  if (typeof period !== 'number') throw new Error('Missing storm window');
  const gaps: number[] = [];
  let previous = 0;
  for (let window = 0; window < 8192; window++) {
    const time = (window + 0.5) * period;
    const offset = scalar(ring, 'fO', time), start = window * period + offset;
    expect(scalar(bolt, 'fS', time)).toBe(scalar(ring, 'fS', time));
    if (window > 0) gaps.push(start - previous);
    previous = start;
  }
  expect(Math.min(...gaps)).toBeGreaterThanOrEqual(3.5);
  expect(Math.max(...gaps)).toBeLessThanOrEqual(8);
  expect(Math.min(...gaps)).toBeLessThan(3.7);
  expect(Math.max(...gaps)).toBeGreaterThan(7.8);
  expect(new Set(gaps.map(gap => gap.toFixed(3))).size).toBeGreaterThan(1000);
});

it('fogs Nalati graph materials with the page panorama fog', () => {
  expect(graph(nalati['nalati-camp-smoke']).effectState?.fog).toBeUndefined();
  expect(Object.keys(nalati)).not.toContain('nalati-fog');
});
