import { mossFloor, templateHeightAt, templateSites } from './landscape';
import { bakeTerrain, type BakedTerrain } from '@wildshard/sdk/bake/terrain';

/** Trusted build-time landscape: the legacy seed/noise/trail/pool, levelled under G220's roads and plazas (`cellGround`); no callback enters the shardfile. */
export function templateTerrain(): BakedTerrain & { sites: ReturnType<typeof templateSites> } {
  const heightAt = templateHeightAt();
  return { ...bakeTerrain({ heightAt, colourAt: mossFloor(), family: 'pbr' }), sites: templateSites(heightAt) };
}
