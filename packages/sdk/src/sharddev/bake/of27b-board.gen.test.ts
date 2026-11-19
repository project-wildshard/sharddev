// Scratch only (opus-of27b): writes the OF27b parity board's inputs, the old hull-book files and the new skin look's
// shard files, for Pine's deer and Nalati's wolf at both tiers.
// oxlint-disable-next-line import/no-nodejs-modules
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import * as THREE from 'three';
import { test } from 'vitest';
import { commonCreature } from '@wildshard/kit/creatures';
import { prepareAssetDecoders } from '@wildshard/format/shardfileAssets';
import { validateSkinAssets } from '@wildshard/format/skinAssets';
import { shardfileRules } from '@wildshard/format/shardSchema';
import { lowerShard } from '../scene/lower';
import { sceneShardfile } from '../scene/shardfile';
import { hullCreature, type HullCreatureOptions } from './hullLook';
import { readImagePixels } from './image';
import { bakeRawColourPixels } from './rawTexture';
import { hashImmutableBytes } from '../immutable';

function must<T>(value: T | undefined, what: string): T { if (value === undefined) throw new Error(`missing ${what}`); return value; }

const OUT = process.env['OF27B_OUT'] ?? '';
const PINE = '/Users/raynos/projects/games/wildshard/shard-pine-hollow/public/assets';
const NALATI = '/Users/raynos/projects/games/wildshard/shard-nalati/public/assets/nalati/models';
const read = (path: string): Uint8Array => new Uint8Array(readFileSync(path));
function glbImages(bytes: Uint8Array): Uint8Array[] {
  const n = new DataView(bytes.buffer, bytes.byteOffset).getUint32(12, true);
  const doc = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + n))) as { images: { bufferView: number }[]; bufferViews: { byteOffset?: number; byteLength: number }[] };
  const bin = 28 + n;
  return doc.images.map((image) => { const view = must(doc.bufferViews[image.bufferView], 'buffer view'); return bytes.slice(bin + (view.byteOffset ?? 0), bin + (view.byteOffset ?? 0) + view.byteLength); });
}
const gpu = (dir: string, prefix: string): Uint8Array => {
  const name = readdirSync(dir).find((file) => file.startsWith(prefix) && /^-[0-9a-f]{8}\.(ktx2|glb)$/u.test(file.slice(prefix.length)));
  if (name === undefined) throw new Error(`no ${prefix}`); return read(`${dir}/${name}`);
};
const rawKtx2 = async (webp: Uint8Array): Promise<Uint8Array> => bakeRawColourPixels(await readImagePixels(webp));
const { species: { id: _i, body: _b, abilities: _a, harvest: _h, ...base } } = commonCreature('boar', { id: 'fixture.unused', look: 'fixture.unused.look' });
const species = (ids: string[]): HullCreatureOptions['species'] => ({ ...base, variants: ids.map((id) => ({ ...base.variants[0], id })) }) as HullCreatureOptions['species'];
export const DEER_FUR = { roughness: 0.82, sheen: 0.3, sheenColor: [0.45, 0.36, 0.26], envMapIntensity: 0.6, rim: [1.0, 0.72, 0.42] } as const;
export const GHOST_FUR = { rim: [0.55, 0.92, 1.0], emissive: [0.30, 0.62, 0.75], emissiveIntensity: 0.16, sheenColor: [0.6, 0.8, 0.9] } as const;

test.runIf(OUT !== '')('write the OF27b board inputs', async () => {
  await prepareAssetDecoders();
  const manifest: unknown[] = [];
  const put = (bytes: Uint8Array, ext: string): string => { const name = `${hashImmutableBytes(bytes)}.${ext}`; writeFileSync(`${OUT}/${name}`, bytes); return name; };
  for (const tier of ['desktop', 'phone'] as const) {
    const dot = tier === 'phone' ? '.phone' : '';
    // Pine's deer: two hulls, their KTX2 maps (out of the GPU rig), baked coats, the ghost's own fur
    const maps = (hull: string): { base: Uint8Array; normal: Uint8Array } => {
      const [b, n] = glbImages(gpu(`${PINE}/gpu/pine-hollow/creatures`, `${hull}${dot}.rigged`)); return { base: must(b, 'base map'), normal: must(n, 'normal map') };
    };
    const coat = (hull: string, variant: string): Uint8Array => gpu(`${PINE}/gpu/pine-hollow/creatures/coats`, `${hull}.deer.${variant}${dot}`);
    const stag = maps('deer-stag'), hind = maps('deer-hind'), hindRig = read(`${PINE}/pine-hollow/creatures/deer-hind${dot}.rigged.glb`);
    const stagRig = read(`${PINE}/pine-hollow/creatures/deer-stag${dot}.rigged.glb`);
    const coats = { 'white-stag': coat('deer-stag', 'white-stag'), ghost: coat('deer-stag', 'ghost'), piebald: coat('deer-hind', 'piebald') };
    const deerIds = ['stag', 'white-stag', 'ghost', 'hind', 'piebald'];
    const deer = await hullCreature('pine.deer', stagRig, { species: species(deerIds), size: 'medium', skeleton: 'quadruped', look: { maps: stag, surface: { family: 'pbr', fur: DEER_FUR }, variants: {
      'white-stag': { coat: coats['white-stag'] }, ghost: { coat: coats.ghost, fur: GHOST_FUR }, hind: { rig: hindRig, maps: hind }, piebald: { rig: hindRig, maps: hind, coat: coats.piebald } } } });
    // Nalati's wolf: one hull, its embedded atlas and the coats as raw KTX2 (the same texels the webp holds)
    const wolfRig = read(`${NALATI}/wolf${dot}.rigged.glb`), atlas = await rawKtx2(must(glbImages(wolfRig)[0], 'wolf atlas'));
    const wolfCoats = { dark: await rawKtx2(read(`${NALATI}/coats/wolf.wolf.dark.coat${dot}.webp`)), tawny: await rawKtx2(read(`${NALATI}/coats/wolf.wolf.tawny.coat${dot}.webp`)) };
    const wolfIds = ['grey', 'dark', 'tawny'];
    const wolf = await hullCreature('nalati.wolf', wolfRig, { species: species(wolfIds), size: 'medium', skeleton: 'quadruped', look: { maps: { base: atlas }, surface: { family: 'painterly', rim: 0.8, bands: 0.85 },
      variants: { dark: { coat: wolfCoats.dark }, tawny: { coat: wolfCoats.tawny } } } });
    const scene = lowerShard({ slug: 'board', name: 'Board' }, (world) => { world.spawn(0, 0, 0); const den = new THREE.Object3D(); den.position.set(20, 0, 20); world.scene.add(den); });
    const { shard, assets } = sceneShardfile({ ...scene, creatures: [deer, wolf] });
    validateSkinAssets(shard, assets);
    const rules = shardfileRules(shard); if (rules.length > 0) throw new Error(rules.join('; '));
    const kinds = new Map(shard.files.map((file) => [file.hash, file.kind]));
    const wanted = new Set<string>(), visit = (hash: string): void => { if (wanted.has(hash)) return; wanted.add(hash); for (const dep of shard.files.find((f) => f.hash === hash)?.dependencies ?? []) visit(dep); };
    for (const look of [deer.look, wolf.look]) { visit(String(look.parameters['skin'])); visit(String(look.parameters['variants'])); }
    for (const hash of wanted) writeFileSync(`${OUT}/${hash}`, must(assets.get(hash), hash));
    manifest.push({ tier, newPath: { rows: { looks: [deer.look, wolf.look], species: [deer.species, wolf.species] }, files: shard.files.filter((f) => wanted.has(f.hash)), assets: [...wanted], kinds: Object.fromEntries([...wanted].map((h) => [h, kinds.get(h)])) },
      oldPath: {
        deer: { variants: deerIds, row: { label: 'pine', rigs: ['deer-stag', 'deer-hind'], hulls: { 'deer:stag': 'deer-stag', 'deer:white-stag': 'deer-stag', 'deer:ghost': 'deer-stag', 'deer:hind': 'deer-hind', 'deer:piebald': 'deer-hind' } },
          urls: { files: { 'deer-stag': { rig: put(stagRig, 'glb'), base: put(stag.base, 'ktx2'), normal: put(stag.normal, 'ktx2') }, 'deer-hind': { rig: put(hindRig, 'glb'), base: put(hind.base, 'ktx2'), normal: put(hind.normal, 'ktx2') } },
            coats: { 'deer-stag:deer:white-stag': { key: 'none', image: put(coats['white-stag'], 'ktx2') }, 'deer-stag:deer:ghost': { key: 'none', image: put(coats.ghost, 'ktx2') }, 'deer-hind:deer:piebald': { key: 'none', image: put(coats.piebald, 'ktx2') } } },
          fur: DEER_FUR, variantFur: { ghost: GHOST_FUR } },
        wolf: { variants: wolfIds, row: { label: 'nalati', rigs: ['wolf'], hulls: { 'wolf:grey': 'wolf', 'wolf:dark': 'wolf', 'wolf:tawny': 'wolf' } },
          urls: { files: { wolf: put(wolfRig, 'glb') }, coats: { 'wolf:wolf:dark': { key: 'none', image: put(wolfCoats.dark, 'ktx2') }, 'wolf:wolf:tawny': { key: 'none', image: put(wolfCoats.tawny, 'ktx2') } }, vertexColours: true },
          painterly: { rim: 0.8, bands: 0.85 } } } });
  }
  writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 1));
}, 300_000);
