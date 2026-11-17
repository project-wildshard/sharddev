import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';

const baseline = execFileSync('git', ['merge-base', 'HEAD', 'origin/main'], { encoding: 'utf8' }).trim();
const original = path => JSON.parse(execFileSync('git', ['show', `${baseline}:${path}`], { encoding: 'utf8' }));
const current = path => JSON.parse(readFileSync(path, 'utf8'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const catalogue = current(new URL(import.meta.resolve('@wildshard/kit/content/animated/catalogue.json')));
const entry = catalogue.find(row => row.kind === 'boar' && row.family === 'toon' && row.variant === 'boar');
assert.ok(entry);
const shippedGlb = readFileSync(new URL(import.meta.resolve(`@wildshard/kit/content/animated/${entry.glb}`)));
const shippedSkin = readFileSync(new URL(import.meta.resolve(`@wildshard/kit/content/animated/${entry.skin}`)));
const projects = [];
for (const name of ['_template', 'pastel-plain']) {
  const prefix = `src/shards/${name}`, before = original(`${prefix}/data/rows.json`), after = current(`${prefix}/data/rows.json`);
  const oldBoar = before.species.find(row => row.id === 'boar'), boar = after.species.find(row => row.id === 'boar');
  assert.ok(oldBoar); assert.ok(boar);
  for (const [key, value] of Object.entries(oldBoar)) assert.deepEqual(boar[key], value, `${name} gameplay field ${key}`);
  for (const row of before.species) {
    const next = after.species.find(value => value.id === row.id); assert.ok(next);
    for (const [key, value] of Object.entries(row)) assert.deepEqual(next[key], value, `${name}/${row.id}/${key}`);
  }
  assert.deepEqual(original(`${prefix}/data/creatures.json`), current(`${prefix}/data/creatures.json`));
  assert.deepEqual(before.strikes, after.strikes);
  const skin = current(`${prefix}/data/skins.json`).find(row => row.species === 'boar');
  assert.ok(skin); assert.equal(boar.body.look, skin.look); assert.equal(boar.body.skeleton, 'quadruped');
  assert.equal(boar.temperament.brain, 'none');
  assert.deepEqual(readFileSync(`${prefix}/assets/${skin.glb}`), shippedGlb);
  assert.deepEqual(readFileSync(`${prefix}/assets/${skin.skin}`), shippedSkin);
  assert.equal(skin.glb, digest(shippedGlb)); assert.equal(skin.skin, digest(shippedSkin));
  const retained = Object.fromEntries(Object.keys(oldBoar).map(key => [key, boar[key]]));
  projects.push({ name, variants: boar.variants.map(row => row.id), gameplay: digest(JSON.stringify(retained)),
    previousGameplay: digest(JSON.stringify(oldBoar)), glb: skin.glb, skin: skin.skin, files: skin.files.length });
}
const result = { baseline, kit: current('packages/kit/package.json').version, projects };
if (process.argv[2] !== undefined) {
  const output = resolve(process.argv[2]);
  if (!output.startsWith(`${resolve('tmp')}${sep}`)) throw new Error('Proof output must be owned scratch');
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
}
console.log(JSON.stringify(result));
