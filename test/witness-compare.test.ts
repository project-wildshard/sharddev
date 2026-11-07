// oxlint-disable-next-line import/no-nodejs-modules -- Reads the committed witness manifests.
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { compareWitnessManifests } from '../scripts/witness-checkpoints.mjs';

interface Manifest { ticks: Record<string, number>; hashes: Record<string, string>; checkpoints: { digest: string; profile: unknown }[]; endDigest?: string; effects?: unknown[]; cache: { payloads: Record<string, string> } }
const committed = (slug: string): Manifest => JSON.parse(readFileSync(`test/proof/${slug}/checkpoints/manifest.json`, 'utf8')) as Manifest;
const text = (manifest: Manifest): string => JSON.stringify(manifest);
const otherGzip = (manifest: Manifest): Manifest => ({ ...manifest, cache: { ...manifest.cache,
  payloads: Object.fromEntries(Object.keys(manifest.cache.payloads).map(name => [name, 'a'.repeat(64)])) } });
const moved = 'Regenerated witness hashes or outcomes changed';

test('Linux accepts another host gzip, and Darwin does not', () => {
  const pine = committed('pine-hollow');
  expect(() => { compareWitnessManifests(text(pine), text(otherGzip(pine)), 'linux'); }).not.toThrow();
  expect(() => { compareWitnessManifests(text(pine), text(otherGzip(pine)), 'darwin'); }).toThrow(moved);
});

test('Linux sees Pine drift in a tick or a canonical hash', () => {
  const pine = committed('pine-hollow'), { ticks, hashes } = pine;
  expect(() => { compareWitnessManifests(text(pine), text({ ...pine, ticks: { ...ticks, king: 31854 } }), 'linux'); }).toThrow(moved);
  expect(() => { compareWitnessManifests(text(pine), text({ ...pine, hashes: { ...hashes, dawn: 'a'.repeat(64) } }), 'linux'); }).toThrow(moved);
});

test('Linux sees Driftwood drift in its outcome and passes its float digests', () => {
  const drift = committed('driftwood-isle'), rows = drift.checkpoints;
  const digests = structuredClone(rows);
  for (const each of digests) each.digest = 'a'.repeat(64);
  expect(() => { compareWitnessManifests(text(drift), text({ ...drift, checkpoints: digests, endDigest: 'a' }), 'linux'); }).not.toThrow();
  const profile = structuredClone(rows), row = profile[1];
  if (row === undefined) throw new Error('Driftwood lost its second checkpoint');
  row.profile = [];
  expect(() => { compareWitnessManifests(text(drift), text({ ...drift, checkpoints: profile }), 'linux'); }).toThrow(moved);
  expect(() => { compareWitnessManifests(text(drift), text({ ...drift, effects: [] }), 'linux'); }).toThrow(moved);
});

test('a manifest that played nothing never matches, on either host', () => {
  const pine = committed('pine-hollow'), empty = text({ ...pine, ticks: {}, hashes: {} });
  for (const platform of ['linux', 'darwin']) expect(() => { compareWitnessManifests(empty, empty, platform); }).toThrow('played no ticks');
});
