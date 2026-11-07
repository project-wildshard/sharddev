// oxlint-disable-next-line import/no-nodejs-modules -- The author build reads the shard's folder and public/.
import { existsSync, readFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- The author build reads the shard's folder and public/.
import { resolve } from 'node:path';
import * as v from 'valibot';

/** C0 (J137): what a product carries so it stands alone. The list is the shard's `mounts.json`, per output
 *  (`scripts/record-shard-mounts.mjs`); the bytes stay in `public/` until the shard's own repo holds them (P5). */
export interface CookInput {
  readonly mounts: readonly {readonly url: string; readonly bytes: Uint8Array}[];
  readonly packs?: 'fence';
  readonly fence?: readonly string[];
}

const MountsSchema = v.strictObject({version: v.literal(1), outputs: v.record(v.string(), v.array(v.string()))});
const FenceReadsSchema = v.strictObject({version: v.literal(1), files: v.array(v.string())});
const PacksSetSchema = v.strictObject({version: v.literal(1), set: v.literal('fence')});

/** Read a project's cook input for one output, or nothing for a project with none. D5: the fence and packs lists are
 *  optional author data; a listed mount missing from `public/` refuses, because that file is what the shard stands on. */
export function readCookInput(project: string, slug: string): CookInput | undefined {
  const json = (name: string): unknown => { const file = resolve(project, name); return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined; };
  const list = json('mounts.json'), fence = json('fence-reads.json'), packs = json('packs-set.json');
  const urls = list === undefined ? [] : v.parse(MountsSchema, list).outputs[slug] ?? [];
  const publicRoot = resolve(project, '../../../public');
  const mounts = urls.map(url => ({url, bytes: readFileSync(resolve(publicRoot, url.slice(1)))}));
  const set = packs === undefined ? undefined : v.parse(PacksSetSchema, packs).set;
  if (mounts.length === 0 && fence === undefined && set === undefined) return undefined;
  return {mounts, ...(set === undefined ? {} : {packs: set}), ...(fence === undefined ? {} : {fence: v.parse(FenceReadsSchema, fence).files})};
}
