// G292: native witness recorders use the shared generation cache, with their original TypeScript tapes and outcomes.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as v from 'valibot';
import { runNativeRecorder } from '@wildshard/engine/scripts/native-recorder-cache.mjs';
import { cachedWitnessManifest, compareWitnessManifests } from './witness-checkpoints.mjs';

const Payloads = v.record(v.string(), v.pipe(v.string(), v.regex(/^[0-9a-f]{64}$/u)));
const Header = v.object({ cache: v.object({ payloads: Payloads }) });

/** Play a retained native recorder into the shared cache; all consumers read that verified output directory.
 * During migration a legacy manifest is decorated from its still-committed payloads. Those files remain until CI
 * proves the cold cache path. Only explicit recording writes the small manifest back to the repository.
 * @param {{root:URL,slug:string,inputs:string,files:Iterable<string>,manifest:URL,
 * select:(directory:URL)=>void,generate:()=>Promise<unknown>,record?:boolean,forceCompare?:boolean,compare?:boolean}} spec
 * @returns {Promise<{directory:string,key:string,hit:boolean,hashes:Record<string,string>,manifest:string}>} */
export async function generateWitness(spec) {
  const root = fileURLToPath(spec.root), source = fileURLToPath(spec.manifest);
  const committed = readFileSync(source, 'utf8');
  const parsed = v.safeParse(Header, JSON.parse(committed));
  const expected = parsed.success ? committed : cachedWitnessManifest(dirname(source));
  const outputs = [...Object.keys(v.parse(Header, JSON.parse(expected)).cache.payloads), 'manifest.json'].sort();
  const inputs = Object.fromEntries([...new Set(spec.files)].sort().map(url => {
    if (!url.startsWith(spec.root.href)) throw new Error('Witness input is outside its repository');
    return [decodeURIComponent(url.slice(spec.root.href.length)), createHash('sha256').update(readFileSync(new URL(url))).digest('hex')];
  }));
  const result = await runNativeRecorder(root, {
    id: `witness-${spec.slug}`, inputs, outputs, platform: 'native',
    command: ['node', '--experimental-transform-types', '--import', './scripts/sim-node-loader.mjs', `test/proof/${spec.slug}/run.mjs`, 'checkpoints'],
  }, {
    ...(spec.forceCompare === undefined ? {} : { forceCompare: spec.forceCompare }),
    generate: async directory => {
      spec.select(pathToFileURL(`${resolve(directory)}/`));
      await spec.generate();
      writeFileSync(resolve(directory, 'manifest.json'), cachedWitnessManifest(directory));
    },
  });
  const manifest = readFileSync(resolve(result.directory, 'manifest.json'), 'utf8');
  if (spec.compare !== false) compareWitnessManifests(expected, manifest);
  spec.select(pathToFileURL(`${resolve(result.directory)}/`));
  if (spec.record === true) writeFileSync(source, manifest);
  return { directory: result.directory, key: result.key, hit: result.hit, hashes: result.hashes, manifest };
}
