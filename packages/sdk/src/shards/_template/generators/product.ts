import TEMPLATE_DIRECTORS from '../data/director.json' with { type: 'json' };
import { parseShardfile, type Shardfile } from '@wildshard/format/shardSchema';
import type { TemplateBehaviour } from './behaviour';
import hooks from '../behaviour/hooks.json' with { type: 'json' };
import { TEMPLATE_RAW_ROWS as rows } from './rows';
import { parseRows } from '@wildshard/sdk/rows';
import TEMPLATE_PLUMBING from '../data/plumbing.json' with { type: 'json' };
import ui from '../data/ui.json' with { type: 'json' };
import text from '../data/text.json' with { type: 'json' };
import TEMPLATE_LOOK from '../data/look.json' with { type: 'json' };
import TEMPLATE_WATER from '../data/water.json' with { type: 'json' };
import CREATURES from '../data/creatures.json' with { type: 'json' };
import ENCOUNTERS from '../data/encounters.json' with { type: 'json' };
import QUESTS from '../data/quests.json' with { type: 'json' };
import hermit from '../data/npcs/hermit.json' with { type: 'json' };
import TEMPLATE_LEDGER from '../data/ledger.json' with { type: 'json' };
import TEMPLATE_AUDIO from '../data/audio.json' with { type: 'json' };
import SPAWN from '../data/spawn.json' with { type: 'json' };
import ITEMS from '../data/items.json' with { type: 'json' };
import targets from '../data/targets.json' with { type: 'json' };
import skins from '../data/skins.json' with { type: 'json' };
import CARD from '../data/card.json' with { type: 'json' };
import { IDLE_RESERVE, templateClientScripts } from './clientScripts';
import { liftMover } from './lift';
import { templateHeightAt, templateSites } from './landscape';
import { HIDDEN_PANELS } from './scene';

// Skin projections belong to this build-time declaration, with no runtime wrapper.
const TEMPLATE_SKIN_LOOKS = skins.map(entry => ({ id: entry.look, species: entry.species, recipe: 'platform.skin', material: null, parameters: { skin: entry.skin }, animation: { recipe: 'platform.clips', parameters: { attackSpan: 1 } } }));
// a species may wear another's skin (the mossling wears the grey blob's): its entry lists no files, and the library names each skin once
// one file per NPC (J361): data/npcs/<name>.json holds its dialogue and its talk target
const NPCS = [hermit.npc];
const TEMPLATE_QUESTS = { ...QUESTS, dialogue: [...QUESTS.dialogue, ...NPCS.map(npc => npc.dialogue)] };
const TEMPLATE_SKIN_FILES = skins.flatMap(entry => entry.files), TEMPLATE_SKIN_LIBRARY = [...new Set(skins.map(entry => entry.skin))];
const TEMPLATE_SKIN_COST = TEMPLATE_SKIN_FILES.reduce((sum, file) => ({ resident: sum.resident + file.decoded + file.gpu, compressed: sum.compressed + file.compressed }), { resident: 0, compressed: 0 });

/** MH-3's share of the resident library budget: braziers B and C's particle pools (2 × 2 emitters × 96 live). Measured on the
 *  build: the compendium sketch check passes at 100 000 and refuses at 75 000. */
const MH3_LIBRARY_RESIDENT = 100_000;
/** MH-4's share: the Warden's ring (12 anchors × 32 live) and core (2 × 64 live) particle pools. Measured on the build:
 *  the sketch check passes at 45 000 and refuses at 30 000; 60 000 leaves a margin. */
const MH4_LIBRARY_RESIDENT = 60_000;
/** The compendium's sketch rasters' resident share (format asset admission adds them to the library's): 2 633 280, the
 *  number the old budget carried bare. */
const COMPENDIUM_SKETCHES = 2_633_280;
const TEMPLATE_ROWS = parseRows({ ...rows, looks: TEMPLATE_SKIN_LOOKS });
/** The places the gameplay rows stand: the hut door, the braziers' pads and the NPCs' and props' prompts (landscape.ts). */
type Sites = ReturnType<typeof templateSites>;
/** The gameplay rows: their scripts and files, the UI, targets and talks at their sites. */
function templateGameplay(sites: Sites, behaviour: TemplateBehaviour, boss: { compressed: number }) {
  const door = behaviour.door, itemModule = behaviour.items.hash;
  const CLIENT_IDLE_HASH = behaviour.idle.hash, CLIENT_IDLE_BYTES = behaviour.idle.compressed;
  const CLIENT_IDLE_RESIDENT = IDLE_RESERVE + CLIENT_IDLE_BYTES, clientScripts = templateClientScripts(CLIENT_IDLE_HASH, sites.braziers);
  // Keep generated door positions and the shared teaching text authoritative.
  const TEMPLATE_UI = [{ ...ui.marker, label: text.hut, at: sites.door }, ui.oil, ui.jump,
    { ...ui.notes, tab: { ...ui.notes.tab, title: text.notes }, paragraphs: [text.note] }, ...ENCOUNTERS.ui];
  const TEMPLATE_TARGETS = { ...targets.rows, interactions: [{ ...targets.interaction, at: sites.door, label: text.door }, ...targets.braziers.map((row, i) => {
    const at = sites.braziers[i], label = text.braziers[i]; if (at === undefined || label === undefined) throw new Error(`${row.id} needs a pad in layout.BRAZIERS and a label`);
    return { id: row.id, radius: row.radius, scene: row.scene, unless: row.unless, at, label };
  }), { ...targets.chest, at: sites.chest, label: text.chest }, { ...targets.rack, at: sites.rack, label: text.rack },
    { ...targets.lever, at: sites.lever, label: text.lever }],
    // MH-5: the Lamplighter (TE-ENG3's `targets.talks`), on the ground east of the spawn-to-hut path; the engine draws its stand-in
    talks: [{ ...targets.talk, at: sites.lamplighter }, { ...hermit.npc.talk, at: sites.hermit }] };
  const playerHandle = 1106943697; // fnv1a32('actor.player') & 0x7fffffff; admission compares this with the session map.
  const script = { hash: door.hash, kind: 'wasm', compressed: door.compressed, decoded: door.compressed, gpu: 0, triangles: 0, draws: 0, dependencies: [], critical: true };
  const itemScript = { ...script, hash: itemModule, compressed: behaviour.items.compressed, decoded: behaviour.items.compressed };
  const clientScript = { ...script, hash: CLIENT_IDLE_HASH, compressed: CLIENT_IDLE_BYTES, decoded: CLIENT_IDLE_BYTES, critical: false };
  const sim = { resident: 16_000_000, compressed: 1_000_000 - boss.compressed };
  return { files: [...TEMPLATE_SKIN_FILES, script, itemScript, clientScript], library: [...TEMPLATE_SKIN_LIBRARY, CLIENT_IDLE_HASH], critical: [door.hash, itemModule],
    library_cost: { resident: TEMPLATE_SKIN_COST.resident + CLIENT_IDLE_RESIDENT, compressed: CLIENT_IDLE_BYTES + TEMPLATE_SKIN_COST.compressed }, simBudget: sim,
    rows: { accent: 'sand', manifest: CARD, rows: TEMPLATE_ROWS, plumbing: TEMPLATE_PLUMBING, ui: TEMPLATE_UI, items: ITEMS, targets: TEMPLATE_TARGETS, clientScripts,
      // TC-M4b: the lift (lift.ts), stepped by the server and drawn as its panel
      movers: [liftMover(templateHeightAt())],
      water: TEMPLATE_WATER, creatures: CREATURES, encounters: ENCOUNTERS.encounters,
      quests: TEMPLATE_QUESTS, directors: TEMPLATE_DIRECTORS, ledger: TEMPLATE_LEDGER, audio: TEMPLATE_AUDIO, state: hooks.state, hooks: hooks.hooks },
    sim: (base: Shardfile['sim']) => ({ ...base, scriptTickDivisor: 1, scripts: [door.hash, itemModule], bindings: [{ module: door.hash, entity: playerHandle, actorId: 'actor.player', kind: 'server' }] }) };
}
/**
 * SHARD-SOURCE AP36a2: the Template's rows over its scene source's shardfile (shard.config.ts's `extend`). The scene writes
 * the ground, tiles, panels and their files; this adds the gameplay, the scripts, the look (the ground draws in its `pbr`
 * entry, as before), the water, the hidden panels' start, the held lantern's model and the authored colliders.
 */
export function templateRows(scene: Shardfile, behaviour: TemplateBehaviour, boss: { compressed: number }, colliders: NonNullable<Shardfile['props']>['colliders']): Shardfile {
  const { props, terrain } = scene;
  if (props === null || terrain === null) throw new Error('template: the scene wrote no props or terrain');
  const play = templateGameplay(templateSites(templateHeightAt()), behaviour, boss), lantern = props.panels.find((panel) => panel.id === 'template.lantern');
  if (lantern === undefined) throw new Error('template: the scene has no lantern panel');
  const panels = props.panels.filter((panel) => panel !== lantern).map((panel) => HIDDEN_PANELS.has(panel.id) ? { id: panel.id, file: panel.file, visible: false } : panel);
  const families = [...new Set([...TEMPLATE_LOOK.families, ...scene.look.families])];
  const materials = Object.fromEntries(Object.entries(scene.look.materials).filter(([id]) => id !== terrain.family));
  const library = scene.budgets.library;
  // oxlint-disable-next-line unicorn/prefer-structured-clone -- JSON wire normalization, not cloning: structuredClone retains forbidden signed zero.
  return parseShardfile(JSON.parse(JSON.stringify({ ...scene, ...play.rows,
    // the scene's files, the skins and the idle script, plus the particle pools' share (MH-3, MH-4), the sketches and the old 100 000 margin
    budgets: { ...scene.budgets, library: { resident: 100_000 + library.resident + play.library_cost.resident + MH3_LIBRARY_RESIDENT + MH4_LIBRARY_RESIDENT + COMPENDIUM_SKETCHES, compressed: 100_000 + library.compressed + play.library_cost.compressed }, sim: play.simBudget },
    serverBudget: { ...scene.serverBudget, tickMicros: 5_000, memory: 16_000_000 },
    look: { ...TEMPLATE_LOOK, families, materials: { ...materials, ...TEMPLATE_LOOK.materials } }, spawn: SPAWN,
    terrain: { ...terrain, family: 'pbr' }, files: [...scene.files, ...play.files], library: [...scene.library, ...play.library],
    props: { ...props, panels, models: [{ id: lantern.id, file: lantern.file }], colliders },
    critical: [...scene.critical, ...play.critical], sim: play.sim(scene.sim),
  })));
}
