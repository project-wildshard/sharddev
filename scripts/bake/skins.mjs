#!/usr/bin/env node
// Trusted SF9c export: procedural generators and pose closures become immutable GLB joints, weights and clips.
import { build } from 'vite';
import { mkdtempSync, rmSync, symlinkSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const repo = resolve(import.meta.dirname, '../..'), scratch = mkdtempSync(join(tmpdir(), 'skin-export-'));
try {
  process.chdir(repo); symlinkSync(join(repo, 'node_modules'), join(scratch, 'node_modules'));
  await build({ configFile: false, logLevel: 'silent', build: { target: 'esnext', outDir: join(scratch, 'generator'), emptyOutDir: true, lib: { entry: join(repo, 'test/fixtures/sim-level/skins/build.ts'), formats: ['es'], fileName: 'build' }, rolldownOptions: { platform: 'node', external: [/^node:/u, 'vite', '@gltf-transform/core', '@gltf-transform/extensions', 'meshoptimizer'] } } });
  const generator = await import(pathToFileURL(join(scratch, 'generator/build.js')).href), directory = join(repo, 'public/assets/baked/skin-fixture');
  await generator.writeSkinFixtures(directory); copyFileSync(join(directory, 'skins.json'), join(repo, 'test/fixtures/sim-level/skins/skins.json'));
} finally { rmSync(scratch, { recursive: true, force: true }); }
