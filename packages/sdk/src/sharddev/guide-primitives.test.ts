// meta ONE-FORMAT OF18a (J365 (4), Q-S13): GUIDE section 8 has one page per primitive family in the format's table,
// and each page says what switches it on, as the table does.
// oxlint-disable-next-line import/no-nodejs-modules -- Read the shipped guide.
import { readFileSync } from 'node:fs';
import { PRIMITIVES } from '@wildshard/format/primitives';
import { parseRows, rowRules } from '@wildshard/format/rows';
import { emptyShardfile } from '@wildshard/engine/host/author';
import { describe, expect, it } from 'vitest';
import { GUIDE_SOURCE } from './agentFiles';
import { camel } from './guide/riding.example';

const guide = readFileSync(GUIDE_SOURCE, 'utf8');
const section = guide.split(/^## 8\. Primitives$/mu)[1]?.split(/^## /mu)[0] ?? '';
/** Each `### \`name\`` page's text, up to the next heading. */
const pages = new Map([...section.matchAll(/^### `([^`]+)`\n([\s\S]*?)(?=^#{2,3} |(?![\s\S]))/gmu)].map(match => [match[1] ?? '', match[2] ?? '']));

describe('GUIDE.md section 8, primitives', () => {
  it('has one page per primitive family, and no page for a family the format lacks', () => {
    expect(section.length).toBeGreaterThan(0);
    expect(PRIMITIVES.map(row => row.name).filter(name => !pages.has(name))).toEqual([]);
    expect([...pages.keys()].filter(name => !PRIMITIVES.some(row => row.name === name))).toEqual([]);
    for (const name of ['riding', 'boss', 'population']) expect(pages.get(name)).toMatch(/\*\*Used by:\*\*/u);
  });

  it('says on each page what switches the family on, as the format table does', () => {
    for (const row of PRIMITIVES) {
      const page = pages.get(row.name) ?? '';
      if (row.on === 'always') expect(page, row.name).toMatch(/\*\*Switched\s+on:\*\*\s+always\./u);
      else if (row.on === 'later') expect(page, row.name).toMatch(/\*\*Switched\s+on:\*\*\s+not\s+yet;\s+today\s/u);
      else for (const trigger of Array.isArray(row.on) ? row.on : [row.on]) expect(page, row.name).toContain(`\`${trigger.section}\``);
      expect(page.replaceAll(/\s+/gu, ' '), row.name).toContain(`**Row:** ${row.row}`);
    }
  });
});

// OF18b: a page's plain-JSON example is `data/` rows: they parse with the rows schema and pass its rules, and its SDK
// TypeScript example (a file in src/sharddev/guide, type-checked with the sdk) is that file and builds the same rows.
const blocks = (page: string, lang: string): string[] => [...page.matchAll(new RegExp(`^\`\`\`${lang}\n([\\s\\S]*?)^\`\`\``, 'gmu'))].map(match => match[1] ?? '');
const EXAMPLES: Readonly<Record<string, { file: string; rows: unknown }>> = { riding: { file: 'riding.example.ts', rows: camel } };
/** The JSON example's rows over an empty shard's, parsed and checked; throws on a schema or rule failure. */
function checkRows(json: unknown): void {
  const rows = parseRows({ ...emptyShardfile({ slug: 'guide', name: 'Guide', author: 'Test', revision: 1, seed: 1 }).rows, ...(json as object) });
  const errors = rowRules(rows);
  if (errors.length > 0) throw new Error(errors.join('; '));
}

describe('GUIDE.md section 8, examples (OF18b)', () => {
  it("each page's JSON example parses as rows; its TypeScript example is the checked file and builds the same rows", () => {
    for (const [name, page] of pages) {
      for (const json of blocks(page, 'json')) expect(() => { checkRows(JSON.parse(json)); }, name).not.toThrow();
      const ts = blocks(page, 'ts'), example = EXAMPLES[name];
      if (example === undefined) { expect(ts, name).toEqual([]); continue; }
      expect(ts, name).toEqual([readFileSync(new URL(`guide/${example.file}`, import.meta.url), 'utf8')]);
      expect(blocks(page, 'json').map(json => JSON.parse(json) as unknown), name).toEqual([structuredClone(example.rows)]);
    }
    expect(blocks(pages.get('riding') ?? '', 'json')).toHaveLength(1);
  });

  it('a planted bad gait fails the riding example', () => {
    const json = JSON.parse(blocks(pages.get('riding') ?? '', 'json')[0] ?? '{}') as { species: { mount: { gaits: Record<string, number> } }[] };
    const mount = json.species[0]?.mount;
    if (mount === undefined) throw new Error('riding example has no mount');
    mount.gaits['walk'] = -1;
    expect(() => { checkRows(json); }).toThrow();
    mount.gaits['walk'] = 20;
    expect(() => { checkRows(json); }).toThrow();
  });
});
