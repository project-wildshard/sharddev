import { expect, test } from 'vitest';
import { lateSceneMaterialFiles } from './worldScenes';

const a = 'a'.repeat(64), b = 'b'.repeat(64), c = 'c'.repeat(64);
const file = (hash: string, variantOf?: string, critical = false) => ({ hash, critical, ...(variantOf === undefined ? {} : { variantOf }) });

test('schedules every explicit detail variant while retaining file order and inputs', () => {
  const files = [file(a, 'detail'), file(b, 'coarse'), file(c, 'detail')], before = structuredClone(files);
  expect(lateSceneMaterialFiles(files, [{ variantOf: 'detail', at: [30, -40] }])).toEqual([{ hash: a, at: [30, -40] }, { hash: c, at: [30, -40] }]);
  expect(files).toEqual(before);
});

test('critical and ordinary aliases keep their exact backing early', () => {
  const files = [file(a, 'detail'), file(a, 'coarse'), file(b, 'detail'), file(b, 'detail', true), file(c, 'detail'), file(c)];
  expect(lateSceneMaterialFiles(files, [{ variantOf: 'detail', at: [0, 0] }])).toEqual([]);
});

test('deduplicates equal late aliases but refuses conflicting ordering positions', () => {
  expect(lateSceneMaterialFiles([file(a, 'detail'), file(a, 'detail')], [{ variantOf: 'detail', at: [1, 2] }])).toEqual([{ hash: a, at: [1, 2] }]);
  expect(() => lateSceneMaterialFiles([file(a, 'detail'), file(a, 'other')], [{ variantOf: 'detail', at: [1, 2] }, { variantOf: 'other', at: [2, 3] }])).toThrow('one position');
});

test('refuses missing or duplicate variant declarations', () => {
  expect(() => lateSceneMaterialFiles([file(a, 'detail')], [{ variantOf: 'missing', at: [0, 0] }])).toThrow('declared groups');
  expect(() => lateSceneMaterialFiles([file(a, 'detail')], [{ variantOf: 'detail', at: [0, 0] }, { variantOf: 'detail', at: [0, 0] }])).toThrow('unique');
});

test('retains the original late-file hash and cell-position grammar', () => {
  expect(() => lateSceneMaterialFiles([file('wrong', 'detail')], [{ variantOf: 'detail', at: [0, 0] }])).toThrow();
  expect(() => lateSceneMaterialFiles([file(a, 'detail')], [{ variantOf: 'detail', at: [251, 0] }])).toThrow();
  expect(() => lateSceneMaterialFiles([file(a, 'detail')], [{ variantOf: 'detail', at: [Number.NaN, 0] }])).toThrow();
});
