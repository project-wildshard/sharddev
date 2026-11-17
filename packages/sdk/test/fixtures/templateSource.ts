// oxlint-disable-next-line import/no-nodejs-modules -- Native fixtures read only the remaining unconverted source assets.
import fs from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- These fixture programs run from the repository root.
import { resolve } from 'node:path';
import { templateTerrain } from '../../src/shards/_template/generators/terrain';
import { templateProduct } from '../../src/shards/_template/generators/product';
import { compileDeclaredDecisionScripts as compileDecisionScripts } from '../../src/sharddev/buildDecisionScripts';
import { compileTemplateBoss, TEMPLATE_BOSS_INPUTS } from '../../src/shards/_template/generators/boss';
import { compileScript } from '../../src/sharddev/bake/compileScript';
import { compileTemplateBehaviour, TEMPLATE_BEHAVIOUR_INPUTS, templateBehaviourMetadata } from '../../src/shards/_template/generators/behaviour';
import { hashImmutableBytes } from '../../src/sharddev/immutable';
import { templatePropRows } from '../../src/shards/_template/generators/props';

const scripts = await compileTemplateBehaviour({ compileScript }, new Map(TEMPLATE_BEHAVIOUR_INPUTS.map(file => [file, new Uint8Array(fs.readFileSync(resolve(import.meta.dirname, '../../src/shards/_template', file)))])));
const bossBytes = await compileTemplateBoss({ compileDecisionScripts }, new Map(TEMPLATE_BOSS_INPUTS.map(file => [file, new Uint8Array(fs.readFileSync(resolve(import.meta.dirname, '../../src/shards/_template', file)))])));
export const TEMPLATE_BOSS = { hash: hashImmutableBytes(bossBytes), compressed: bossBytes.length };
export const TEMPLATE_BEHAVIOUR = templateBehaviourMetadata(scripts);
const { assets: terrain, ...rows } = templateTerrain(), props = templatePropRows(), generated = new Map([...terrain, ...props.assets, [TEMPLATE_BOSS.hash, bossBytes] as const, ...[...scripts.values()].map(bytes => [hashImmutableBytes(bytes), bytes] as const)]);
/** Native tests consume the same producer rows and bytes as the executable build entry. */
export const TEMPLATE_SOURCE = templateProduct(rows, props, TEMPLATE_BEHAVIOUR, TEMPLATE_BOSS);
/** Preserve independently owned input bytes for each admission. Other producers migrate in subsequent GR1 slices. */
export function templateAssets(hashes?: ReadonlySet<string>): Map<string, Uint8Array> {
  const available = new Map([...TEMPLATE_SOURCE.files, TEMPLATE_BOSS].map(file => [file.hash, file]));
  const selected = hashes === undefined ? TEMPLATE_SOURCE.files : [...hashes].map(hash => available.get(hash));
  if (selected.some(file => file === undefined)) throw new Error('Unknown Template fixture asset');
  return new Map(selected.map(file => {
    if (file === undefined) throw new Error('Unknown Template fixture asset');
    return [file.hash,
    new Uint8Array(generated.get(file.hash) ?? fs.readFileSync(resolve(import.meta.dirname, '../../src/shards/_template/assets', file.hash)))];}));
}
