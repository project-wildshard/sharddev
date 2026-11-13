/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseShardfile } from '@wildshard/format/shardSchema';
import { hashImmutableBytes } from '@wildshard/sdk/immutable';
import { validateSimulation } from '@wildshard/engine/host/headless';
import { createCatalogue } from '@wildshard/sdk/commons/catalogue';
import { starterSpearPack } from './generators/spear';

const product = resolve(process.argv[2] ?? 'dist');
const input: unknown = JSON.parse(readFileSync(resolve(product, 'shard.json'), 'utf8'));
const shard = parseShardfile(input);
const assets = new Map(shard.files.map(row => [row.hash, Uint8Array.from(readFileSync(resolve(product, row.hash)))]));
for (const hash of shard.requires.commons) {
  const bytes = Uint8Array.from(readFileSync(resolve(product, hash)));
  if (hashImmutableBytes(bytes) !== hash) throw new Error(`Changed commons bytes: ${hash}`);
  assets.set(`commons:${hash}`, bytes);
}
// Match the packs in shard.config.ts; a different project must list its own configured packs here.
const catalogue = createCatalogue([starterSpearPack({ credit: 'Wildshard starter spear generator', licence: 'First-party' })]);
for (const entry of catalogue.catalogue.entries) {
  if (!shard.requires.commons.includes(entry.hash)) throw new Error(`Missing declared pack: ${entry.id}`);
}
// Native product checks are mandatory here; a rendered-client proof is a separate gate.
console.info(JSON.stringify(await validateSimulation(shard, assets)));
