// oxlint-disable-next-line import/no-nodejs-modules -- the reader reads a real shard folder
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- the reader reads a real shard folder
import { tmpdir } from 'node:os';
// oxlint-disable-next-line import/no-nodejs-modules -- the reader reads a real shard folder
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { readCookInput } from './cookInput';

// AUDIO AU5: a shard's dated audio waiver lives in its source, one row per output slug, and rides into the product.

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function shard(files: Record<string, unknown>): string {
  const root = mkdtempSync(join(tmpdir(), 'sharddev-waiver-'));
  roots.push(root);
  const project = join(root, 'src/shards/pine');
  mkdirSync(project, { recursive: true });
  for (const [name, value] of Object.entries(files)) writeFileSync(join(project, name), JSON.stringify(value));
  return project;
}

const row = { shard: 'pine-hollow', until: '2026-12-31', maxBytes: 15_000_000, reason: 'AU10 re-encodes Pine' };

it('carries the waiver row for this output slug', () => {
  const project = shard({ 'audio-waiver.json': { version: 1, waivers: [row, { ...row, shard: 'other' }] } });
  expect(readCookInput(project, 'pine-hollow')).toEqual({ mounts: [], audioWaiver: row });
  expect(readCookInput(project, 'nalati')).toBeUndefined();
});

it('refuses a waiver with no date', () => {
  const project = shard({ 'audio-waiver.json': { version: 1, waivers: [{ ...row, until: 'soon' }] } });
  expect(() => readCookInput(project, 'pine-hollow')).toThrow();
});
