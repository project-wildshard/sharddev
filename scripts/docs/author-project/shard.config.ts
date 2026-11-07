import script from './data/generated-script.json' with { type: 'json' };
import { emptyShardfile } from '@wildshard/sharddev/author';
import { readScene } from '@wildshard/sharddev/scene';
import { commonsRequirements } from '@wildshard/sharddev/commons';
import { createCatalogue } from '@wildshard/sharddev/commons/catalogue';
import { starterSpearPack } from './generators/spear.ts';
import { buildWorld, disposeWorld } from './generators/world.ts';
import { identity as authoredIdentity } from './data/identity.ts';

/** Build-only catalogue and pinned immutable bytes; importing a pack never installs gameplay. */
export const commons = createCatalogue([starterSpearPack({ credit: 'Wildshard starter spear generator', licence: 'First-party' })]);
const required = commonsRequirements(commons, ['starter-spear/model', 'starter-spear/contacts']);
/** The synth CLI reads the same graph used to derive the product declaration. */
export const scene = buildWorld();
/** Stable authored identity shared by synth, product generation and saves. */
export const identity = authoredIdentity;
const base = emptyShardfile(identity);
const graph = readScene(scene); disposeWorld(scene);
const start = graph.playerStart;
if (start === null) throw new Error('Declare a PlayerStart in the retained generator');
const resident = Object.values(required.commonsCosts).reduce((sum, cost) => sum + cost.decoded + cost.gpu, 0);
const compressed = Object.values(required.commonsWire).reduce((sum, bytes) => sum + bytes, 0);

const moduleResident = script.bytes + 3 * 65536;
const moduleFile = { hash: script.hash, kind: 'wasm', compressed: script.bytes, decoded: script.bytes, gpu: 0, triangles: 0, draws: 0, dependencies: [], critical: true };

const project = {
  ...base, requires: { ...base.requires, ...required },
  budgets: { ...base.budgets, library: { resident, compressed }, sim: { resident: moduleResident, compressed: script.bytes } },
  serverBudget: { ...base.serverBudget, memory: base.serverBudget.memory + moduleResident },
  files: [moduleFile], critical: [script.hash], sim: { ...base.sim, scripts: [script.hash] },
  library: required.commons.map(hash => `commons:${hash}`),
  spawn: start,
  entryways: graph.entries,
  world: { glb: 'assets/world.glb', materials: { Floor: 'pbr' }, colliders: 'mesh' },
};

// oxlint-disable-next-line import/no-default-export -- The public author CLI loads this project entry.
export default project;
