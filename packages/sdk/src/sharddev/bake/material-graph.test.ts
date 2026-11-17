import { expect, test } from 'vitest';
import { validateGraph } from '@wildshard/format/materialGraph';
import { checkAuthorGraph } from './materialGraph';

test('author graph admission preserves full normalized rows and input ownership', () => {
  const input = { version: 1, kind: 'post', params: { gain: { type: 'float', value: 0.5 } },
    nodes: { colour: { op: 'const', value: [0.1, 0.2, 0.3] }, alpha: { op: 'param', param: 'gain' } },
    stages: { post: { colour: 'colour', alpha: 'alpha' } } };
  const before = structuredClone(input);
  expect(checkAuthorGraph(input)).toEqual(validateGraph(input, { trustedBudget: true }));
  expect(input).toEqual(before);
});

test.each([
  null,
  { version: 1, kind: 'post', nodes: {}, stages: {} },
  { version: 1, kind: 'post', nodes: { x: { op: 'add', in: ['missing', 1] } }, stages: { post: { colour: 'x' } } },
  { version: 1, kind: 'post', nodes: { x: { op: 'const', value: Number.NaN } }, stages: { post: { colour: 'x' } } },
])('author graph diagnostics retain the defining refusal %#', input => {
  const original = validateGraph(input, { trustedBudget: true });
  expect(original.ok).toBe(false);
  expect(checkAuthorGraph(input)).toEqual(original);
});
