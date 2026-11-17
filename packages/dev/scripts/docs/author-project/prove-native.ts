/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseShardfile } from '@wildshard/format/shardSchema';
import { hashImmutableBytes } from '@wildshard/sdk/immutable';
import { validateSimulation } from '@wildshard/engine/host/headless';
import { starterSpearContent } from './generators/spear';

const product = resolve(process.argv[2] ?? 'dist');
const input: unknown = JSON.parse(readFileSync(resolve(product, 'shard.json'), 'utf8'));
const shard = parseShardfile(input);
const assets = new Map(shard.files.map(row => [row.hash, Uint8Array.from(readFileSync(resolve(product, row.hash)))]));
for (const [hash, bytes] of assets) {
  if (hashImmutableBytes(bytes) !== hash) throw new Error(`Changed shard file: ${hash}`);
}
const spear = starterSpearContent(), model = assets.get(spear.hash);
if (model === undefined || !shard.library.includes(spear.hash) || shard.items.rows[0]?.view.asset !== spear.hash) {
  throw new Error('Missing declared spear file or item row');
}
// Native product checks are mandatory here; a rendered-client proof is a separate gate.
console.info(JSON.stringify(await validateSimulation(shard, assets)));
