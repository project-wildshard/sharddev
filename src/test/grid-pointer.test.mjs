// FORMAT-PRUNE FP36 (11-24, J505): sharddev 02a85369 spelled the retired grid pointer in the SDK's runtime source, and
// format's one-way check (`sdk.grid-pointer-references`, ceiling 0, shard-format src/tools/one-way-counts.ts) then
// blocked the format 0.75.0 cut. The same count, here in every push: the runtime source (src/ and packages/*/src/, no
// tests) never names it. The format alone refuses it in a shard file.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const WORD = ['grid', 'Shardfile'].join('');
const RUNTIME = /^(?:src\/|packages\/[^/]+\/src\/)/u;
const TEST = /(?:^|\/)(?:test|__tests__|e2e)\/|\.(?:test|spec)\./u;

test('the SDK runtime source never names the retired grid pointer (format one-way sdk.grid-pointer-references = 0)', () => {
  const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 256 << 20 }).split('\0')
    .filter((path) => RUNTIME.test(path) && !TEST.test(path) && /\.(?:[cm]?[jt]sx?|json)$/u.test(path));
  const pattern = new RegExp(`\\b${WORD}\\b`, 'u');
  const named = files.filter((path) => pattern.test(readFileSync(path, 'utf8')));
  assert.deepEqual(named, []);
});
