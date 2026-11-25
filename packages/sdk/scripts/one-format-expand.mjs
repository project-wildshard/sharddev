import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { outputSectionPayloads } from '@wildshard/format/outputFields';
import { expandCreatureLayers } from '../src/sharddev/creatureLayers.ts';
import { validateOutputProduct, writeOutputProduct } from '../src/sharddev/outputProduct.ts';
const [source, output] = process.argv.slice(2).map(value => resolve(value));
if (!source || !output?.startsWith(resolve('tmp') + sep) || source === output) throw new Error('Oracle output must be separate owned scratch');
mkdirSync(dirname(output), { recursive: true });
const checked = validateOutputProduct(source), warnings = [];
const expanded = expandCreatureLayers(checked.shard, message => warnings.push(message));
const standard = outputSectionPayloads(expanded), files = new Map();
const sections = checked.index.sections.filter(row => !standard.has(row.name));
for (const row of [...sections, ...checked.index.schemas]) files.set(row.path, Uint8Array.from(readFileSync(resolve(source, row.path))));
const platform = { sections, files };
const server = (checked.index.admission.server ?? []).map(file => ({ file, bytes: Uint8Array.from(readFileSync(resolve(source, file.path))) }));
const cookSource = checked.index.cook ? JSON.parse(readFileSync(resolve(source, checked.index.cook.path), 'utf8')) : undefined;
const cook = cookSource ? { mounts: cookSource.mounts.map(row => ({ url: row.url, bytes: Uint8Array.from(readFileSync(resolve(source, row.path))) })),
  ...(checked.index.admission.audioWaiver ? { audioWaiver: checked.index.admission.audioWaiver } : {}) } : undefined;
writeOutputProduct(expanded, checked.assets, output, { platform, server, namedFiles: checked.index.files,
  ...(cook ? { cook } : {}), ...(checked.index.runtime ? { runtime: checked.index.runtime } : {}) });
const after = validateOutputProduct(output);
const digest = path => createHash('sha256').update(readFileSync(resolve(path, 'shard.json'))).digest('hex');
console.log(JSON.stringify({ source, output, before: digest(source), after: digest(output), warnings,
  sourceSpecies: checked.shard.rows.species.length, builtSpecies: after.shard.rows.species.length }));
