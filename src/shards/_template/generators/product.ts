import TEMPLATE_DIRECTORS from '../data/director.json' with { type: 'json' };
import { emptyShardfile } from '@wildshard/sharddev/author';
import { parseShardfile, type Shardfile } from '@wildshard/engine/host/shardfile';
import type { templateTerrain } from './terrain';
import type { TemplateBehaviour } from './behaviour';
import type { BakedProps } from '@wildshard/sharddev/bake/props';
import hooks from '../behaviour/hooks.json' with { type: 'json' };
import rows from '../data/rows.json' with { type: 'json' };
import { parseRows } from '@wildshard/sharddev/rows';
import TEMPLATE_PLUMBING from '../data/plumbing.json' with { type: 'json' };
import ui from '../data/ui.json' with { type: 'json' };
import text from '../data/text.json' with { type: 'json' };
import TEMPLATE_LOOK from '../data/look.json' with { type: 'json' };
import TEMPLATE_WATER from '../data/water.json' with { type: 'json' };
import CREATURES from '../data/creatures.json' with { type: 'json' };
import ENCOUNTERS from '../data/encounters.json' with { type: 'json' };
import TEMPLATE_QUESTS from '../data/quests.json' with { type: 'json' };
import TEMPLATE_LEDGER from '../data/ledger.json' with { type: 'json' };
import TEMPLATE_AUDIO from '../data/audio.json' with { type: 'json' };
import SPAWN from '../data/spawn.json' with { type: 'json' };
import ITEMS from '../data/items.json' with { type: 'json' };
import targets from '../data/targets.json' with { type: 'json' };
import skins from '../data/skins.json' with { type: 'json' };
import CARD from '../data/card.json' with { type: 'json' };
import idle from '../data/clientScripts.json' with { type: 'json' };

// Skin projections belong to this build-time declaration, with no runtime wrapper.
const TEMPLATE_SKIN_LOOKS = skins.map(entry => ({ id: entry.look, species: entry.species, recipe: 'platform.skin', material: null, parameters: { skin: entry.skin }, animation: { recipe: 'platform.clips', parameters: { attackSpan: 1 } } }));
const TEMPLATE_SKIN_FILES = skins.flatMap(entry => entry.files), TEMPLATE_SKIN_LIBRARY = skins.map(entry => entry.skin);
const TEMPLATE_SKIN_COST = TEMPLATE_SKIN_FILES.reduce((sum, file) => ({ resident: sum.resident + file.decoded + file.gpu, compressed: sum.compressed + file.compressed }), { resident: 0, compressed: 0 });

/** The particle anchors over braziers A, B and C, in `layout.BRAZIERS` order. */
const BRAZIER_FLAMES = ['template.brazier-a.flame', 'template.brazier-b.flame', 'template.brazier-c.flame'];
/** MH-3's share of the resident library budget: braziers B and C's particle pools (2 × 2 emitters × 96 live). Measured on the
 *  build: the compendium sketch check passes at 100 000 and refuses at 75 000. */
const MH3_LIBRARY_RESIDENT = 100_000;
/** MH-4's share: the Warden's ring (12 anchors × 32 live) and core (2 × 64 live) particle pools. Measured on the build:
 *  the sketch check passes at 45 000 and refuses at 30 000; 60 000 leaves a margin. */
const MH4_LIBRARY_RESIDENT = 60_000;
// The idle reserve retains three pairs of Wasm pages and six particle slots.
const TEMPLATE_ROWS = parseRows(rows);
/** Assemble the original authored product from this build's terrain rows. */
export function templateProduct(terrain: Omit<ReturnType<typeof templateTerrain>, 'assets'>, props: BakedProps, behaviour: TemplateBehaviour, boss: { compressed: number }): Shardfile {
const door = behaviour.door, itemModule = behaviour.items.hash;
const CLIENT_IDLE_HASH = behaviour.idle.hash, CLIENT_IDLE_BYTES = behaviour.idle.compressed;
const CLIENT_IDLE_RESIDENT = idle.module.resident - idle.module.bytes + CLIENT_IDLE_BYTES;
const clientScripts = structuredClone(idle.scripts);
for (const binding of clientScripts.bindings) {
  binding.module = CLIENT_IDLE_HASH;
  // MH-2, MH-3: each brazier's fire rises from its bowl (1.6 m over the pad, just under the use point)
  const site = binding.target.kind === 'particles' ? terrain.sites.braziers[BRAZIER_FLAMES.indexOf(binding.target.id)] : undefined;
  if (site !== undefined) binding.target.at = [site[0], site[1] - 0.1, site[2]];
}
// Keep generated door positions and the shared teaching text authoritative.
const TEMPLATE_UI = [{ ...ui.marker, label: text.hut, at: terrain.sites.door }, ui.oil, ui.jump,
  { ...ui.notes, tab: { ...ui.notes.tab, title: text.notes }, paragraphs: [text.note] }, ...ENCOUNTERS.ui];
const TEMPLATE_TARGETS = { ...targets.rows, interactions: [{ ...targets.interaction, at: terrain.sites.door, label: text.door }, ...targets.braziers.map((row, i) => {
  const at = terrain.sites.braziers[i], label = text.braziers[i]; if (at === undefined || label === undefined) throw new Error(`${row.id} needs a pad in layout.BRAZIERS and a label`);
  return { id: row.id, radius: row.radius, scene: row.scene, at, label };
})] };
const base = emptyShardfile({ slug: 'template', name: 'Template shard', author: 'Wildshard', revision: 2, seed: 357 });
const playerHandle = 1106943697; // fnv1a32('actor.player') & 0x7fffffff; admission compares this with the session map.
const script = { hash: door.hash, kind: 'wasm', compressed: door.compressed, decoded: door.compressed, gpu: 0, triangles: 0, draws: 0, dependencies: [], critical: true };
const itemScript = { ...script, hash: itemModule, compressed: behaviour.items.compressed, decoded: behaviour.items.compressed };
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
// Retain the old producer's JSON boundary, including signed-zero normalization.
// oxlint-disable-next-line unicorn/prefer-structured-clone -- JSON wire normalization, not cloning: structuredClone retains forbidden signed zero.
return parseShardfile(JSON.parse(JSON.stringify({ ...base, accent: 'sand', manifest: CARD,
  budgets: { library: { resident: 100_000 + TEMPLATE_SKIN_COST.resident + CLIENT_IDLE_RESIDENT + 2_633_280 + MH3_LIBRARY_RESIDENT + MH4_LIBRARY_RESIDENT, compressed: 100_000 + CLIENT_IDLE_BYTES + TEMPLATE_SKIN_COST.compressed }, sim: { resident: 16_000_000, compressed: 1_000_000 - boss.compressed }, overlap: 0 },
  serverBudget: { ...base.serverBudget, tickMicros: 5_000, memory: 16_000_000 },
  look: TEMPLATE_LOOK, spawn: SPAWN, rows: { ...TEMPLATE_ROWS, looks: TEMPLATE_SKIN_LOOKS }, plumbing: TEMPLATE_PLUMBING, ui: TEMPLATE_UI,
  terrain: { ...terrain.terrain, ...TERRAIN_DRAW }, tiles, files: [...terrain.files, ...props.files, ...TEMPLATE_SKIN_FILES, script, itemScript, clientScript], edge: terrain.edge,
  library: [...props.library, ...TEMPLATE_SKIN_LIBRARY, CLIENT_IDLE_HASH], far: props.far, props: props.props, items: ITEMS, targets: TEMPLATE_TARGETS, clientScripts,
  critical: [...terrain.critical, door.hash, itemModule], water: TEMPLATE_WATER, creatures: CREATURES, encounters: ENCOUNTERS.encounters,
  quests: TEMPLATE_QUESTS, directors: TEMPLATE_DIRECTORS, ledger: TEMPLATE_LEDGER, audio: TEMPLATE_AUDIO, state: hooks.state, hooks: hooks.hooks,
  sim: { ...base.sim, scriptTickDivisor: 1, scripts: [door.hash, itemModule], bindings: [{ module: door.hash, entity: playerHandle, actorId: 'actor.player', kind: 'server' }] },
})));
}
