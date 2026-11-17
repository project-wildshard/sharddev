#!/usr/bin/env node
// OF3a: regenerate plain kit body assets; --check compares every committed byte.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportCommonBody } from '@wildshard/kit/geometry/export';
import { commonBodyVariants, BOAR_LOOK, BEAR_LOOK } from '@wildshard/kit/bake/species';

const root = fileURLToPath(new URL('../../kit/content/creatures/', import.meta.url));
const check = process.argv.includes('--check');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => new TextEncoder().encode(JSON.stringify(value, null, 2) + '\n');
function output(path, bytes) {
  const target = resolve(root, path);
  if (check) {
    if (!Buffer.from(bytes).equals(readFileSync(target))) throw new Error(`Kit body differs: ${path}`);
  } else {
    mkdirSync(resolve(target, '..'), { recursive: true });
    writeFileSync(target, bytes);
  }
}
const entries = [];
for (const kind of ['boar', 'bear']) {
  const { build: _build, ...look } = kind === 'boar' ? BOAR_LOOK : BEAR_LOOK;
  output(`${kind}/look.json`, json(look));
  for (const family of ['pbr', 'toon']) for (const variant of commonBodyVariants(kind)) {
    const { glb, ...metadata } = exportCommonBody(kind, variant.id, family);
    const file = `${kind}/${family}/${variant.id}.glb`;
    output(file, glb);
    entries.push({ ...metadata, file, bytes: glb.length, sha256: sha(glb) });
  }
}
output('bodies.json', json(entries));
console.info(`Kit bodies ${check ? 'checked' : 'built'}: ${entries.length} GLBs, ${entries.reduce((sum, row) => sum + row.bytes, 0)} bytes`);
