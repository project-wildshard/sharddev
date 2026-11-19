// meta ONE-FORMAT OF17c: the report card prints the primitives the server will derive from the shard's sections.
import { expect, test } from 'vitest';
import { primitiveReportLine } from './primitivesReport';

const weather = { rows: { weather: [{ id: 'forest' }] } };

test('the line names the always-on families and each family a section switches on, in table order', () => {
  expect(primitiveReportLine(new Map(), [])).toBe('collision, plumbing');
  expect(primitiveReportLine(new Map([['world/weather', weather], ['world/days', { rows: { days: [] } }]]), [])).toBe('collision, plumbing, weather');
});

test('a family switched by a section at a later version names it', () => {
  const index = [{ name: 'world/weather', schema: 'wildshard:world/weather@2' }];
  expect(primitiveReportLine(new Map([['world/weather', weather]]), index)).toBe('collision, plumbing, weather@2');
});
