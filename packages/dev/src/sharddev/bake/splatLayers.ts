// SDK-SPLIT SP8a: split from `bake/splatGround` (the sdk's bake builder) because it reads the engine's texture table
// (`filePolicy`, boot data); it moves to the dev package with SP8b.
import { filePolicy } from '@wildshard/engine/boot/filePolicy';
import type { Ktx2Table } from '@wildshard/engine/boot/gpuFiles';

/** One tier's four splat layers by role, as public asset paths. */
export interface SplatLayerPaths { colour: string[]; normal: string[]; arm: string[] }
/**
 * The KTX2 files four native ground layers (`groundLayers` ids, in splat channel order) draw from on each tier, exactly as the
 * runtime's texture arrays resolve them (`filePolicy(tier, 'ktx2', table).layer`: the engine table under the shard's own,
 * the phone's `.phone` variants, found in `inventory`: the public files, keyed by URL); throws when a layer has no `#layer` KTX2.
 */
export function splatLayerFiles(ids: readonly string[], table: Ktx2Table, inventory: Readonly<Record<string, number | true>>): { desktop: SplatLayerPaths; phone: SplatLayerPaths } {
  if (ids.length !== 4) throw new Error('A splat ground has four layers');
  const tier = (name: 'phone' | 'desktop'): SplatLayerPaths => {
    const policy = filePolicy(name, 'ktx2', table, inventory), roles: SplatLayerPaths = { colour: [], normal: [], arm: [] };
    for (const id of ids) {
      const [colour, normal, arm] = policy.pbr(id).map(url => {
        const file = policy.layer(url);
        if (!file.endsWith('.ktx2')) throw new Error(`Splat layer ${url} has no ${name} #layer KTX2`);
        return file;
      });
      if (colour === undefined || normal === undefined || arm === undefined) throw new Error(`Splat layer ${id} lost a role`);
      roles.colour.push(colour); roles.normal.push(normal); roles.arm.push(arm);
    }
    return roles;
  };
  return { desktop: tier('desktop'), phone: tier('phone') };
}
