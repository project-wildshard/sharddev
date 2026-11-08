// CI only: pending work is explicit, present, and cannot silently grow.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const pending = JSON.parse(readFileSync('test/lift-pending.json', 'utf8'));
const review = JSON.parse(readFileSync('test/lift-review.json', 'utf8')).files;
assert.equal(new Set(pending).size, pending.length, 'Duplicate pending path');
assert.equal(new Set(review.map(row => row.file)).size, review.length, 'Duplicate review');
assert.ok(pending.length <= 49, 'The reviewed queue must shrink');
for (const file of pending) {
  assert.ok(existsSync(file), `Absent pending test: ${file}`);
  const row = review.find(row => row.file === file);
  assert.ok(row && ['engine-candidate', 'sdk-candidate', 'graphical-owner'].includes(row.action), `Unjudged pending test: ${file}`);
  assert.ok(row.reason.length > 20, `Missing disposition: ${file}`);
}
for (const row of review.filter(row => row.action === 'run')) assert.ok(existsSync(row.successor), `Absent successor: ${row.file}`);
console.log(`lift review: ${pending.length} waiting; under-50 target met; retained owner work remains`);
