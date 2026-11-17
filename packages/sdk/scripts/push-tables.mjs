// D8 exception: small source declarations only, never asset/product generation.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { authoredManifestSource, productManifestPath } from '@wildshard/engine/scripts/authored-manifest.mjs';
import { manifestFolders, outputManifest, shardProducts } from '@wildshard/engine/scripts/shard-outputs.mjs';
import { genStarterArmClips } from '@wildshard/engine/scripts/gen-starter-arm-clips.mjs';
import { genStarterWeapons } from '@wildshard/engine/scripts/gen-starter-weapons.mjs';
import { genStarterBag } from '@wildshard/engine/scripts/gen-starter-bag.mjs';
import { genStarterEffects } from '@wildshard/engine/scripts/gen-starter-effects.mjs';
import { relocateDiscoverySource } from './gen-shards.mjs';

/** @param {string} root */
export function pushTables(root) {
  genStarterArmClips(root); genStarterWeapons(root); genStarterBag(root); genStarterEffects(root);
  for (const product of shardProducts(root, manifestFolders(root))) {
    if (!existsSync(resolve(root, 'src/shards', product.folder, 'manifest.json'))) continue;
    const composed = product.output === null ? null : outputManifest(root, product.folder, product.output);
    const path = resolve(root, productManifestPath(root, product));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, relocateDiscoverySource(root, product, authoredManifestSource(root, product.slug, {
      folder: product.folder, composed, generation: true, metadataOnly: true,
    })));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  pushTables(resolve(process.argv[2] ?? '.'));
}
