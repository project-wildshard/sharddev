#!/usr/bin/env node
// SHARD-PLATFORM SF16: the template's creature skins as shardfile content. Copies the SF9c exported grey blob and boar
// (public/assets/baked/skin-fixture, made by scripts/bake/skins.mjs) into the template's content-addressed assets: each
// GLB, plus one `json` skin file ({ row, binding }) that depends on it, and writes data/skins.json for shard.config.ts.
// P1-S1: it lives in scripts/, beside the fixture's own producer, since that fixture stays when the template moves out.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..'), source = resolve(root, 'public/assets/baked/skin-fixture'), project = resolve(root, 'src/shards/_template');
const rows = JSON.parse(readFileSync(resolve(source, 'skins.json'), 'utf8')), bindings = JSON.parse(readFileSync(resolve(source, 'bindings.json'), 'utf8'));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
// the template's species ids and the exported skin that draws each (the look ids are the legacy look rows')
const species = [{ species: 'grey-blob', look: 'template.look.greyBlob', skin: 'grey-blob' }, { species: 'boar', look: 'template.look.boar', skin: 'boar' }];
mkdirSync(resolve(project, 'assets'), { recursive: true });
const out = species.map(({ species: id, look, skin }) => {
  const { motion: _motion, materialNote: _note, ...row } = rows.find((entry) => entry.id === skin) ?? {};
  const binding = bindings.find((entry) => entry.skin === skin);
  if (row.id !== skin || binding === undefined) throw new Error(`template skins: no exported ${skin}`);
  const glb = readFileSync(resolve(source, row.file));
  if (sha(glb) !== row.file) throw new Error(`template skins: ${skin} GLB hash`);
  const json = Buffer.from(JSON.stringify({ row, binding })), hash = sha(json);
  writeFileSync(resolve(project, 'assets', row.file), glb); writeFileSync(resolve(project, 'assets', hash), json);
  return { species: id, look, skin: hash, glb: row.file,
    files: [
      // the parsed rows and layer tables: twice the text, over the plain JSON charge
      { hash, kind: 'json', compressed: json.length, decoded: json.length * 2, gpu: 0, triangles: 0, draws: 0, dependencies: [row.file], critical: false },
      // the row's declared cost already charges the layers' float buffers (SF9c)
      { hash: row.file, kind: 'glb', compressed: glb.length, decoded: row.cost.decoded, gpu: row.cost.gpu, triangles: row.cost.triangles, draws: row.cost.draws, dependencies: [], critical: false },
    ] };
});
writeFileSync(resolve(project, 'data/skins.json'), `${JSON.stringify(out, null, 2)}\n`);
console.info(`template skins: ${out.map((entry) => `${entry.species} ${entry.skin.slice(0, 8)}`).join(', ')}`);
