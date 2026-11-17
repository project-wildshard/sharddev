import script from './data/generated-script.json' with { type: 'json' };
import spear from './data/generated-spear.json' with { type: 'json' };
import { parseItems } from '@wildshard/format/items';
import { emptyShardfile } from '@wildshard/sdk/author';
import { readScene } from '@wildshard/sdk/scene';
import { buildWorld, disposeWorld } from './generators/world.ts';
import { identity as authoredIdentity } from './data/identity.ts';

/** The synth CLI reads the same graph used to derive the product declaration. */
export const scene = buildWorld();
/** Stable authored identity shared by synth, product generation and saves. */
export const identity = authoredIdentity;
const base = emptyShardfile(identity);
const graph = readScene(scene); disposeWorld(scene);
const start = graph.playerStart;
if (start === null) throw new Error('Declare a PlayerStart in the retained generator');
const resident = spear.cost.decoded + spear.cost.gpu, compressed = spear.bytes;
const spearFile = { hash: spear.hash, kind: 'glb', compressed: spear.bytes, decoded: spear.cost.decoded, gpu: spear.cost.gpu, triangles: spear.cost.triangles, draws: spear.cost.draws, dependencies: [], critical: false };

const moduleResident = script.bytes + 3 * 65536;
const moduleFile = { hash: script.hash, kind: 'wasm', compressed: script.bytes, decoded: script.bytes, gpu: 0, triangles: 0, draws: 0, dependencies: [], critical: true };

const project = {
  ...base, items: parseItems(spear.items),
  budgets: { ...base.budgets, library: { resident, compressed }, sim: { resident: moduleResident, compressed: script.bytes } },
  serverBudget: { ...base.serverBudget, memory: base.serverBudget.memory + moduleResident },
  files: [moduleFile, spearFile], critical: [script.hash], sim: { ...base.sim, scripts: [script.hash] },
  library: [spear.hash],
  spawn: start,
  entryways: graph.entries,
  world: { glb: 'assets/world.glb', materials: { Floor: 'pbr' }, colliders: 'mesh' },
};

// oxlint-disable-next-line import/no-default-export -- The public author CLI loads this project entry.
export default project;
