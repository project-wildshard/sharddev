// ONE-FORMAT OF13: one creature, three authors. The dune jackal written as SDK TypeScript (the kit's helpers), as
// hand-written JSON and as a Python script with no SDK becomes the same shard-file bytes, and GUIDE section 2c shows
// each file as it is here.
// oxlint-disable-next-line import/no-nodejs-modules -- The Python author runs as its own process.
import { execFileSync } from 'node:child_process';
// oxlint-disable-next-line import/no-nodejs-modules -- Read the JSON author, the Python author and the shipped guide.
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { encodeCanonicalJson } from '@wildshard/format/immutable';
import { parseRows } from '@wildshard/format/rows';
import { CreaturesSchema } from '@wildshard/format/creatures';
import { parse } from 'valibot';
import { jackal } from './fixtures/three-authors/jackal';

const file = (name: string): string => readFileSync(new URL(`fixtures/three-authors/${name}`, import.meta.url), 'utf8');
interface Authored { species: unknown[]; strikes: unknown[]; looks: unknown[] }

/** What the shard file stores: the admitted rows, in canonical JSON. */
function admitted(rows: Authored): string {
  const parsed = parseRows({ weather: [], days: [], compendiums: [], loot: [], ...rows });
  return encodeCanonicalJson({ species: parsed.species, strikes: parsed.strikes, looks: parsed.looks });
}

describe('one creature, three authors (ONE-FORMAT OF13)', () => {
  const python = execFileSync('python3', [new URL('fixtures/three-authors/jackal.py', import.meta.url).pathname], { encoding: 'utf8' });
  const authors: Record<string, Authored> = { typescript: jackal, json: JSON.parse(file('jackal.json')) as Authored, python: JSON.parse(python) as Authored };

  test('TypeScript, JSON and Python write the same bytes', () => {
    const bytes = encodeCanonicalJson(jackal);
    for (const [name, rows] of Object.entries(authors)) expect(encodeCanonicalJson(rows), name).toBe(bytes);
    // The Python script prints the canonical bytes itself, with no SDK.
    expect(python).toBe(bytes);
  });

  test('each author is admitted unchanged and places as a plain spawn', () => {
    for (const [name, rows] of Object.entries(authors)) expect(admitted(rows), name).toBe(encodeCanonicalJson(rows));
    // The build names the skin file (the look's `parameters.skin`) from the skinned GLB; the rows above are the author's.
    const creatures = parse(CreaturesSchema, { brains: [], spawns: [{ id: 'den.jackal', species: 'jackal', variant: 'tawny',
      brain: null, strike: null, seed: 1, scale: 1, at: [4, 0, 4], yaw: 0 }] });
    expect(creatures.spawns.map(row => row.species)).toEqual(['jackal']);
  });

  test('the Python author stays under 40 lines', () => {
    expect(file('jackal.py').trimEnd().split('\n').length).toBeLessThanOrEqual(40);
  });

  test("GUIDE's Creatures section shows each author as it is", () => {
    const guide = readFileSync(new URL('../GUIDE.md', import.meta.url), 'utf8');
    const section = guide.slice(guide.indexOf('## 2c. Creatures'), guide.indexOf('## 3. Budgets'));
    expect(section).toContain(`\`\`\`ts\n${file('jackal.ts')}\`\`\``);
    expect(section).toContain(`\`\`\`json\n${file('jackal.json')}\`\`\``);
    expect(section).toContain(`\`\`\`python\n${file('jackal.py')}\`\`\``);
  });
});
