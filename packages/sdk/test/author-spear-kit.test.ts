import { expect, test } from 'vitest';
import { starterSpearContent } from '../scripts/docs/author-project/generators/spear';
import { spearExample } from '../scripts/docs/authoring/spear';
import { hashImmutableBytes } from '../src/sharddev/immutable';
import { parseGlb } from '../src/sharddev/assets';

test('the retained spear closes over ordinary declared model bytes and exact item rows', () => {
  const content = starterSpearContent(), example = spearExample();
  expect(hashImmutableBytes(content.model)).toBe(content.hash);
  expect(content.cost).toEqual(parseGlb(content.model));
  expect(example.source.requires.commons).toEqual([]);
  expect(example.source.items).toEqual(content.items);
  expect(example.source.items.rows[0]?.view.asset).toBe(content.hash);
  expect(example.source.library).toEqual([content.hash]);
  expect(example.assets.get(content.hash)).toEqual(content.model);
  expect(example.source.files.map(file => file.hash)).toEqual([content.hash]);
  expect(example.source.budgets.library).toEqual({ resident: content.cost.decoded + content.cost.gpu, compressed: content.model.length });
});
