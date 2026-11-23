import { expect, test } from 'vitest';
import { PLATFORM_DATA_SECTIONS, type PlatformDataSectionName } from '@wildshard/format/platformDataSections';
import { emitPlatformSections } from '../src/sharddev/platformSections';

// SHARD-COMPAT HS6d (meta): the SDK writes the server's `server/plan` beside `client/plan`, byte for byte, once the pinned
// format names the section (HS6b); against an older format it writes what it wrote before.
const plan = { version: 1, features: [{ kind: 'debug.expose', name: 'hs6d' }] };

test('server/plan rides beside client/plan exactly when the format names it', () => {
  const emitted = emitPlatformSections(new Map<PlatformDataSectionName, unknown>([['client/plan', plan]]));
  const names = emitted.sections.map(row => row.name), known = Object.hasOwn(PLATFORM_DATA_SECTIONS, 'server/plan');
  expect(names).toEqual(known ? ['client/plan', 'server/plan'] : ['client/plan']);
  if (known) expect(emitted.files.get('sections/server/plan.json')).toEqual(emitted.files.get('sections/client/plan.json'));
});

test('a shard with no client plan gets no server plan', () => {
  expect(emitPlatformSections(new Map()).sections).toEqual([]);
});
