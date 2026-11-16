// oxlint-disable-next-line import/no-nodejs-modules -- A real author build owns and removes its isolated source/output fixture.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Fixtures stay inside the lane's declared scratch directory.
import { resolve } from 'node:path';
import { expect, test, vi } from 'vitest';
import { parseRows } from '@wildshard/format/rows';
import { parseShardfile, type Shardfile } from '@wildshard/format/shardSchema';
import { emptyShardfile } from './author';
import { expandCreatureLayers, assertCreatureDeclarations } from './creatureLayers';
import { buildProject } from './project';
import { checkProject } from './checkProject';
import { settleHandwrittenCreatureLayers } from './handwrittenCreatureLayers';
import { writeOutputProduct } from './outputProduct';
import boar from '@wildshard/kit/content/species/boar.json' with { type: 'json' };

function fixture(kind = 'boar'): Shardfile {
  const source = emptyShardfile({ slug: 'layer-fixture', name: 'Layer fixture', author: 'Test', revision: 1, seed: 17 });
  source.rows = parseRows({ ...source.rows, species: [{ id: 'fixture.species', kind, label: 'Fixture', aggressive: true, lockable: true,
    dims: { bodyY: 0.6, bodyHalfLen: 0.4, bodyRadius: 0.4, headRadius: 0.3, legLen: 0.5, feet: [], halfWidth: 0.4 },
    variants: [{ id: 'plain', label: 'Plain', rarity: 'common', weight: 1, scale: [1, 1], hp: 117,
      mods: { speed: 1.2, chargeDist: 1, damageTaken: 1, chargeDamage: 12, relentless: false } }] }],
    looks: [{ id: 'fixture.look', species: 'fixture.species', recipe: 'engine.sphere', material: null, parameters: {}, animation: { recipe: 'engine.scale-wave', parameters: {} } }],
    strikes: [{ id: 'fixture.strike', shape: { kind: 'sphere', radius: 1 }, windup: 0.2, active: 0.1, recover: 0.3, cooldown: 2, range: 2, damage: 12,
      tags: [`creature.${kind}`], weight: 3, speed: 0 }],
  });
  return parseShardfile(source);
}

test('four old source kinds expand once while explicit author layers and original data keep their values', () => {
  for (const kind of ['boar', 'bear', 'deer', 'greyBlob']) {
    const source = fixture(kind), before = JSON.stringify(source), warnings: string[] = [];
    const built = expandCreatureLayers(source, line => { warnings.push(line); });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('expanded kit layers');
    expect(JSON.stringify(source)).toBe(before);
    expect(built.rows.species[0]?.variants).toEqual(source.rows.species[0]?.variants);
    expect(built.rows.species[0]?.dims).toEqual(source.rows.species[0]?.dims);
    expect(built.rows.species[0]?.body).toEqual({ size: 'medium', scale: 1, look: 'fixture.look' });
    expect(built.rows.species[0]?.temperament?.reaction).toBe('aggressive');
    expect(built.rows.species[0]?.abilities?.[0]).toMatchObject({ use: 'fixture.strike', weight: 3, damage: 12 });
    assertCreatureDeclarations(built.rows);
    expect(expandCreatureLayers(built, line => { warnings.push(line); })).toBe(built);
    expect(warnings).toHaveLength(1);
    if (kind === 'boar') expect(built.rows.species[0]?.temperament?.tuning).toMatchObject(boar.tuning);
  }
});

test('expansion preserves exact explicit spawn policies, authored senses and presentation', () => {
  const source = fixture('greyBlob');
  source.creatures = { groups: [], brains: [{ id: 'my-pursuit', kind: 'pursue', awareRadius: 20, leashRadius: 45,
    speed: 1.7, returnSpeed: 2, stopDistance: 1, turnRate: 3, thinkDivisor: 3, attackCooldownTicks: 90, wanderRadius: 2, wanderEveryTicks: 300 }],
    spawns: [{ id: 'fixture.body', species: 'fixture.species', variant: 'plain', brain: 'my-pursuit', strike: null, seed: 1, scale: 1, at: [0, 0, 0], yaw: 0 }] };
  const row = source.rows.species[0]; if (row === undefined) throw new Error('Missing fixture species');
  row.senses = { notice: 31 }; row.presentation = { blood: false, sounds: { call: 'my_call' } };
  const built = expandCreatureLayers(source, () => undefined);
  expect(built.creatures).toEqual(source.creatures);
  expect(built.rows.species[0]?.temperament?.brain).toBe('my-pursuit');
  expect(built.rows.species[0]?.temperament?.tuning).toBeUndefined();
  expect(built.rows.species[0]?.senses).toEqual(row.senses);
  expect(built.rows.species[0]?.presentation).toEqual(row.presentation);
  const spawn = source.creatures.spawns[0]; if (spawn === undefined) throw new Error('Missing fixture body');
  spawn.brain = null;
  source.encounters = [{ id: 'fixture.encounter', entity: spawn.id, kind: 'elite', panel: null, name: 'Fixture', title: 'Fixture', retry: 'Retry',
    arena: { at: [0, 0, 0], radius: 10 }, intro: 0, introShort: 0, respawn: { at: [1, 0, 1], yaw: 0 },
    phases: [{ at: 1, name: 'Phase', caption: 'Phase', speed: 0, stopDistance: 1, turnRate: 1 }] }];
  expect(expandCreatureLayers(source, () => undefined).rows.species[0]?.temperament?.brain).toBe('none');
  source.creatures.spawns.push({ ...spawn, id: 'fixture.other', brain: 'my-pursuit' });
  expect(() => expandCreatureLayers(source, () => undefined)).toThrow('declare its temperament explicitly');
});

test('the real build emits explicit layers and check names a missing custom temperament', async () => {
  const parent = resolve(process.env['VITEST_TMP_ROOT'] ?? 'tmp/vitest'); mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(resolve(parent, 'creature-layer-build-'));
  const warnings = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    writeFileSync(resolve(root, 'shard.config.ts'), "import input from './data.json' with { type: 'json' };\nexport default input;\n");
    writeFileSync(resolve(root, 'data.json'), JSON.stringify(fixture()));
    const built = await buildProject(root, resolve(root, 'built'), { client: null });
    expect(built.rows.species[0]?.temperament?.tuning).toMatchObject(boar.tuning);
    expect(warnings.mock.calls.some(([line]) => typeof line === 'string' && line.includes('expanded kit layers'))).toBe(true);
    writeFileSync(resolve(root, 'data.json'), JSON.stringify(built));
    const explicit = await buildProject(root, resolve(root, 'explicit'), { client: null });
    expect(explicit.rows).toEqual(built.rows);
    expect(warnings.mock.calls.filter(([line]) => typeof line === 'string' && line.includes('expanded kit layers'))).toHaveLength(1);
    writeFileSync(resolve(root, 'data.json'), JSON.stringify(fixture('own.creature')));
    const result = await checkProject(root, resolve(root, 'checked'));
    expect(result.verdict).toBe('fail');
    expect(result.refusals.some(row => row.message.includes('species `fixture.species` has no temperament'))).toBe(true);
  } finally { warnings.mockRestore(); rmSync(root, { recursive: true, force: true }); }
});

test('hand-held JSON expands in generated output and leaves the authored section bytes untouched', () => {
  const parent = resolve(process.env['VITEST_TMP_ROOT'] ?? 'tmp/vitest'); mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(resolve(parent, 'creature-layer-json-'));
  const warnings = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    const input = resolve(root, 'source'), output = resolve(root, 'output');
    const index = writeOutputProduct(fixture('bear'), new Map(), input);
    const section = index.sections.find(row => row.name === 'actors/species'); if (section === undefined) throw new Error('Missing fixture section');
    const before = readFileSync(resolve(input, section.path));
    const built = settleHandwrittenCreatureLayers(input, output);
    expect(built.shard.rows.species[0]?.temperament?.brain).toBe('hunt');
    expect(built.shard.rows.species[0]?.body?.look).toBe('fixture.look');
    expect(readFileSync(resolve(input, section.path))).toEqual(before);
    expect(warnings.mock.calls.some(([line]) => typeof line === 'string' && line.includes('expanded kit layers'))).toBe(true);
    expect(() => settleHandwrittenCreatureLayers(input, input)).toThrow('separate from its authored source');
  } finally { warnings.mockRestore(); rmSync(root, { recursive: true, force: true }); }
});


test('normal check names a missing look and explicit body looks must belong to their species', async () => {
  const parent = resolve(process.env['VITEST_TMP_ROOT'] ?? 'tmp/vitest'); mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(resolve(parent, 'creature-look-check-'));
  const warnings = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    const source = fixture(); source.rows.looks = [];
    writeFileSync(resolve(root, 'shard.config.ts'), "import input from './data.json' with { type: 'json' };\nexport default input;\n");
    writeFileSync(resolve(root, 'data.json'), JSON.stringify(source));
    const result = await checkProject(root, resolve(root, 'checked'));
    expect(result.verdict).toBe('fail');
    expect(result.refusals.some(row => row.message === 'species `fixture.species` has no look: add one, or use a kit creature')).toBe(true);
    const valid = expandCreatureLayers(fixture(), () => undefined); assertCreatureDeclarations(valid.rows);
    const species = valid.rows.species[0]; if (species?.body === undefined) throw new Error('Missing fixture body');
    species.body.look = 'fixture.other';
    const [look] = valid.rows.looks; if (look === undefined) throw new Error('Missing fixture look');
    valid.rows.looks.push({ ...look, id: 'fixture.other', species: 'other.species' });
    expect(() => assertCreatureDeclarations(valid.rows)).toThrow('species `fixture.species` has no look');
    delete species.body; assertCreatureDeclarations(valid.rows);
  } finally { warnings.mockRestore(); rmSync(root, { recursive: true, force: true }); }
});
