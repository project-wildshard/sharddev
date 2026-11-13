import { emptyShardfile } from '@wildshard/sdk/author';
import { parseShardfile } from '@wildshard/engine/host/shardfile';
import { parseRows } from '@wildshard/sdk/rows';
import { parsePlumbing } from '@wildshard/sdk/plumbing';
import { parseLedgerRules } from '@wildshard/sdk/ledger';
import { parseAudioData } from '@wildshard/sdk/audio';
import { parseQuestData } from '@wildshard/sdk/quests';
import { parseClientScripts } from '@wildshard/sdk/clientScripts';
import door from '../behaviour/door.json' with { type: 'json' };
import hooks from '../behaviour/hooks.json' with { type: 'json' };
import type { BakedProps } from '@wildshard/sdk/bake/props';
import type { inkTerrain } from './terrain';
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
import edge from '../data/edge.post.json' with { type: 'json' };

/** Pure template declarations (data/rows.json); SF16 binds these through the normal shardfile loader. */
const INK_ROWS = parseRows(rows);
/** The template's creature looks (SF16): the SF9c exported grey blob and boar, drawn by `platform.skin` and animated from
 *  the creature's state (`platform.clips`); `scripts/bake/template-skins.mjs` writes `skins.json` and the files. */
const INK_SKIN_LOOKS = skins.map((entry) => ({ id: entry.look, species: entry.species, recipe: 'platform.skin', material: null,
  parameters: { skin: entry.skin }, animation: { recipe: 'platform.clips', parameters: { attackSpan: 1 } } }));
const INK_SKIN_FILES = skins.flatMap((entry) => entry.files), INK_SKIN_LIBRARY = skins.map((entry) => entry.skin);
const INK_SKIN_COST = INK_SKIN_FILES.reduce((sum, file) => ({ resident: sum.resident + file.decoded + file.gpu, compressed: sum.compressed + file.compressed }), { resident: 0, compressed: 0 });
/** The idle client module (compileScript(idle.as, {maximumPages: 2})): its hash, size and presentation guest reserve. */
const CLIENT_IDLE_HASH = clientScripts.module.hash, CLIENT_IDLE_BYTES = clientScripts.module.bytes;
const CLIENT_IDLE_RESIDENT = CLIENT_IDLE_BYTES + 3 * 2 * 65536 + 6 * 88;
const INK_CLIENT_SCRIPTS = parseClientScripts({ divisor: clientScripts.divisor, bindings: clientScripts.bindings });
/** GR9 (G783): the valley's declaration from this build's baked terrain and props (bake.ts inkWorld); the manifest
 *  supplies only picker metadata. */
export function inkProduct(terrain: Omit<ReturnType<typeof inkTerrain>, 'assets'>, props: BakedProps): ReturnType<typeof parseShardfile> {
  /** Baseline HUD slots, labels and bag text, and the door's panel, item actions and interaction point. */
  const INK_UI = [
    { kind: 'marker', id: 'ink.door-pin', label: text.hut, at: terrain.sites.door },
    { kind: 'counter', id: 'ink.oil', label: text.oil, band: 'band.3', order: 20, min: 0, max: 1, field: 'ink.lantern.oil' },
    { kind: 'relabel', id: 'ink.jump-label', spot: 'jump', label: 'JUMP', icon: null },
    { kind: 'bagPanel', id: 'ink.notes', tab: { id: 'notes', title: text.notes, icon: 'book', order: 50 }, order: 0, paragraphs: [text.note] },
    ...encounters.ui,
  ];
  const INK_TARGETS = { ...targets, interactions: [{ id: 'ink.door.use', at: terrain.sites.door, radius: 3, label: text.door, scene: 'ink.door.toggle' }] };
  const base = emptyShardfile({ slug: 'ink-cel-valley', name: 'Ink & Cel Valley', author: 'Wildshard', revision: 1, seed: 357 });
  const playerHandle = 1106943697; // fnv1a32('actor.player') & 0x7fffffff; admission compares this with the session map.
  const script = { hash: door.hash, kind: 'wasm', compressed: door.compressed, decoded: door.compressed, gpu: 0, triangles: 0, draws: 0, dependencies: [], critical: true };
  const itemModule = '7035c479edde46ee0baf713fce437fe21e7b61967154f36b5f1126708b2bfaa7';
  const itemScript = { ...script, hash: itemModule, compressed: 740, decoded: 740 };
  const clientScript = { ...script, hash: CLIENT_IDLE_HASH, compressed: CLIENT_IDLE_BYTES, decoded: CLIENT_IDLE_BYTES, critical: false };
  const tiles = terrain.tiles.map((tile) => {
    const addition = props.tiles.find((row) => row.lod === tile.lod && row.x === tile.x && row.z === tile.z);
    if (addition === undefined) return tile;
    return { ...tile, files: [...tile.files, ...addition.files],
      bounds: { min: tile.bounds.min.map((value, axis) => Math.min(value, addition.bounds.min[axis] ?? value)), max: tile.bounds.max.map((value, axis) => Math.max(value, addition.bounds.max[axis] ?? value)) },
      compressed: tile.compressed + addition.compressed, decoded: tile.decoded + addition.decoded, gpu: tile.gpu + addition.gpu, triangles: tile.triangles + addition.triangles, draws: tile.draws + addition.draws };
  });
  // The terrain's draw rows, written out at the platform's defaults: its tiles cast (inside the shadow disc) and receive
  // shadows, and the residency re-centres after the viewer moves 5 m. A ground that wants neither shadow, or a coarser
  // follow, changes these numbers.
  const TERRAIN_DRAW = { shadow: { cast: true, receive: true }, follow: 5 } as const;
  // This declaration is the live source; the manifest supplies only picker metadata.
  return parseShardfile({ ...base, accent: 'ember',
    budgets: { library: { resident: 100_000 + INK_SKIN_COST.resident + CLIENT_IDLE_RESIDENT + 2_633_280, compressed: 100_000 + CLIENT_IDLE_BYTES + INK_SKIN_COST.compressed }, sim: { resident: 16_000_000, compressed: 2_000_000 }, overlap: 0 },
    serverBudget: { ...base.serverBudget, tickMicros: 5_000, memory: 16_000_000 },
    look: { ...look, materials: { ...look.materials, rock: { ...look.materials.rock, graph: rock } }, post: [{ graph: edge }] }, spawn, rows: { ...INK_ROWS, looks: INK_SKIN_LOOKS }, plumbing: parsePlumbing(plumbing), ui: INK_UI,
    terrain: { ...terrain.terrain, ...TERRAIN_DRAW }, tiles, files: [...terrain.files, ...props.files, ...INK_SKIN_FILES, script, itemScript, clientScript], edge: terrain.edge,
    library: [...props.library, ...INK_SKIN_LIBRARY, CLIENT_IDLE_HASH], far: props.far, props: props.props, items: ITEMS, targets: INK_TARGETS, clientScripts: INK_CLIENT_SCRIPTS,
    critical: [...terrain.critical, door.hash, itemModule], water, creatures, encounters: encounters.encounters,
    quests: parseQuestData(quests), ledger: parseLedgerRules(ledger), audio: parseAudioData(audio), state: hooks.state, hooks: hooks.hooks,
    sim: { ...base.sim, scriptTickDivisor: 1, scripts: [door.hash, itemModule], bindings: [{ module: door.hash, entity: playerHandle, actorId: 'actor.player', kind: 'server' }] },
  });
}
