#!/usr/bin/env node
// OF3b1: exact body channels plus existing clips, as admitted standalone content.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSkinRows, parseSkinBindings } from '@wildshard/format/skinData';
import { skinLayerDecoded } from '@wildshard/format/skinLayers';
import { parseGlbData, prepareGlbCost } from '@wildshard/format/glbCost';
import { exportAnimatedCommonBody } from '@wildshard/kit/geometry/export';
import { commonBodyVariants } from '@wildshard/kit/bake/species';
import { quadrupedBinding } from '@wildshard/kit/clips';

await prepareGlbCost();
const root = fileURLToPath(new URL('../packages/kit/content/animated/', import.meta.url));
const check = process.argv.includes('--check'), entries = [];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => new TextEncoder().encode(JSON.stringify(value) + '\n');
function output(path, bytes) {
  const target = resolve(root, path);
  if (check) { if (!Buffer.from(bytes).equals(readFileSync(target))) throw new Error(`Animated kit differs: ${path}`); }
  else { mkdirSync(resolve(target, '..'), { recursive: true }); writeFileSync(target, bytes); }
}
for (const kind of ['boar', 'bear']) for (const family of ['pbr', 'toon']) for (const variant of commonBodyVariants(kind)) {
  const exported = exportAnimatedCommonBody(kind, variant.id, family), id = `kit.${kind}.${variant.id}.${family}`;
  if (!exported.clips) throw new Error('Missing exported clips');
  const binding = quadrupedBinding(id), cost = parseGlbData(exported.glb);
  cost.decoded += skinLayerDecoded(binding.poseLayers ?? {}, exported.bones.length);
  const row = { id, file: hash(exported.glb), family, cost, rig: { skeleton: 'kit.quadruped',
    joints: [exported.bones.map(bone => bone.name)], clips: exported.clips, sockets: ['body', 'head'] } };
  const rows = parseSkinRows([row]); parseSkinBindings([binding], rows);
  const skin = json({ row, binding }), path = `${kind}/${family}/${variant.id}`;
  output(`${path}.glb`, exported.glb); output(`${path}.json`, skin);
  entries.push({ kind, family, variant: variant.id, glb: `${path}.glb`, skin: `${path}.json`,
    glbHash: row.file, skinHash: hash(skin), bytes: exported.glb.length, skinBytes: skin.length, bones: exported.bones, dims: exported.dims });
}
output('catalogue.json', json(entries));
console.info(`Animated kit ${check ? 'checked' : 'built'}: ${entries.length} bodies, ${entries.reduce((sum, row) => sum + row.bytes + row.skinBytes, 0)} bytes`);
