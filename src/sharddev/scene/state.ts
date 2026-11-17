import type { Shardfile } from '@wildshard/format/shardSchema';
import type { compileScript } from '../bake/compileScript';
import { hashImmutableBytes } from '../immutable';
import type { SceneStateWrite, ShardScene } from './description';
import { countMax, SceneRefusalError } from './lower';

/**
 * SHARD-SOURCE SS-GF0: scene state with no script of the author's. A use prompt's `sets` writes a state field and a panel
 * part's `shownWhen` reads one (`world.interact`, `world.part`); this back end writes what an author of Brasscap types by
 * hand for its gate:
 *
 * - **state**: each field once, a flag (`bool`) or a count (`i32`, 0 to its largest `max` or set value), public when
 *   shared and the owner's when a player's, ids from 6001 past any `extend` declares;
 * - **hooks**: a `hooks.scenes` row per use (its id is the prompt's, its event type its own, from 6001); a shared use that
 *   gives no `unless` is spent while its field already holds what it would write (a `<use>.spent` condition), so a lit
 *   shrine's prompt goes; a player's use is never spent here (a page sees no player field an item does not project);
 * - **targets**: a `targets.panels` row per shown panel, shown and solid while the field holds `equals`;
 * - **sim**: one generated ABI v0 server module (`stateModuleSource`, Brasscap `src/sources/gate.as`'s shape: read the
 *   use events, write the fields) compiled with the sdk's pinned AssemblyScript and bound to the player, so it runs once
 *   per player on their own body and a player write is theirs.
 *
 * No format change: these are the sections a data shard declares today.
 */

/** The first state field id and event type the sdk takes (clear of Brasscap's 101 to 302 and the item hooks' 102). */
export const SCENE_STATE_BASE = 6001;
/** The host's player actor and its script handle (`fnv1a32('actor.player') & 0x7fffffff`, engine `numericScriptEntityId`). */
export const PLAYER_ACTOR = 'actor.player', PLAYER_HANDLE = 1106943697;
/** The generated module's memory: one input region, one output region (Brasscap's gate layout), two pages. */
const IN = 16384, IN_CAP = 4096, OUT = 24576, PAGES = 2;
/** A script reads at most this many numeric fields (format `stateRules`, engine `DeclaredScriptWorld`). */
const NUMERIC_FIELDS = 24;

type Field = Shardfile['state']['shared'][number];
/** One declared field the generated module writes: its id, scope, and its slot in the ABI input. */
interface Written { readonly name: string; readonly id: number; readonly scope: 'player' | 'shared'; readonly slot: number }
/** One use the module answers: its event type, its field, and what it writes. */
interface Use { readonly type: number; readonly field: Written; readonly write: SceneStateWrite }

/**
 * `shard` with the scene's state lane, compiled by `compile` (the build's injected `ctx.compileScript`: an author bundle
 * never imports the compiler); `null` when the scene sets nothing (and shows nothing).
 */
export async function withSceneState(shard: Shardfile, scene: ShardScene, compile: typeof compileScript): Promise<{ shard: Shardfile; module: { hash: string; bytes: Uint8Array } } | null> {
  const plan = sceneStatePlan(shard, scene);
  if (plan === null) return null;
  const bytes = await compile(plan.source, { maximumPages: PAGES });
  const hash = hashImmutableBytes(bytes);
  return { shard: plan.apply(hash, bytes), module: { hash, bytes } };
}

/**
 * The pure half: the declared rows and the module's AssemblyScript source; `apply` binds the compiled module. Runs after
 * `extend` and the anchored rows (`withAnchored`), so it numbers past them and refuses a name declared twice.
 */
export function sceneStatePlan(shard: Shardfile, scene: ShardScene): { source: string; apply: (hash: string, bytes: Uint8Array) => Shardfile } | null {
  const writes = scene.anchored.writes ?? [];
  if (writes.length === 0) return null;
  // state: each field once, numbered past what extend declares
  const takenIds = new Set([...shard.state.shared, ...shard.state.player].map((f) => f.id));
  const names = new Set([...shard.state.shared, ...shard.state.player].map((f) => f.name));
  const nextFree = (taken: Set<number>): number => { let id = SCENE_STATE_BASE; while (taken.has(id)) id++; taken.add(id); return id; };
  const declared = new Map<string, { row: Field; scope: 'player' | 'shared' }>();
  for (const write of writes) {
    if (declared.has(write.field)) continue;
    if (names.has(write.field)) throw new SceneRefusalError(write.use, `extend declares state field ${write.field} too`, 'Declare it once: drop the field from extend, or name the scene\'s another');
    const uses = writes.filter((w) => w.field === write.field), id = nextFree(takenIds);
    const privacy = write.scope === 'shared' ? 'public' as const : 'owner' as const;
    declared.set(write.field, { scope: write.scope, row: write.kind === 'bool' ? { id, name: write.field, type: 'bool', privacy, default: false }
      : { id, name: write.field, type: 'i32', privacy, default: 0, min: 0, max: countMax(uses) } });
  }
  const field = (scope: 'player' | 'shared'): Field[] => [...declared.values()].filter((f) => f.scope === scope).map((f) => f.row);
  const state = { ...shard.state, shared: [...shard.state.shared, ...field('shared')], player: [...shard.state.player, ...field('player')] };
  const numeric = (list: readonly Field[]): Field[] => list.filter((f) => f.type !== 'string').sort((a, b) => a.id - b.id);
  const shared = numeric(state.shared), player = numeric(state.player);
  if (shared.length + player.length > NUMERIC_FIELDS) throw new SceneRefusalError(writes[0]?.use ?? 'scene', `the shard declares ${shared.length + player.length} number fields, over the ${NUMERIC_FIELDS} a script reads`, 'Set fewer fields, or share one count between uses');
  // the ABI input: tick, dt, command, entity, token, role, the two counts, then shared and player values by id
  const written = new Map([...declared.values()].map(({ row, scope }) => {
    const slot = scope === 'shared' ? 8 + shared.findIndex((s) => s.id === row.id) : 8 + shared.length + player.findIndex((p) => p.id === row.id);
    return [row.name, { name: row.name, id: row.id, scope, slot }] as const;
  }));
  // hooks: a scene per use, its event type past extend's scenes and item hooks
  const types = new Set([...shard.hooks.scenes.map((s) => s.type), ...shard.items.rows.flatMap((row) => row.hook === null ? [] : [row.hook.event])]);
  const sceneIds = new Set(shard.hooks.scenes.map((s) => s.id)), conditionIds = new Set(shard.hooks.conditions.map((c) => c.id));
  const uses: Use[] = writes.map((write) => {
    if (sceneIds.has(write.use)) throw new SceneRefusalError(write.use, `extend declares scene ${write.use} too`, 'Declare it once: drop the scene from extend, or rename the prompt');
    const target = written.get(write.field); if (target === undefined) throw new Error(`scene: no field ${write.field}`);
    return { type: nextFree(types), field: target, write };
  });
  const scenes = uses.map((use) => ({ id: use.write.use, type: use.type, value: 1 }));
  // a shared use with no `unless` of the author's is spent while its field holds what it would write
  const interactions = shard.targets.interactions.map((row) => {
    const use = uses.find((u) => u.write.use === row.id);
    if (use === undefined || use.field.scope !== 'shared' || row.unless !== undefined) return row;
    return { ...row, unless: `${row.id}.spent` };
  });
  const conditions = uses.flatMap((use) => {
    if (use.field.scope !== 'shared' || interactions.find((row) => row.id === use.write.use)?.unless !== `${use.write.use}.spent`) return [];
    const id = `${use.write.use}.spent`;
    if (conditionIds.has(id)) throw new SceneRefusalError(use.write.use, `extend declares condition ${id} too`, 'Rename the condition in extend');
    return [{ id, scope: 'shared' as const, fieldId: use.field.id, equals: 'value' in use.write ? use.write.value : use.write.add > 0 ? use.write.max : 0 }];
  });
  // targets: a panel row per shown part, its static collider (if it has one) shown with it
  const takenPanels = new Set(shard.targets.panels.map((p) => p.panel));
  const panels = scene.parts.flatMap((part) => {
    if (part.shownWhen === undefined || part.panel === undefined) return [];
    if (takenPanels.has(part.panel)) throw new SceneRefusalError(part.name, `extend shows panel ${part.panel} too`, 'Show it once: drop the row from extend, or the part\'s shownWhen');
    const target = written.get(part.shownWhen.field); if (target === undefined) throw new Error(`scene: no field ${part.shownWhen.field}`);
    const solid = part.colliders.length > 0 && part.touch === undefined && part.move === undefined;
    return [{ panel: part.panel, scope: target.scope, fieldId: target.id, equals: part.shownWhen.equals, visibleWhenMatched: true, colliders: solid ? [part.panel] : [], activeWhenMatched: true }];
  });
  const source = stateModuleSource(uses, written.size);
  return { source, apply: (hash, bytes) => {
    const resident = bytes.length + PAGES * 65536 * 3;
    const file = { hash, kind: 'wasm' as const, compressed: bytes.length, decoded: bytes.length, gpu: 0, triangles: 0, draws: 0, dependencies: [], critical: true };
    return {
      ...shard, state,
      hooks: { conditions: [...shard.hooks.conditions, ...conditions], scenes: [...shard.hooks.scenes, ...scenes] },
      targets: { ...shard.targets, interactions, panels: [...shard.targets.panels, ...panels] },
      sim: { ...shard.sim, scripts: [...shard.sim.scripts, hash], bindings: [...shard.sim.bindings ?? [], { module: hash, entity: PLAYER_HANDLE, actorId: PLAYER_ACTOR, kind: 'server' as const }] },
      files: [...shard.files, file].sort((a, b) => a.hash.localeCompare(b.hash)), critical: [...new Set([...shard.critical, hash])],
      budgets: { ...shard.budgets, sim: { resident: shard.budgets.sim.resident + resident, compressed: shard.budgets.sim.compressed + bytes.length } },
      serverBudget: { ...shard.serverBudget, memory: shard.serverBudget.memory + resident },
    };
  } };
}

/**
 * The generated module: an ABI v0 server script (engine `server/engine/script/lane.ts`). Each tick it reads its queued
 * use events (slot 32 counts them, six numbers each from slot 33, the first the event type), keeps each touched field's
 * value from the input as it changes, and writes each changed field once: op 5 a shared field, op 6 the caller's own.
 */
export function stateModuleSource(uses: readonly Use[], fields: number): string {
  const touched = [...new Map(uses.map((u) => [u.field.name, u.field])).values()];
  const local = (f: Written): number => touched.indexOf(f);
  const num = (n: number): string => `${String(n)}.0`;
  const lines = [
    '// Generated by @wildshard/sdk (SHARD-SOURCE SS-GF0): the scene\'s `sets` prompts as an ABI v0 server script.',
    'export function abi_version(): i32 { return 0; }',
    'export function init(lo: i32, hi: i32): void {}',
    `export function in_ptr(): i32 { return ${String(IN)}; }`,
    `export function in_cap(): i32 { return ${String(IN_CAP)}; }`,
    `export function out_ptr(): i32 { return ${String(OUT)}; }`,
    `export function out_cap(): i32 { return ${String(Math.max(1, fields))}; }`,
    'let count: i32 = 0;',
    'export function out_count(): i32 { return count; }',
    '@inline function put(op: f64, field: f64, value: f64): void {',
    `  const at = ${String(OUT)} + count * 40;`,
    '  store<f64>(at, op); store<f64>(at + 8, field); store<f64>(at + 16, value); store<f64>(at + 24, 0); store<f64>(at + 32, 0);',
    '  count += 1;',
    '}',
    'export function on_tick(): void {',
    '  count = 0;',
    `  const events = i32(load<f64>(${String(IN + 32 * 8)}));`,
    '  if (events <= 0) return;',
    ...touched.flatMap((f) => [`  let v${String(local(f))} = load<f64>(${String(IN + f.slot * 8)});`, `  let w${String(local(f))} = false;`]),
    '  for (let i = 0; i < events; i++) {',
    `    const kind = load<f64>(${String(IN)} + (33 + i * 6) * 8);`,
    ...uses.map((u, i) => {
      const k = String(local(u.field)), head = `    ${i === 0 ? '' : 'else '}if (kind == ${num(u.type)}) {`;
      if ('value' in u.write) return `${head} v${k} = ${num(u.write.value)}; w${k} = true; }`;
      // a count climbs by `add` up to this use's max (never lowering a higher count), or falls by it to 0
      const top = num(u.write.max), add = num(u.write.add);
      return u.write.add > 0 ? `${head} if (v${k} < ${top}) { let n = v${k} + ${add}; if (n > ${top}) n = ${top}; v${k} = n; w${k} = true; } }`
        : `${head} if (v${k} > 0.0) { let n = v${k} + ${add}; if (n < 0.0) n = 0.0; v${k} = n; w${k} = true; } }`;
    }),
    '  }',
    ...touched.map((f) => `  if (w${String(local(f))}) put(${f.scope === 'shared' ? '5.0' : '6.0'}, ${num(f.id)}, v${String(local(f))});`),
    '}',
    '',
  ];
  return lines.join('\n');
}
