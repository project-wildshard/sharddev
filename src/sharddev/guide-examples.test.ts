// meta SHARD-SOURCE F11: GUIDE's TypeScript examples are what an author copies, so they pass the author lint's
// `typescript/no-non-null-assertion` (.oxlintrc.author.json): no `x!` in any ```ts block.
// oxlint-disable-next-line import/no-nodejs-modules -- Read the shipped guide.
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

test('GUIDE.md\'s ts examples use no non-null assertion', () => {
  const guide = readFileSync(new URL('../../GUIDE.md', import.meta.url), 'utf8');
  const blocks = [...guide.matchAll(/```ts\n([\s\S]*?)```/gu)].map((match) => match[1] ?? '');
  expect(blocks.length).toBeGreaterThan(0);
  const asserted = blocks.flatMap((block) => block.split('\n').filter((line) => /[\w)\]]!(?=[.,;)\s[])/u.test(line.replaceAll(/!==?/gu, ''))));
  expect(asserted).toEqual([]);
});
