// oxlint-disable-next-line import/no-nodejs-modules -- The author-only scenario consumes published disk output.
import { existsSync, realpathSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- A validated output folder stays inside the explicit product root.
import { resolve } from 'node:path';
import { DecisionHost, type DecisionScript } from '@wildshard/engine/script/decision';
import { nativeRuntimeActorIds } from '@wildshard/format/nativeRuntimePlan';
import { buildDecisionRegistries, decisionBindingMap, decisionSpawnGroups } from '@wildshard/format/decisionBindings';
import { parseActorMoves } from '@wildshard/format/actorMoves';
import { readCreatureStrikes } from '@wildshard/format/creatures';
import { parseWorldTargets } from '@wildshard/format/worldTargets';
import { admitScriptContract, decisionScriptsFromSections } from '@wildshard/format/scriptContract';
import { SCRIPT_V1_READS, SCRIPT_V1_LISTS, type ScriptV1ReadName, type ScriptV1ListName } from '@wildshard/format/scriptAbiV1';
import { outputDescriptor } from '@wildshard/engine/game/shardfile/outputDescriptor';
import { loadHeadlessProduct } from '@wildshard/engine/host/headlessProduct';
import { createScriptScenario, type ScenarioActor, type DiskScenarioOptions, type DiskScriptScenario } from './scriptScenario';

/** Disk admission and the game use the same defining catalogue; the fixture never allocates actor ids. */
export async function readDiskScriptScenario(slug: string, id: string, options: DiskScenarioOptions): Promise<DiskScriptScenario> {
  if (!/^_?[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(slug)) throw new Error('Invalid scenario output folder');
  if (options.products !== undefined && options.productDirectory !== undefined) throw new Error('Scenario requires one product location');
  const root = resolve(options.products ?? 'out'), directory = options.productDirectory === undefined ? resolve(root, slug) : resolve(options.productDirectory);
  if (!existsSync(resolve(directory, 'shard.json'))) throw new Error(`Missing published scenario output ${slug}; run wildshard build first`);
  const expected = options.productDirectory === undefined ? resolve(realpathSync(root), slug) : directory;
  if (realpathSync(directory) !== expected) throw new Error('Scenario output cannot be a symlink');
  const product = await loadHeadlessProduct(directory), shard = product.shardfile, descriptor = outputDescriptor(shard);
  if (descriptor === undefined) throw new Error('Missing admitted scenario descriptor');
  const { index, sections } = descriptor;
  const rows = decisionScriptsFromSections(sections);
  const row = rows.find(value => value.id === id), ordinal = rows.findIndex(value => value.id === id);
  if (row === undefined) throw new Error(`Missing simulation scenario script ${id}`);
  const moves = parseActorMoves(sections.get('actors/moves') ?? []), targets = sections.get('world/targets');
  const nativePlan = sections.get('sim/runtime-plan');
  const nativeActors = shard.runtime === null && nativePlan !== undefined ? nativeRuntimeActorIds(nativePlan) : [];
  const registries = buildDecisionRegistries(shard, moves, targets === undefined ? undefined : parseWorldTargets(targets), readCreatureStrikes(sections.get('actors/strikes') ?? []), rows, nativeActors);
  const map = decisionBindingMap(row, registries), handles = Object.values(map.ids.actors ?? {});
  const script: DecisionScript = { ...row, ids: map.ids, state: [...row.state], reads: row.reads.filter((name): name is ScriptV1ReadName => Object.hasOwn(SCRIPT_V1_READS, name)),
    lists: row.reads.filter((name): name is ScriptV1ListName => Object.hasOwn(SCRIPT_V1_LISTS, name)) };
  const file = index.files.find(value => value.kind === 'wasm' && value.path === row.module);
  if (file?.name === undefined) throw new Error('Scenario module requires an admitted logical blob name');
  const bytes = await product.file(file.name);
  admitScriptContract(bytes, { abi: 1, pages: row.pages });
  const binding = row.binding;
  const encounter = 'encounter' in binding ? shard.encounters.find(value => value.id === binding.encounter) : undefined;
  if ('encounter' in binding && encounter === undefined) throw new Error('Missing scenario encounter binding');
  if ('quest' in binding && !shard.quests.quests.some(quest => quest.id === binding.quest)) throw new Error('Missing scenario quest binding');
  if ('zone' in binding && registries.zones?.has(binding.zone) !== true) throw new Error('Missing scenario zone binding');
  const self = encounter === undefined ? ('spawnGroup' in binding ? handles[0] : 0) : registries.actors?.get(encounter.entity);
  if (self === undefined || self > 0 && !handles.includes(self)) throw new Error('Scenario encounter actor is not owned');
  const fields = shard.state.shared.filter(field => field.privacy === 'public' && field.type !== 'string');
  const fieldValues = Object.fromEntries(fields.map(field => [field.id, Number(field.default)]));
  const bounds = Object.fromEntries(fields.map(field => {
    const low = field.type === 'bool' ? 0 : field.type === 'i32' ? -2147483648 : -Number.MAX_VALUE;
    const high = field.type === 'bool' ? 1 : field.type === 'i32' ? 2147483647 : Number.MAX_VALUE;
    return [field.id, { min: Math.max(field.min ?? low, low), max: Math.min(field.max ?? high, high), integer: field.type !== 'f64' }];
  }));
  const overrides = new Map<number, NonNullable<DiskScenarioOptions['actors']>[number]>();
  for (const actor of options.actors ?? []) {
    const alias = typeof actor.id === 'string' && Object.hasOwn(map.ids.actors ?? {}, actor.id) ? map.ids.actors?.[actor.id] : undefined;
    const handle = typeof actor.id === 'number' ? actor.id : alias ?? registries.actors?.get(actor.id);
    if (handle === undefined || ![...registries.actors?.values() ?? []].includes(handle) || overrides.has(handle)) throw new Error('Unknown or duplicate scenario actor override');
    if (Object.keys(actor.fields ?? {}).some(key => !Object.hasOwn(fieldValues, key))) throw new Error('Unknown scenario public field');
    overrides.set(handle, actor);
  }
  const actors: ScenarioActor[] = [];
  for (const handle of new Set([...handles, ...overrides.keys()])) {
    const name = [...registries.actors ?? []].find(([, value]) => value === handle)?.[0], authored = shard.creatures.spawns.find(actor => actor.id === name);
    const override = overrides.get(handle), runtime = shard.runtime?.spawns;
    const retained = [...runtime?.homes ?? [], ...runtime?.bosses ?? [], ...runtime?.actors ?? []].find(actor => actor.id === name);
    if (override === undefined && authored === undefined) throw new Error(`Runtime actor ${name ?? handle} requires explicit scenario XYZ`);
    const at = override?.at ?? authored?.at; if (at === undefined) throw new Error('Missing scenario actor position');
    actors.push({ ...override, id: handle, at, yaw: override?.yaw ?? authored?.yaw ?? retained?.yaw ?? 0,
      fields: { ...fieldValues, ...override?.fields }, fieldBounds: bounds });
  }
  const groups = decisionSpawnGroups(shard, rows);
  const spawnGroups = [...registries.spawns ?? []].map(([name, groupId]) => {
    const members = groups.get(name) ?? [name];
    return { id: groupId, members: members.map(member => { const actor = registries.actors?.get(member); if (actor === undefined) throw new Error('Missing scenario group member'); return actor; }) };
  });
  const bindings = 'spawnGroup' in binding ? handles.map((actor, ordinalIndex) => ({ id: ordinalIndex + 1, script: row.id, self: actor, actors: [actor], instance: 0 }))
    : [{ id: ordinal + 1, script: row.id, self, actors: handles, instance: 0 }];
  const primary = bindings[0]; if (primary === undefined) throw new Error('Empty scenario binding');
  const made = createScriptScenario(DecisionHost, { ...options, actors, spawnGroups, seed: options.seed, script, bytes, binding: primary, bindings });
  const entry = index.sections.find(value => value.name === 'sim/scripts'); if (entry === undefined) throw new Error('Missing scenario section');
  return Object.assign(made, { product: Object.freeze({ slug, script: row.id, sectionHash: entry.hash,
    indexHash: descriptor.indexHash }) });
}
