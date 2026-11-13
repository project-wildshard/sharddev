import { emptyShardfile } from '@wildshard/sdk/author';
import { parseShardfile, type Shardfile } from '@wildshard/format/shardSchema';
import { parseRows } from '@wildshard/sdk/rows';
import { parsePlumbing } from '@wildshard/sdk/plumbing';
import { parseLedgerRules } from '@wildshard/sdk/ledger';
import { parseAudioData } from '@wildshard/sdk/audio';
import { parseQuestData } from '@wildshard/sdk/quests';
import { parseClientScripts } from '@wildshard/sdk/clientScripts';
import hooks from '../behaviour/hooks.json' with { type: 'json' };
import rows from '../data/rows.json' with { type: 'json' };
import plumbing from '../data/plumbing.json' with { type: 'json' };
import water from '../data/water.json' with { type: 'json' };
import creatures from '../data/creatures.json' with { type: 'json' };
import encounters from '../data/encounters.json' with { type: 'json' };
import quests from '../data/quests.json' with { type: 'json' };
import ledger from '../data/ledger.json' with { type: 'json' };
import audio from '../data/audio.json' with { type: 'json' };
import spawn from '../data/spawn.json' with { type: 'json' };
import text from '../data/text.json' with { type: 'json' };
import clientScripts from '../data/clientScripts.json' with { type: 'json' };
import targets from '../data/targets.json' with { type: 'json' };
import skins from '../data/skins.json' with { type: 'json' };
import ITEMS from '../data/items.json' with { type: 'json' };
import look from '../data/look.json' with { type: 'json' };
import rock from '../data/rock.graph.json' with { type: 'json' };
import type { BakedProps } from '@wildshard/sdk/bake/props';
import type { pastelTerrain } from './terrain';
import type { PastelBehaviour } from './behaviour';

/** Pure template declarations (data/rows.json); SF16 binds these through the normal shardfile loader. */
const PASTEL_ROWS = parseRows(rows);
/** The template's creature looks (SF16): the SF9c exported grey blob and boar, drawn by `platform.skin` and animated from
 *  the creature's state (`platform.clips`); `scripts/bake/template-skins.mjs` writes `skins.json` and the files. */
const PASTEL_SKIN_LOOKS = skins.map((entry) => ({ id: entry.look, species: entry.species, recipe: 'platform.skin', material: null,
  parameters: { skin: entry.skin }, animation: { recipe: 'platform.clips', parameters: { attackSpan: 1 } } }));
const PASTEL_SKIN_FILES = skins.flatMap((entry) => entry.files), PASTEL_SKIN_LIBRARY = skins.map((entry) => entry.skin);
const PASTEL_SKIN_COST = PASTEL_SKIN_FILES.reduce((sum, file) => ({ resident: sum.resident + file.decoded + file.gpu, compressed: sum.compressed + file.compressed }), { resident: 0, compressed: 0 });
/** Assemble the original declaration from this invocation's producer rows and compiled bytes. */
export function pastelProduct(terrain: Omit<ReturnType<typeof pastelTerrain>, 'assets'>, props: BakedProps, behaviour: PastelBehaviour): Shardfile {
const door = behaviour.door;
/** The idle client module retains its original presentation guest reserve. */
const CLIENT_IDLE_HASH = behaviour.idle.hash, CLIENT_IDLE_BYTES = behaviour.idle.compressed;
const CLIENT_IDLE_RESIDENT = CLIENT_IDLE_BYTES + 3 * 2 * 65536 + 6 * 88;
const PASTEL_CLIENT_SCRIPTS = parseClientScripts({ divisor: clientScripts.divisor, bindings: structuredClone(clientScripts.bindings) });
for (const binding of PASTEL_CLIENT_SCRIPTS.bindings) binding.module = CLIENT_IDLE_HASH;
/** Baseline HUD slots, labels and bag text, and the door's panel, item actions and interaction point. */
const PASTEL_UI = [
  { kind: 'marker', id: 'pastel.door-pin', label: text.hut, at: terrain.sites.door },
  { kind: 'counter', id: 'pastel.oil', label: text.oil, band: 'band.3', order: 20, min: 0, max: 1, field: 'pastel.lantern.oil' },
  { kind: 'relabel', id: 'pastel.jump-label', spot: 'jump', label: 'JUMP', icon: null },
  { kind: 'bagPanel', id: 'pastel.notes', tab: { id: 'notes', title: text.notes, icon: 'book', order: 50 }, order: 0, paragraphs: [text.note] },
  ...encounters.ui,
];
const PASTEL_TARGETS = { ...targets, interactions: [{ id: 'pastel.door.use', at: terrain.sites.door, radius: 3, label: text.door, scene: 'pastel.door.toggle' }] };
const base = emptyShardfile({ slug: 'pastel-plain', name: 'Pastel Plain', author: 'Wildshard', revision: 1, seed: 357 });
const playerHandle = 1106943697; // fnv1a32('actor.player') & 0x7fffffff; admission compares this with the session map.
const script = { hash: door.hash, kind: 'wasm', compressed: door.compressed, decoded: door.compressed, gpu: 0, triangles: 0, draws: 0, dependencies: [], critical: true };
const itemModule = behaviour.items.hash;
const itemScript = { ...script, hash: itemModule, compressed: behaviour.items.compressed, decoded: behaviour.items.compressed };
const clientScript = { ...script, hash: CLIENT_IDLE_HASH, compressed: CLIENT_IDLE_BYTES, decoded: CLIENT_IDLE_BYTES, critical: false };
const tiles = terrain.tiles.map((tile) => {
  const addition = props.tiles.find((row) => row.lod === tile.lod && row.x === tile.x && row.z === tile.z);
  if (addition === undefined) return tile;
  return { ...tile, files: [...tile.files, ...addition.files],
    bounds: { min: tile.bounds.min.map((value, axis) => Math.min(value, addition.bounds.min[axis] ?? value)), max: tile.bounds.max.map((value, axis) => Math.max(value, addition.bounds.max[axis] ?? value)) },
    compressed: tile.compressed + addition.compressed, decoded: tile.decoded + addition.decoded, gpu: tile.gpu + addition.gpu, triangles: tile.triangles + addition.triangles, draws: tile.draws + addition.draws };
});
// This declaration is the live source; the manifest supplies only picker metadata.
// oxlint-disable-next-line unicorn/prefer-structured-clone -- Preserve the former JSON producer's signed-zero normalization.
return parseShardfile(JSON.parse(JSON.stringify({ ...base, accent: 'lime',
  budgets: { library: { resident: 100_000 + PASTEL_SKIN_COST.resident + CLIENT_IDLE_RESIDENT + 2_633_280, compressed: 100_000 + CLIENT_IDLE_BYTES + PASTEL_SKIN_COST.compressed }, sim: { resident: 16_000_000, compressed: 2_000_000 }, overlap: 0 },
  serverBudget: { ...base.serverBudget, tickMicros: 5_000, memory: 16_000_000 },
  look: { ...look, materials: { ...look.materials, rock: { ...look.materials.rock, graph: rock } } }, spawn, rows: { ...PASTEL_ROWS, looks: PASTEL_SKIN_LOOKS }, plumbing: parsePlumbing(plumbing), ui: PASTEL_UI,
  terrain: terrain.terrain, tiles, files: [...terrain.files, ...props.files, ...PASTEL_SKIN_FILES, script, itemScript, clientScript], edge: terrain.edge,
  library: [...props.library, ...PASTEL_SKIN_LIBRARY, CLIENT_IDLE_HASH], far: props.far, props: props.props, items: ITEMS, targets: PASTEL_TARGETS, clientScripts: PASTEL_CLIENT_SCRIPTS,
  critical: [...terrain.critical, door.hash, itemModule], water, creatures, encounters: encounters.encounters,
  quests: parseQuestData(quests), ledger: parseLedgerRules(ledger), audio: parseAudioData(audio), state: hooks.state, hooks: hooks.hooks,
  sim: { ...base.sim, scriptTickDivisor: 1, scripts: [door.hash, itemModule], bindings: [{ module: door.hash, entity: playerHandle, actorId: 'actor.player', kind: 'server' }] },
})));
}
