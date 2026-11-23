// SHARD-COMPAT SA7b: engine's public-index report on an SDK export is dropped even when the import carries a bundler
// query (`@wildshard/sdk/commons/scripts/course.as?raw`), and still kept for a path the SDK does not export.
import { expect, test } from 'vitest';
import { sdkExportReport } from '../lint/engine-plugin.mjs';

const message = (source: string) => `Cross-layer imports use the public index: ${source}`;

test('an SDK export with a bundler query is public; an unexported path and other reports are not', () => {
  expect(sdkExportReport(message('@wildshard/sdk/commons/scripts/course.as'))).toBe(true);
  expect(sdkExportReport(message('@wildshard/sdk/commons/scripts/course.as?raw'))).toBe(true);
  expect(sdkExportReport(message('@wildshard/sdk/commons/scripts/nothing-here.as?raw'))).toBe(false);
  expect(sdkExportReport(message('@wildshard/engine/host/headless'))).toBe(false);
  expect(sdkExportReport(undefined)).toBe(false);
});
