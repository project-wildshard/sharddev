// oxlint-disable-next-line import/no-nodejs-modules -- A hand-written source is a folder of JSON a person edits in place.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Fixture output stays beneath the lane's repository scratch.
import { join } from 'node:path';
import { afterAll, expect, test } from 'vitest';
import { settleHandwritten, writeHandwrittenSource } from './handwritten';
import { closeFixtures, fixtureRoot } from './test/ownedScratch';

// Meta ONE-FORMAT OF25d: since TEMPLATE-E2E TR-10 the hand-written seed is Brasscap Mesa's export (J434), whose Dust
// Wyrm fight (an encounter naming its spawn, a named decision guest) outlived any author who wrote creatures of their
// own: the GUIDE's plain JSON rabbit (shard-stranger `fixtures/write-fixture.py`) no longer packed.
afterAll(closeFixtures);
const read = (source: string, section: string): Record<string, unknown> => JSON.parse(readFileSync(join(source, 'sections', `${section}.json`), 'utf8')) as Record<string, unknown>;
const write = (source: string, section: string, value: unknown): void => { writeFileSync(join(source, 'sections', `${section}.json`), `${JSON.stringify(value)}\n`); };

/** The GUIDE's smallest creature, as plain JSON in the four creature sections. */
function rabbit(source: string): void {
  const spawn = read(source, 'world/spawn')['spawn'] as { x: number; z: number };
  write(source, 'actors/species', { rows: { species: [{ id: 'tiny.rabbit', kind: 'tiny.rabbit', label: 'Angry rabbit', aggressive: true, lockable: true, capExempt: false,
    dims: { bodyY: 0.22, bodyHalfLen: 0.19, bodyRadius: 0.15, headRadius: 0.09, legLen: 0.12, feet: [], halfWidth: 0.14 },
    variants: [{ id: 'plain', label: 'Angry rabbit', rarity: 'common', weight: 1, scale: [1, 1], hp: 30,
      mods: { speed: 1, chargeDist: 1, chargeDamage: 0, damageTaken: 1, relentless: false } }],
    body: { size: 'tiny', scale: 1, look: 'tiny.rabbit.look' },
    temperament: { brain: 'pursue', reaction: 'aggressive', leash: 20, assist: 0, home: { speed: 1.8, stop: 1 },
      tuning: { speed: 2.4, turnRate: 8, thinkDivisor: 1, attackCooldownTicks: 120, wanderRadius: 0, wanderEveryTicks: 120 } },
    senses: { notice: 16 }, abilities: [{ use: 'tiny.rabbit.bite', range: 1.6, cooldown: 3, weight: 1 }] }] } });
  write(source, 'actors/creatures', { creatures: { brains: [], groups: [], spawns: [{ id: 'tiny.rabbit', species: 'tiny.rabbit', variant: 'plain', brain: null,
    strike: null, seed: 17, scale: 1, yaw: Math.PI, at: [spawn.x, 0, spawn.z + 5] }] } });
  write(source, 'combat/strikes', { rows: { strikes: [{ id: 'tiny.rabbit.bite', shape: { kind: 'sphere', radius: 1.6 }, windup: 0.15, active: 0.12, recover: 0.4,
    cooldown: 3, range: 1.6, damage: 1, tags: ['creature.rabbit'], weight: 1, speed: 0 }] } });
  write(source, 'look/materials', { rows: { looks: [{ id: 'tiny.rabbit.look', species: 'tiny.rabbit', recipe: 'engine.sphere', material: null,
    parameters: { colour: [0.62, 0.52, 0.4], radius: 0.18, heightSegments: 6, widthSegments: 10 }, animation: { recipe: 'engine.scale-wave', parameters: {} } }] } });
}

test('a hand-written creature composes on the seed and packs', () => {
  const root = fixtureRoot('handwritten-seed-'), source = join(root, 'tiny'), settled = join(root, 'settled');
  try {
    writeHandwrittenSource(source, 'tiny');
    rabbit(source);
    expect(settleHandwritten(source, settled)).toBe('tiny');
    expect((read(settled, 'actors/species')['rows'] as { species: { id: string }[] }).species.map(row => row.id)).toEqual(['tiny.rabbit']);
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 120_000);

test('a lean repo\'s tooling beside the shard file (scripts/, test/) is not packed, and stays in the source', () => {
  const root = fixtureRoot('handwritten-seed-'), source = join(root, 'tiny');
  try {
    writeHandwrittenSource(source, 'tiny');
    mkdirSync(join(source, 'scripts', '.kit'), { recursive: true }); // Script-paths: a shard source's own scripts/.kit (src/scripts/.kit from its repo root)
    writeFileSync(join(source, 'scripts', '.kit', 'agent-marker-check.mjs'), 'export {}\n'); // Script-paths: a shard source's own scripts/.kit (src/scripts/.kit from its repo root)
    mkdirSync(join(source, 'test', '.kit'), { recursive: true });
    writeFileSync(join(source, 'test', '.kit', 'owned-scratch.mjs'), 'export {}\n');
    expect(settleHandwritten(source, source)).toBe('tiny');
    expect(existsSync(join(source, 'scripts', '.kit', 'agent-marker-check.mjs'))).toBe(true); // Script-paths: a shard source's own scripts/.kit (src/scripts/.kit from its repo root)
    expect(existsSync(join(source, 'test', '.kit', 'owned-scratch.mjs'))).toBe(true);
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 120_000);

test('the seed keeps its place but no creature, fight or decision guest of its own', () => {
  const root = fixtureRoot('handwritten-seed-'), source = join(root, 'tiny');
  try {
    writeHandwrittenSource(source, 'tiny');
    expect(read(source, 'actors/species')).toEqual({ rows: { species: [] } });
    expect(read(source, 'actors/creatures')).toEqual({ creatures: { brains: [], groups: [], spawns: [] } });
    expect(read(source, 'combat/encounters')).toEqual({ encounters: [] });
    const index = JSON.parse(readFileSync(join(source, 'shard.json'), 'utf8')) as { sections: { name: string }[]; files: { kind: string }[] };
    expect(index.sections.map(row => row.name)).not.toContain('sim/scripts');
    expect(index.sections.map(row => row.name)).toContain('world/tiles');
    // the place's own guests stay (the player's server script, the sand rings), the Wyrm's decision guest goes
    expect(index.files.filter(row => row.kind === 'wasm').length).toBeGreaterThan(0);
    expect(JSON.stringify(index)).not.toContain('wyrm.decision');
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 120_000);
