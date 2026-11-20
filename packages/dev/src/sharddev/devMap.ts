// oxlint-disable-next-line import/no-nodejs-modules -- The cook renders the local product's indexed files.
import { readFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- The product owns its cook output and blob paths.
import { resolve } from 'node:path';
import { writeCookedMap } from '@wildshard/engine/game/shardCook';
import { outputDescriptor } from '@wildshard/engine/game/shardfile/outputDescriptor';
import { loadHeadlessFolder } from '@wildshard/engine/host/headlessFolder';

/** The same two PNGs the cook would produce, under the local dev product's shardfiles path. */
export async function renderDevMap(directory: string): Promise<void> {
  const { shardfile } = await loadHeadlessFolder(directory);
  const descriptor = outputDescriptor(shardfile);
  if (descriptor === undefined) throw new Error('Dev map requires an indexed shard product');
  await writeCookedMap({ slug: shardfile.identity.slug, ...descriptor,
    read: path => new Uint8Array(readFileSync(resolve(directory, path))) }, directory);
}
