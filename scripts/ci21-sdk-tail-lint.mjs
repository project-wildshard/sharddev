#!/usr/bin/env node
// CI21's imported tests participate in the normal typed lint and compiler gates.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const manifest = JSON.parse(readFileSync(new URL('../test/ci21-sdk-tail.json', import.meta.url), 'utf8'));
const compiler = JSON.parse(readFileSync(new URL('../tsconfig.author.json', import.meta.url), 'utf8'));
const targets = manifest.files.map(file => file.targetPath);
for (const target of targets) {
  if (!compiler.files.includes(target)) throw new Error(`CI21 test is outside the compiler gate: ${target}`);
}
const selected = process.argv.slice(2);
if (selected.some(file => !targets.includes(file))) throw new Error('CI21 lint accepts only recorded port paths');
const run = spawnSync('node_modules/.bin/oxlint', ['--type-aware', '--tsconfig', 'tsconfig.author.json', '-c', '.oxlintrc.author.json', '--deny-warnings', ...(selected.length === 0 ? targets : selected)], {
  stdio: 'inherit', env: { ...process.env, WILDSHARD_RATCHET_FILE: 'lint/ratchet.json' },
});
if (run.error !== undefined) throw run.error;
process.exitCode = run.status ?? 1;
