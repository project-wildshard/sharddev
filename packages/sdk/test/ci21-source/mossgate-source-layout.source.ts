// oxlint-disable-next-line import/no-nodejs-modules -- Own bounded author fixtures under the repository scratch root.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve source and owned fixture paths.
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { mapSettingsPath, mapStampPath, mapSettings } from '@wildshard/engine/scripts/map-hash.mjs';
import { shardfileBoundaryViolations } from '../../lint/shardfile-boundaries.mjs';
import { simClosure, simRoot } from '@wildshard/engine/lint/sim-closure.mjs';

const root = resolve('.');
// TEMPLATE-E2E TR-11 (J434): the retired Template's case, on Mossgate, the template that replaced it. Mossgate is scene
// source with no card, discovery file, README or map settings, so check-shards' folder rules (a legacy shard folder's) and
// the map settings stay on Pastel Plain's map alone.
test('Template author modules and temporary discovery have zero P0 and sim violations', () => {
  const entries: string[] = [];
  const visit = (folder: string): void => {
    for (const item of readdirSync(resolve(root, folder), { withFileTypes: true })) {
      const path = `${folder}/${item.name}`;
      if (item.isDirectory()) visit(path);
      else if (path.endsWith('.ts') && !path.endsWith('.test.ts')) entries.push(path);
    }
  };
  visit('src/shards/mossgate/generators'); entries.push('src/shards/mossgate/shard.config.ts');
  expect(entries.length).toBeGreaterThan(5);
  for (const file of entries) expect(shardfileBoundaryViolations(root, file, readFileSync(file, 'utf8'))).toEqual([]);
  expect(simClosure(root, entries.filter(simRoot))).toEqual([]);
  const pastel = resolve(root, 'src/shards/pastel-plain');
  expect(mapSettingsPath(pastel)).toBe(resolve(pastel, 'data/map.json'));
  expect(mapStampPath(pastel)).toBe(resolve(pastel, 'data/productMap.json'));
  expect(mapSettings(pastel).style?.kind).toBe('ground');
});

test('legacy map layout remains the fallback until a source map exists', () => {
  const fixture = mkdtempSync(resolve(root, 'tmp/map-layout-'));
  try {
    mkdirSync(resolve(fixture, 'look'));
    writeFileSync(resolve(fixture, 'look/map.json'), JSON.stringify({ why: 'Legacy fixture', inputs: ['world'] }));
    expect(mapSettingsPath(fixture)).toBe(resolve(fixture, 'look/map.json'));
    expect(mapStampPath(fixture)).toBe(resolve(fixture, 'look/map.baked.json'));
    expect(mapSettings(fixture).inputs).toEqual(['world']);
    mkdirSync(resolve(fixture, 'data'));
    writeFileSync(resolve(fixture, 'data/map.json'), JSON.stringify({ why: 'Source fixture', inputs: ['source'] }));
    expect(mapSettingsPath(fixture)).toBe(resolve(fixture, 'data/map.json'));
    expect(mapStampPath(fixture)).toBe(resolve(fixture, 'data/productMap.json'));
    expect(mapSettings(fixture).inputs).toEqual(['source']);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
