import type { Shardfile } from '@wildshard/format/shardSchema';

/** C3: what a page needs before it admits a shard, for an author who wrote no level metadata: `withDiscovery` writes this
 *  as the product's discovery, so the shard wears its own card and enters on its own page, with no first-party manifest
 *  source. Every value is the platform's plain default or the shard's own; a shard's `manifest` replaces all of it. */
const NEUTRAL = [1, 1, 1];
const PHONE = {fps: 30, variability: 1.3, cpuMs: 9.6, gcMs: 0.3, systems: {physics: 0.3, ai: 0.3, animation: 0.3, player: 0.2, world: 0.2, hud: 0.1, audio: 0.1},
  vertexShare: 0.5, lanes: {opaque: 0.4, shadow: 0.2, transparent: 0.1, viewmodel: 0.1, post: 0.1, reserve: 0.1}, linkMs: 1000};
/** Frame budgets a boot reports against: the platform's defaults, the same rows `_template` declares. */
export const AUTHOR_BUDGETS: Readonly<Record<'phone' | 'desktop', Readonly<Record<string, unknown>>>> = {phone: PHONE, desktop: {...PHONE, fps: 60, cpuMs: 4.8}};
/** The name those rows go by in the manifest: no author file, so `withDiscovery` answers it. */
export const AUTHOR_BUDGETS_MODULE = './data/author-budgets.json';

/** A card from the shard's name and seed, so two authors' shards differ on the title with no art of their own. */
export function authorCard(name: string, seed: number): string {
  const hue = Math.abs(seed * 47) % 360, label = name.replaceAll(/[^\p{L}\p{N} .'-]/gu, '').slice(0, 24);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="390" height="844"><rect width="390" height="844" fill="hsl(${hue} 30% 28%)"/><path d="M0 600l130-90 110 60 150-110v384H0z" fill="hsl(${hue} 30% 18%)"/><text x="195" y="420" fill="#fff" font-family="sans-serif" font-size="30" text-anchor="middle">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function authorManifest(shard: Shardfile): unknown {
  const {slug, name, seed} = shard.identity, art = authorCard(name, seed), {spawn} = shard;
  return {
    api: 1, hoverSpeedClass: 'road', slug, order: 1000, status: 'live', name, label: '(+0, +0)', seed, biome: `By ${shard.identity.author}`, blurb: name,
    card: {thumb: art, portrait: art, landscape: art}, style: 'greybox', kitLook: 'toon', hands: 'toon', weapon: 'custom', treeCount: 0,
    trees: {factory: 'none', noun: 'trees'}, minimap: {image: art}, pois: [], assetGlobs: [], spawn,
    bounds: {x0: -250, x1: 250, z0: -250, z1: 250, floor: -10},
    sky: {sunColor: NEUTRAL, sunIntensity: 1.5, envIntensity: 0.5, bgIntensity: 1, fogSunColor: NEUTRAL, cloudSunColor: NEUTRAL, hemiSky: 10266548, hemiGround: 6316128, hemiIntensity: 0.7, sun: {azimuth: 35, elevation: 45}},
    atmosphere: {fogHeight: -20, fogHeightFalloff: 0, fogHeightDensity: 0, fogDistDensity: 0, volumetricSunColor: NEUTRAL},
    grade: {saturation: 0, brightness: 0, contrast: 0, bloomIntensity: 0, bloomThreshold: 1, shadowTint: NEUTRAL, highTint: NEUTRAL, lift: [0, 0, 0], gain: NEUTRAL, gamma: 1},
    explore: {art: {world: art, models: art, sets: art, practice: art}},
    shardfile: `/shardfiles/${slug}/shard.json`, ground: {paths: 'plugin', structures: true}, uses: ['weather', 'dayCycle'],
    species: [], fight: {attackers: 2, telegraphed: true, input: {bufferMs: 120, coyoteMs: 100}},
    creatures: {lowPoly: true, waitForModels: false, furRim: false, tintRange: 0, oneMaterial: true},
    tiers: {phone: {godRays: false, ao: false}, desktop: {godRays: false, ao: false}},
    loot: {coins: true}, hud: {bands: ['band.1', 'band.2', 'band.3']}, spawns: [], audio: {ambience: 'none', score: 'none'},
    bindings: {accent: shard.accent, budgets: {module: AUTHOR_BUDGETS_MODULE, export: 'default'}},
  };
}
