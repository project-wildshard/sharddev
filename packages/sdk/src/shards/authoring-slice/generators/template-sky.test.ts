// oxlint-disable-next-line import/no-nodejs-modules -- Read the generator's own source to count its lines.
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import type { GraphIr, GraphRef } from '@wildshard/format/materialGraph';
import { templateSky } from './template-sky';

// SHARD-SOURCE AP13: the Template's 77-node sky post graph, rewritten as TSL of 40 lines or fewer, compiles to the same
// graph: every output pixel is the same expression of the same inputs (node ids aside), so the frame is equal.
// the retired Template's look's sky post graph (its data/look.json post[0], kept here when J434 retired the Template) is
// what the TSL here must equal
const GOLDEN = new URL('template-sky.golden.json', import.meta.url);
function expression(ir: GraphIr, ref: GraphRef): string {
  if (typeof ref !== 'string') return JSON.stringify(ref);
  const node = ir.nodes[ref];
  if (node === undefined) throw new Error(`no node ${ref}`);
  const { op, in: inputs = [], ...rest } = node as { op: string; in?: GraphRef[] };
  return `${op}${Object.keys(rest).length === 0 ? '' : JSON.stringify(rest)}(${inputs.map((input) => expression(ir, input)).join(',')})`;
}

test('the Template sky in TSL compiles to its 77-node graph', () => {
  const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as GraphIr, ours = templateSky();
  const out = (ir: GraphIr): GraphRef => ir.stages.post?.colour ?? '';
  expect(expression(ours, out(ours))).toBe(expression(golden, out(golden)));
  expect(Object.keys(ours.nodes).length).toBeLessThanOrEqual(Object.keys(golden.nodes).length);
  const source = readFileSync(new URL('template-sky.ts', import.meta.url), 'utf8').split('\n');
  const body = source.slice(source.findIndex((line) => line.startsWith('export function templateSky')));
  expect(body.filter((line) => line.trim() !== '').length).toBeLessThanOrEqual(40);
});
