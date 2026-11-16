import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { emptyShardfile } from '../src/sharddev/author.ts';
import { parseRows } from '@wildshard/format/rows';
import { validateOutputProduct } from '../src/sharddev/outputProduct.ts';
const root = resolve(process.argv[2]);
if (!root.startsWith(resolve('tmp') + sep)) throw new Error('Owned scratch required');
mkdirSync(root, { recursive: true });
if (process.argv[3] === 'explicit') {
  const built = validateOutputProduct(resolve(root, 'old')).shard;
  writeFileSync(resolve(root, 'data.json'), JSON.stringify(built));
  console.log('Explicit source written from the admitted old-source build');
  process.exit(0);
}
const source = emptyShardfile({ slug: 'legacy-sim', name: 'Legacy simulation', author: 'Test', revision: 1, seed: 17 });
source.rows = parseRows({ ...source.rows, species: [{ id: 'fixture.species', kind: 'boar', label: 'Fixture', aggressive: true, lockable: true,
  dims: { bodyY: 0.6, bodyHalfLen: 0.4, bodyRadius: 0.4, headRadius: 0.3, legLen: 0.5, feet: [], halfWidth: 0.4 },
  variants: [{ id: 'plain', label: 'Plain', rarity: 'common', weight: 1, scale: [1, 1], hp: 117,
    mods: { speed: 1.2, chargeDist: 1, damageTaken: 1, chargeDamage: 12, relentless: false } }] }],
  looks: [{ id: 'fixture.look', species: 'fixture.species', recipe: 'engine.sphere', material: null, parameters: {}, animation: { recipe: 'engine.scale-wave', parameters: {} } }],
});
source.creatures = { groups: [], brains: [{ id: 'fixture.pursue', kind: 'pursue', awareRadius: 20, leashRadius: 45, speed: 1.7, returnSpeed: 2,
  stopDistance: 1, turnRate: 3, thinkDivisor: 3, attackCooldownTicks: 90, wanderRadius: 2, wanderEveryTicks: 300 }],
  spawns: [{ id: 'fixture.body', species: 'fixture.species', variant: 'plain', brain: 'fixture.pursue', strike: null, seed: 1, scale: 1, at: [6, 0, 6], yaw: 0 }] };
writeFileSync(resolve(root, 'shard.config.ts'), "import input from './data.json' with { type: 'json' };\nexport default input;\n");
writeFileSync(resolve(root, 'data.json'), JSON.stringify(source));
const digest = value => createHash('sha256').update(value).digest('hex');
console.log(JSON.stringify({ root, oldSource: digest(readFileSync(resolve(root, 'data.json'))) }));
