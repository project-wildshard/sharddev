// oxlint-disable-next-line import/no-nodejs-modules -- Exercise a real temporary shard repo.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Keep fixtures inside the test's owned scratch folder.
import { dirname, join, resolve } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import codemod, { guide, pending, title } from '../codemods/0.8.0.mjs';

// SDK 0.8.0 (meta QA 11-25 row 139): engine 0.1.96 deleted legacySlot, so kit's MeleeProfile drops it and its Slot.
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function repo(files: Record<string, string>): string {
  const parent = resolve(process.env['VITEST_TMP_ROOT'] ?? 'tmp/vitest');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, 'melee-slot-codemod-'));
  roots.push(root);
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  return root;
}
const read = (root: string, path: string): string => readFileSync(join(root, path), 'utf8');

const WEAPON = [
  "import type { MeleeProfile } from '@wildshard/kit/weapons/meleeProfile';",
  '',
  "type Sword = MeleeProfile<'sword', 'sword' | 'sword-iron', 'melee'>;",
  'export const row = {',
  "  id: 'weapon.sword',",
  "  legacySlot: 'sword',",
  "  ui: { name: 'Wooden sword' },",
  '};',
  'export const slotOf = (r: { legacySlot?: string }): string | undefined => r.legacySlot;',
  '',
].join('\n');

test('the migration names itself and its guide anchor', () => {
  expect(title).toMatch(/legacySlot/u);
  expect(guide).toBe('migrate-0-8-0');
});

test('a weapon module drops its legacySlot line and Slot argument; other mentions are manual by file and line', () => {
  const fixture = '{ "items": [{ "id": "sword", "legacySlot": "sword" }] }\n';
  const root = repo({ 'src/weapon.ts': WEAPON, 'test/fixtures/items.json': fixture, 'src/ok.ts': 'export {};\n' });
  expect(pending({ project: root })).toMatch(/^src\/weapon\.ts still set legacySlot/u);
  const { lines, manual } = codemod({ project: root });
  expect(read(root, 'src/weapon.ts')).toBe(WEAPON
    .replace("  legacySlot: 'sword',\n", '')
    .replace("MeleeProfile<'sword', 'sword' | 'sword-iron', 'melee'>", "MeleeProfile<'sword', 'melee'>"));
  expect(read(root, 'test/fixtures/items.json')).toBe(fixture);
  expect(lines).toEqual(['src/weapon.ts: drops 1 legacySlot line; MeleeProfile drops its Slot type argument (1)']);
  expect(manual).toEqual([
    expect.stringMatching(/^src\/weapon\.ts:8: names legacySlot/u),
    expect.stringMatching(/^test\/fixtures\/items\.json:1: names legacySlot/u),
  ]);
  expect(pending({ project: root })).toBeUndefined();
  // Idempotent: a second run edits nothing.
  expect(codemod({ project: root }).lines).toEqual([]);
});

test('code that imports nothing from @wildshard is left alone, and a repo with no legacySlot has nothing pending', () => {
  const own = "export const mine = {\n  legacySlot: 'x',\n};\n";
  const root = repo({ 'src/own.ts': own, 'package.json': '{ "name": "shard-x" }\n' });
  expect(pending({ project: root })).toBeUndefined();
  expect(codemod({ project: root }).lines).toEqual([]);
  expect(read(root, 'src/own.ts')).toBe(own);
  const clean = repo({ 'src/a.ts': "import { x } from '@wildshard/sdk';\nexport const y = x;\n" });
  expect(pending({ project: clean })).toBeUndefined();
  expect(codemod({ project: clean })).toEqual({ lines: [], manual: [] });
});
