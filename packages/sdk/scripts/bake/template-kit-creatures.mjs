import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { installFormatHook } from '@wildshard/format/formatHook';

installFormatHook();

const { commonCreature } = await import('@wildshard/kit/creatures');
const { default: catalogue } = await import('@wildshard/kit/content/animated/catalogue.json', { with: { type: 'json' } });
const { parseSkinFile } = await import('@wildshard/format/skinAssets');
const { parseRows } = await import('@wildshard/format/rows');

const root = fileURLToPath(new URL('../..', import.meta.url));
// Pastel keeps two-space JSON (TEMPLATE-E2E TR-11 retired the Template, whose data json.mjs wrote compact).
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
// SHARD-SOURCE AP36b: a project may keep its rows section as one file per row kind under data/rows/; pastel keeps data/rows.json.
const split = project => existsSync(resolve(project, 'data/rows'));
const readRows = project => split(project)
  ? Object.fromEntries(['strikes', 'weather', 'days', 'species', 'looks', 'compendiums', 'loot'].map(key => [key, JSON.parse(readFileSync(resolve(project, `data/rows/${key}.json`), 'utf8'))]))
  : JSON.parse(readFileSync(resolve(project, 'data/rows.json'), 'utf8'));
const rowFiles = (project, source) => split(project)
  ? readdirSync(resolve(project, 'data/rows')).map(file => [resolve(project, 'data/rows', file), json(source[file.replace(/\.json$/u, '')])])
  : [[resolve(project, 'data/rows.json'), json(source)]];

/** Regenerate only Pastel Plain's kit boar (the Template retired, TEMPLATE-E2E TR-11); every authored gameplay override remains. */
export function templateKitCreatures(check = false) {
  const asset = catalogue.find(row => row.kind === 'boar' && row.family === 'toon' && row.variant === 'boar');
  if (asset === undefined) throw new Error('Missing shipped kit boar');
  const glb = readFileSync(fileURLToPath(import.meta.resolve(`@wildshard/kit/content/animated/${asset.glb}`)));
  const skin = readFileSync(fileURLToPath(import.meta.resolve(`@wildshard/kit/content/animated/${asset.skin}`)));
  if (hash(glb) !== asset.glbHash || hash(skin) !== asset.skinHash) throw new Error('Shipped kit boar bytes differ');
  const { row } = parseSkinFile(skin);
  const put = (path, bytes) => {
    if (check) { if (!Buffer.from(bytes).equals(readFileSync(path))) throw new Error(`Stale kit creature output: ${path}`); }
    else writeFileSync(path, bytes);
  };
  for (const name of ['pastel-plain']) {
    const project = resolve(root, 'src/shards', name);
    const source = readRows(project);
    const skins = JSON.parse(readFileSync(resolve(project, 'data/skins.json'), 'utf8'));
    const creatures = JSON.parse(readFileSync(resolve(project, 'data/creatures.json'), 'utf8'));
    const original = source.species.find(value => value.id === 'boar'), look = skins.find(value => value.species === 'boar');
    if (original === undefined || look === undefined) throw new Error(`${name} has no declared boar`);
    const owners = new Set(creatures.spawns.filter(spawn => spawn.species === original.id).map(spawn => spawn.brain));
    const [owner] = owners;
    const brain = owners.size > 1 || owner === undefined || owner === null || creatures.groups?.some(group => group.id === owner) ? 'none' : owner;
    const preset = commonCreature('boar', { id: original.id, look: look.look, strike: 'boar.charge' }).species;
    const temperament = { ...preset.temperament, brain }; delete temperament.tuning;
    // the kit preset's harvest is the kit's drops; a shard whose boar declares none keeps it without one
    const next = { ...preset, ...original, body: preset.body, temperament,
      senses: original.senses ?? preset.senses, abilities: original.abilities ?? preset.abilities,
      presentation: original.presentation ?? preset.presentation };
    if (original.harvest === undefined) delete next.harvest;
    source.species = source.species.map(value => value.id === original.id ? next : value);
    // The Warden's declared decision controller owns its body; it has no species-wide brain.
    source.species = source.species.map(value => value.id === 'barrow-warden' && value.temperament === undefined ? {
      ...value, temperament: { brain: 'none', reaction: 'aggressive', leash: 0, assist: 0, home: { speed: 0, stop: 0 } },
    } : value);
    // The existing source uses one skin for all seven variants, including the authored Greyback override.
    // Retain that declaration; the general producer emits variant tables for multi-skin species.
    const files = [
      { hash: asset.skinHash, kind: 'json', compressed: skin.length, decoded: skin.length * 2, gpu: 0, triangles: 0, draws: 0, dependencies: [asset.glbHash], critical: false },
      { hash: asset.glbHash, kind: 'glb', compressed: glb.length, ...row.cost, dependencies: [], critical: false },
    ];
    const entry = { ...look, skin: asset.skinHash, glb: asset.glbHash, files,
      kit: '@wildshard/kit/content/animated/boar/toon/boar.glb' };
    const output = skins.map(value => value.species === original.id ? entry : value);
    // The decision compiler reads these actor rows before product assembly joins the full look table.
    const declaration = { id: look.look, species: original.id, recipe: 'platform.skin', material: null,
      parameters: { skin: asset.skinHash }, animation: { recipe: 'platform.clips', parameters: { attackSpan: 1 } } };
    source.looks = [...source.looks.filter(value => value.id !== declaration.id), declaration];
    parseRows({ ...source, looks: output.map(value => ({ id: value.look, species: value.species, recipe: 'platform.skin', material: null,
      parameters: { skin: value.skin }, animation: { recipe: 'platform.clips', parameters: { attackSpan: 1 } } })) });
    put(resolve(project, 'assets', asset.glbHash), glb); put(resolve(project, 'assets', asset.skinHash), skin);
    for (const [path, bytes] of rowFiles(project, source)) put(path, bytes);
    put(resolve(project, 'data/skins.json'), json(output, project));
  }
  console.log(`Pastel kit boar ${check ? 'checked' : 'written'}: ${asset.glbHash.slice(0, 12)}`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) templateKitCreatures(process.argv.includes('--check'));
