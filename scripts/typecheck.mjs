#!/usr/bin/env node
// Run every existing TypeScript project without serial pnpm startup.
// All projects must finish successfully; stdout/stderr stay attached.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const compiler = resolve(root, 'node_modules/.bin/npr');
const projects = ['packages/sdk/src/tsconfig.json', 'packages/sdk/tsconfig.author.json', 'packages/dev/src/tsconfig.json', 'packages/dev/src/web/tsconfig.json', 'packages/dev/tsconfig.author.json', 'packages/upload/tsconfig.json', 'packages/kit/tsconfig.json'];
const results = await Promise.all(projects.map(project => new Promise(done => {
  const child = spawn(compiler, ['tsc', '-p', project], { cwd: root, stdio: 'inherit' });
  child.on('error', error => { process.stderr.write([project, ': ', error.message, '\n'].join('')); done(1); });
  child.on('close', code => done(code ?? 1));
})));
process.exitCode = results.some(code => code !== 0) ? 1 : 0;
