#!/usr/bin/env node
// Milestone proof of the exact archive consumer path; never repairs packages with checkout links.
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [releaseArg, projectArg] = process.argv.slice(2);
if (releaseArg === undefined || projectArg === undefined || process.argv.length !== 4) throw new Error('Usage: node proof-standalone.mjs RELEASE_DIR FRESH_PROJECT');
const release = resolve(releaseArg), project = resolve(projectArg);
if (existsSync(project)) throw new Error('Standalone proof requires a fresh project');
const archives = ['sdk', 'format', 'commons'].map(name => {
  const files = readdirSync(release).filter(file => file.startsWith(`wildshard-${name}-`) && file.endsWith('.tgz'));
  if (files.length !== 1 || files[0] === undefined) throw new Error(`Supply exactly one ${name} release archive`);
  return resolve(release, files[0]);
});
mkdirSync(project, { recursive: true });
/** @param {string} command @param {string[]} args */
function run(command, args) { execFileSync(command, args, { cwd: project, stdio: 'inherit' }); }
run('npm', ['init', '-y']);
run('npm', ['pkg', 'set', 'type=module', 'overrides.@wildshard/sdk=$@wildshard/sdk', 'overrides.@wildshard/format=$@wildshard/format']);
run('npm', ['install', ...archives, 'three@0.186.0']);
run('npm', ['install', '--save-dev', 'typescript@7.0.2', '@types/node@24.13.6', '@types/three@0.186.0']);
for (const name of ['sdk', 'format', 'commons']) {
  if (lstatSync(resolve(project, 'node_modules/@wildshard', name)).isSymbolicLink()) throw new Error('A checkout symlink is not an installed package');
}
run('node', ['node_modules/@wildshard/sdk/dist/author-template/bootstrap.mjs', '.']);
for (const script of ['typecheck', 'synth', 'generate', 'build', 'validate']) run('npm', ['run', script]);
for (const file of ['assets/world.glb', '.wildshard/cache/author-outpost/scene.json', 'dist/shard.json', 'dist/index.html'])
  if (!existsSync(resolve(project, file))) throw new Error(`Missing real standalone product: ${file}`);
const source = readFileSync(resolve(project, 'generators/world.ts'), 'utf8');
if (!source.includes('new Mesh(new BoxGeometry') || !source.includes('staticGlb')) throw new Error('Retained readable generator missing');
writeFileSync(resolve(project, 'standalone-proof.json'), `${JSON.stringify({ pass: true, scripts: ['typecheck', 'synth', 'generate', 'build', 'validate'], packages: ['sdk', 'format', 'commons'], checkoutLinks: 0, retainedGenerator: 'generators/world.ts', browserPlay: 'unmeasured' })}\n`);
console.info('Standalone package install, retained generator, synth, product and native validation PASS; browser play unmeasured');
