#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { capture } from '@wildshard/engine/scripts/parity.mjs';
import { STEPS } from '@wildshard/engine/scripts/parity/combat.mjs';
import { browserPool } from '@wildshard/engine/scripts/parity/pool.mjs';
import { assertMetal } from '@wildshard/engine/scripts/parity/fingerprint.mjs';
import { flatten, object, array, string } from '@wildshard/engine/scripts/parity/value.mjs';

const url = process.argv.find((arg) => arg.startsWith('--url='))?.slice(6);
if (!url) throw new Error('usage: node scripts/test-template-gate.mjs --url=<built preview> [--out=<directory>]');
const out = resolve(process.argv.find((arg) => arg.startsWith('--out='))?.slice(6) ?? 'parity-out/template');
mkdirSync(out, { recursive: true });
const fixture = mkdtempSync(join(tmpdir(), 'template-gate-'));
mkdirSync(join(fixture, 'scripts'));
writeFileSync(join(fixture, 'scripts/physics-route.json'), JSON.stringify({ _template: [{ name: 'hut', gate: true,
  start: { x: 0, y: 1, z: 0, yaw: 0 }, waypoints: [{ x: 0, z: -4 }, { x: 0, z: -7.5 }], timeout: 30 }] }));
// The scripted weapon is the Template's declared whip (SF16): a declared weapon's Weapon.id is its legacySlot,
// which game/server/shardfile/items.ts maps from the row's `slot`, so key on that, not the row id.
const items = object(JSON.parse(readFileSync(resolve(import.meta.dirname, '../src/shards/_template/data/items.json'), 'utf8')));
const whip = string(object(array(items.rows).find((row) => object(row).context === 'template.whip')).slot);
if (!whip) throw new Error('Template items declare no template.whip weapon row');
STEPS._template = [{ step: 'swing', weapon: whip, target: 'greyBlob', near: { x: 0, z: -19 }, distance: 3, hit: 5, kill: 20, settleFrames: 30 }];
const pool = browserPool(resolve(import.meta.dirname, '..'), 1, 'metal');
try {
  const browser = await pool.browser(0); await assertMetal(browser, 'metal');
  const result = object(await capture(browser, url, { shard: '_template', tier: 'phone', lane: 'gh-macos15', sha: '', root: fixture,
    out, timeout: 240, full: false, only: 'walk+combat+leak', offline: false, accelerated: true, telemetryFixture: true }));
  writeFileSync(join(out, 'gate.json'), JSON.stringify(result, null, 2));
  assert.deepEqual(object(result.boot).errors, [], 'template boot');
  const walk = object(result.walk); assert.equal(walk.stuck, 0, 'hut walk'); assert.equal(array(walk.legs).length, 1, 'hut route ran');
  const touch = object(walk.touch);
  assert.ok(typeof touch.moved === 'number' && touch.moved >= 2, 'touch stick moves the player');
  assert.ok(typeof touch.yawDelta === 'number' && touch.yawDelta !== 0, 'touch look changes yaw');
  assert.equal(touch.dodged, true, 'touch dodge'); assert.equal(touch.used, true, 'touch use');
  assert.equal(object(object(result.combat).swing).killed, true, 'custom whip killed the blob');
  const leak = object(result.leak); assert.deepEqual(leak.disposalErrors, [], 'scope disposal');
  const before = flatten(leak.before), after = flatten(leak.after);
  const changes = Object.keys(before).filter((key) => before[key] !== after[key]);
  assert.deepEqual(changes, [], 'independent resource census returns to baseline');
  console.log('Template phone: clean boot, hut walk, blob kill, unload census');
} finally { await pool.close(); rmSync(fixture, { recursive: true, force: true }); }
