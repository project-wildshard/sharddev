import { expect, test } from 'vitest';
// oxlint-disable-next-line import/no-nodejs-modules -- Read the prepare script's own source.
import { readFileSync } from 'node:fs';
import { recordingLine } from '../scripts/recording-line.mjs';

// QA 11-16 mini F40, re-walked in meta QA 11-25 row 20 on sdk 0.4.34: prepare logged
// `-> ./tmp/wildshard-prepare-*/recording.json`, a folder it deletes before it exits.
const row = { slug: 'my-shard', programs: 91, shaders: 135, lines: 3205, bytes: 765460, file: '/repo/tmp/wildshard-prepare-x/recording.json', build: 'abc' };

test('a scratch recording names no path', () => {
  const line = recordingLine({ ...row, scratch: true });
  expect(line).toBe('my-shard: 91 programs, 135 shaders, 3205 lines, 0.73 MB recorded (abc)');
  expect(line).not.toContain('wildshard-prepare-');
});

test('a kept recording still names its file', () => {
  expect(recordingLine({ ...row, scratch: false })).toBe('my-shard: 91 programs, 135 shaders, 3205 lines, 0.73 MB -> /repo/tmp/wildshard-prepare-x/recording.json (abc)');
});

test('prepare passes --scratch to the recorder it deletes after', () => {
  const prepare = readFileSync(new URL('../scripts/prepare-product.mjs', import.meta.url), 'utf8');
  expect(prepare).toMatch(/'--title',index\.identity\.name,'--scratch'/u);
});
