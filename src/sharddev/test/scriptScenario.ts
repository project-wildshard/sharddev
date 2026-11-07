import { SCRIPT_V1_COMMANDS as commands, SCRIPT_V1_EVENTS as events, SCRIPT_V1_LAYOUT as layout, SCRIPT_V1_LISTS as lists, SCRIPT_V1_READS as reads, type ScriptV1Command, type ScriptV1Event, type ScriptV1EventName } from '@wildshard/format/scriptAbiV1';
import type { DecisionBinding, DecisionCommit, DecisionContext, DecisionHost, DecisionHostOptions, DecisionIdKind, DecisionScript, DecisionSnapshot, DecisionTrace, DecisionWorld } from '@wildshard/engine/script/decision';

/** Small declared world, not a second mechanics implementation. Tests explicitly supply completion events. */
export interface ScenarioActor {
  id: number; at: readonly [number, number, number]; yaw?: number; hpShare?: number; alive?: boolean;
  fields?: Readonly<Record<number, number>>; fieldBounds?: Readonly<Record<number, { min: number; max: number; integer?: boolean }>>; moving?: boolean; strikeState?: number; spawn?: number;
}
export interface ScenarioWorldInput {
  actors?: readonly ScenarioActor[]; players?: readonly ScenarioActor[];
  spawnGroups?: readonly { id: number; members: readonly number[] }[];
  flags?: Readonly<Record<number, boolean>>; playerFlags?: Readonly<Record<number, Readonly<Record<number, boolean>>>>;
  zones?: readonly { id: number; min: readonly [number, number, number]; max: readonly [number, number, number] }[];
  /** Explicit answers for physics/navigation queries; missing fixtures refuse instead of inventing terrain. */
  lists?: readonly { op: number; a: number; b: number; result: readonly number[] }[];
}
/** Only the actual DecisionHost constructor implements this port; the harness never interprets Wasm. */
export type ScenarioHostConstructor = new(options: DecisionHostOptions) => DecisionHost;
export interface ScriptScenarioInput extends ScenarioWorldInput {
  script: DecisionScript; binding: DecisionBinding; bytes: Uint8Array; seed: number;
  bindings?: readonly DecisionBinding[];
}
export interface ScenarioSnapshot { host: DecisionSnapshot; world: ScenarioWorldInput }
export type ScenarioCommand = readonly (string | number)[];
/** Disk fixtures name actor aliases or real platform ids; numeric handles must already be registered. */
export interface DiskScenarioOptions extends Omit<ScenarioWorldInput, 'actors'> {
  seed: number;
  /** Published output root, defaulting to out/ in the caller's working directory. */
  products?: string;
  /** Explicit read-only product directory, including a verified immutable cache entry.
   * Mutually exclusive with products; normal product admission still checks every byte. */
  productDirectory?: string;
  actors?: readonly (Omit<ScenarioActor, 'id' | 'fieldBounds'> & { id: string | number })[];
}
export type DiskScriptScenario = ScriptScenario & { readonly product: {
  readonly slug: string; readonly script: string; readonly sectionHash: string; readonly indexHash: string;
} };
/** Load a published format-2 product and run its declared Wasm on the real DecisionHost.
 * Missing output refuses: the harness never builds, compiles, or imports author/runtime modules. */
export async function scenario(slug: string, id: string, options: DiskScenarioOptions): Promise<DiskScriptScenario> {
  const { readDiskScriptScenario } = await import('./diskScriptScenario');
  return readDiskScriptScenario(slug, id, options);
}
function finite(values: readonly number[]): void { if (!values.every(Number.isFinite)) throw new Error('Non-finite scenario value'); }
function actorCopy(actor: ScenarioActor): ScenarioActor {
  for (const [key, bound] of Object.entries(actor.fieldBounds ?? {})) {
    finite([bound.min, bound.max]); const value = actor.fields?.[Number(key)];
    if (bound.min > bound.max || value === undefined || value < bound.min || value > bound.max || (bound.integer === true && !Number.isInteger(value))) throw new Error('Invalid scenario field bounds');
  }
  return { ...actor, at: [...actor.at], fields: { ...actor.fields }, fieldBounds: structuredClone(actor.fieldBounds ?? {}) };
}

/** Deterministic read-only query adapter. Commands are recorded by the host; it owns validation and timers/RNG. */
export class ScenarioWorld implements DecisionWorld {
  private actors = new Map<number, ScenarioActor>();
  private players = new Set<number>();
  private input: ScenarioWorldInput;
  constructor(input: ScenarioWorldInput = {}) { this.input = {}; this.restore(input); }
  private actor(id: number): ScenarioActor {
    const actor = this.actors.get(id); if (actor === undefined) throw new Error(`Unknown scenario actor ${id}`); return actor;
  }
  private inside(actor: ScenarioActor, zoneId: number): boolean {
    const zone = this.input.zones?.find(value => value.id === zoneId);
    if (zone === undefined) throw new Error(`Unknown scenario zone ${zoneId}`);
    return actor.at.every((value, index) => value >= (zone.min[index] ?? 0) && value <= (zone.max[index] ?? 0));
  }
  private nearby(actor: number, radius: number): ScenarioActor[] {
    const origin = this.actor(actor).at;
    return [...this.players].map(id => this.actor(id)).filter(value => value.alive !== false)
      .map(value => ({ actor: value, distance: Math.hypot(value.at[0] - origin[0], value.at[2] - origin[2]) }))
      .filter(value => value.distance <= radius).sort((a, b) => a.distance - b.distance || a.actor.id - b.actor.id).map(value => value.actor);
  }
  read(op: number, a: number, b: number, _context: DecisionContext): number {
    finite([a, b]);
    if (op === reads.flag) return this.input.flags?.[a] === true ? 1 : 0;
    if (op === reads.playerFlag) { if (!this.players.has(a)) throw new Error('Unknown scenario player'); return this.input.playerFlags?.[a]?.[b] === true ? 1 : 0; }
    if (op === reads.nearestPlayer) return this.nearby(a, Number.POSITIVE_INFINITY)[0]?.id ?? 0;
    if (op === reads.playersInZone) return [...this.players].filter(id => this.actor(id).alive !== false && this.inside(this.actor(id), a)).length;
    if (op === reads.spawnGroupAlive) {
      const group = this.input.spawnGroups?.find(value => value.id === a);
      return group === undefined ? [...this.actors.values()].filter(actor => actor.spawn === a && actor.alive !== false).length
        : group.members.filter(id => { const actor = this.actors.get(id); return actor !== undefined && actor.alive !== false; }).length;
    }
    if (op === reads.distance || op === reads.bearing) {
      const from = this.actor(a).at, to = this.actor(b).at;
      return op === reads.distance ? Math.hypot(to[0] - from[0], to[2] - from[2]) : Math.atan2(to[0] - from[0], to[2] - from[2]);
    }
    if (op === reads.actorInZone) return this.inside(this.actor(a), b) ? 1 : 0;
    if (op === reads.field) {
      const value = this.actor(a).fields?.[b]; if (value === undefined) throw new Error('Missing scenario field'); return value;
    }
    if (op === reads.x) return this.actor(a).at[0];
    if (op === reads.y) return this.actor(a).at[1];
    if (op === reads.z) return this.actor(a).at[2];
    if (op === reads.yaw) return this.actor(a).yaw ?? 0;
    if (op === reads.hpShare) return this.actor(a).hpShare ?? 1;
    if (op === reads.alive) return this.actor(a).alive === false ? 0 : 1;
    if (op === reads.moving) return this.actor(a).moving === true ? 1 : 0;
    if (op === reads.strikeState) return this.actor(a).strikeState ?? 0;
    throw new Error(`Unanswered scenario read ${op}; timers and random belong to DecisionHost`);
  }
  list(op: number, a: number, b: number, output: Float64Array, _context: DecisionContext): number {
    finite([a, b]);
    let values: readonly number[];
    if (op === lists.playersWithin) {
      if (b < 0) throw new Error('Negative scenario radius'); values = this.nearby(a, b).map(actor => actor.id);
    } else if (op === lists.actorsInZone) values = [...this.actors.values()].filter(actor => this.inside(actor, a)).map(actor => actor.id).sort((x, y) => x - y);
    else {
      const answer = this.input.lists?.find(value => value.op === op && value.a === a && value.b === b);
      if (answer === undefined) throw new Error(`Missing scenario list ${op}`); values = answer.result;
    }
    const count = Math.min(values.length, output.length); output.set(values.slice(0, count)); return count;
  }
  prepare(batch: readonly ScriptV1Command[], _context: DecisionContext): DecisionCommit {
    // The host validates capabilities/known handles/quotas; the world knows actual actor kinds and ownership.
    const player = (id: number): boolean => this.players.has(id) && _context.observed.has(id);
    const owned = (id: number): ScenarioActor => {
      if (!_context.binding.actors.includes(id) || this.players.has(id)) throw new Error('Scenario actor ownership refused');
      return this.actor(id);
    };
    for (const [op, target, a, b] of batch) {
      if ([commands.field, commands.move, commands.stop, commands.strike, commands.despawn].some(value => value === op)) {
        const actor = owned(target);
        if (op === commands.field) {
          const bound = actor.fieldBounds?.[a];
          if (actor.fields?.[a] === undefined || !Number.isFinite(b) || (bound !== undefined && (b < bound.min || b > bound.max || (bound.integer === true && !Number.isInteger(b))))) throw new Error('Scenario field declaration or bounds refused');
        }
      }
      if ([commands.grant, commands.reward, commands.flag].some(value => value === op) && target !== 0 && !player(target)) throw new Error('Scenario target is not an observed player');
      if ((op === commands.impulse || (op === commands.cue && target !== 0)) && !player(target)) owned(target);
      if (op === commands.flag && b !== 0 && b !== 1) throw new Error('Scenario flag value refused');
    }
    const copy = batch.map((command): ScriptV1Command => [command[0], command[1], command[2], command[3], command[4]]);
    return { commit: () => {
      for (const [op, target, a, b] of copy) {
        if (op === commands.flag) this.input = target === 0
          ? { ...this.input, flags: { ...this.input.flags, [a]: b === 1 } }
          : { ...this.input, playerFlags: { ...this.input.playerFlags, [target]: { ...this.input.playerFlags?.[target], [a]: b === 1 } } };
        const actor = this.actors.get(target); if (actor === undefined) continue;
        if (op === commands.field) this.actors.set(target, { ...actor, fields: { ...actor.fields, [a]: b } });
        if (op === commands.move || op === commands.stop) this.actors.set(target, { ...actor, moving: op === commands.move });
        if (op === commands.strike) this.actors.set(target, { ...actor, strikeState: 1 });
        if (op === commands.despawn) this.actors.set(target, { ...actor, alive: false });
      }
    } };
  }
  failed(_mode: DecisionScript['onFail'], _context: DecisionContext, _reason: string): void { /* Host metrics/trace retain the refusal; no invented fight reset. */ }
  /** Explicit observation changes, e.g. a completed native move. No mechanics clock is simulated here. */
  setActor(actor: ScenarioActor): void { this.actor(actor.id); finite([...actor.at, actor.yaw ?? 0, actor.hpShare ?? 1, ...Object.values(actor.fields ?? {})]); this.actors.set(actor.id, actorCopy(actor)); }
  snapshot(): ScenarioWorldInput {
    return structuredClone({ ...this.input, actors: [...this.actors.values()].filter(actor => !this.players.has(actor.id)), players: [...this.players].map(id => this.actor(id)) });
  }
  restore(input: ScenarioWorldInput): void {
    const copy = structuredClone({ actors: input.actors ?? [], players: input.players ?? [], spawnGroups: input.spawnGroups ?? [], flags: input.flags ?? {}, playerFlags: input.playerFlags ?? {}, zones: input.zones ?? [], lists: input.lists ?? [] }), actors = new Map<number, ScenarioActor>();
    for (const actor of [...copy.actors, ...copy.players]) {
      if (!Number.isSafeInteger(actor.id) || actor.id <= 0 || actors.has(actor.id)) throw new Error('Invalid or duplicate scenario actor');
      finite([...actor.at, actor.yaw ?? 0, actor.hpShare ?? 1, ...Object.values(actor.fields ?? {})]); actors.set(actor.id, actorCopy(actor));
    }
    for (const zone of copy.zones) { finite([...zone.min, ...zone.max]); if (zone.min.some((value, index) => value > (zone.max[index] ?? 0))) throw new Error('Invalid scenario zone'); }
    for (const list of copy.lists) finite([list.op, list.a, list.b, ...list.result]);
    this.input = copy; this.actors = actors; this.players = new Set(copy.players.map(actor => actor.id));
  }
}

/** Translate validated wire commands back to the script's authored labels for readable expectations. */
export function scenarioCommand(script: DecisionScript, [op, target, a, b, c]: ScriptV1Command): ScenarioCommand {
  const name = (kind: DecisionIdKind, id: number): string => {
    const found = Object.entries(script.ids[kind] ?? {}).find(([, value]) => value === id)?.[0];
    if (found === undefined) throw new Error(`Unknown scenario ${kind} id ${id}`); return found;
  };
  const actor = (id: number): string | number => Object.entries(script.ids.actors ?? {}).find(([, value]) => value === id)?.[0] ?? id;
  if (op === commands.move || op === commands.strike) return [op === commands.move ? 'move' : 'strike', actor(target), name(op === commands.move ? 'moves' : 'strikes', a), ...(b === 0 ? [] : [actor(b)])];
  if (op === commands.stop || op === commands.despawn) return [op === commands.stop ? 'stop' : 'despawn', actor(target)];
  if (op === commands.field) return ['field', actor(target), name('fields', a), b];
  if (op === commands.spawn) return ['spawn', name('spawns', a)];
  if (op === commands.timer) return ['timer', name('timers', a), b];
  if (op === commands.cue) return ['cue', ...(target === 0 ? [] : [actor(target)]), name('cues', a)];
  if (op === commands.flag) return ['flag', name('flags', a), b];
  if (op === commands.signal) return ['signal', name('signals', a), b];
  if (op === commands.channel) return ['channel', name('channels', a), b];
  if (op === commands.grant || op === commands.reward) return [op === commands.grant ? 'grant' : 'reward', actor(target), name(op === commands.grant ? 'facts' : 'rewards', a)];
  if (op === commands.impulse) return ['impulse', actor(target), name('impulses', a)];
  if (op === commands.weather) return ['weather', name('weather', a)];
  if (op === commands.encounter) { const verb = ['phase', 'win', 'fail'][a - 1]; if (verb === undefined) throw new Error('Unknown encounter verb'); return ['encounter', verb, b]; }
  const view = Object.entries(commands).find(([key, value]) => key.startsWith('view.') && value === op)?.[0];
  if (view !== undefined) return [view, target, a, b, c];
  throw new Error(`Unknown scenario command ${op}`);
}

/** Simulation-only driver. Scheduling, RNG, timers, validation, fuel and saves are always the real host's. */
export class ScriptScenario {
  private tick = 0;
  private cursor = 0;
  private saved: ScenarioSnapshot | undefined;
  constructor(readonly host: DecisionHost, readonly world: ScenarioWorld, private readonly script: DecisionScript, private readonly binding: number, private readonly entries: DecisionTrace[],
    private readonly bindings: readonly number[] = [binding]) {}
  private advanceTicks(count: number): void { for (let index = 0; index < count; index++) this.host.step(++this.tick); }
  /** Queue a raw ABI event, then reach its decision and following atomic commit step. */
  sendRaw(event: ScriptV1Event): void {
    this.cursor = this.entries.length;
    for (const binding of event[0] === events.start || event[0] === events.stop ? this.bindings : [this.binding]) this.host.enqueue(binding, event);
    this.advanceTicks(layout.decisionDivisor - this.tick % layout.decisionDivisor + 1);
  }
  /** Named event arguments follow the ABI: subject first, then a/b/c/d. */
  send(event: ScriptV1EventName, ...args: readonly (string | number | boolean)[]): void {
    if (args.length > 5) throw new Error('Too many scenario event arguments');
    const kinds: Partial<Record<ScriptV1EventName, readonly (DecisionIdKind | null)[]>> = {
      timer: ['timers'], 'zone.enter': ['zones', 'actors'], 'zone.leave': ['zones', 'actors'],
      interact: ['spots', 'actors'], hit: ['actors', 'actors'], threshold: ['actors'], death: ['actors', 'actors'],
      'move.done': ['actors', 'moves'], 'strike.done': ['actors', 'strikes'], flag: ['flags'], signal: ['signals'],
      'strike.target': ['targets', 'actors'], 'player.join': ['actors'], 'player.leave': ['actors'], spawned: ['actors', 'spawns'],
    };
    const values = args.map((value, index) => {
      if (typeof value === 'number') { finite([value]); return value; }
      if (typeof value === 'boolean') return value ? 1 : 0;
      const kind = kinds[event]?.[index], id = kind === undefined || kind === null ? undefined : this.script.ids[kind]?.[value];
      if (id === undefined) throw new Error(`Unknown scenario event argument ${value}`); return id;
    });
    this.sendRaw([events[event], values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, values[3] ?? 0, values[4] ?? 0]);
  }
  advance(seconds: number): void {
    const count = seconds * layout.fixedHz;
    if (!Number.isSafeInteger(count) || count < 0 || count > 1_000_000) throw new Error('Scenario time must be bounded whole simulation ticks');
    this.cursor = this.entries.length; this.advanceTicks(count);
  }
  commands(): readonly ScenarioCommand[] {
    return this.entries.slice(this.cursor).flatMap(entry => entry.kind === 'call' && entry.binding === this.binding && entry.ok ? entry.commands.map(command => scenarioCommand(this.script, command)) : []);
  }
  trace(): readonly DecisionTrace[] { return structuredClone(this.entries); }
  state(): Readonly<Record<string, number | boolean>> { return this.host.state(this.binding); }
  maxFuel(): number { const metrics = this.host.metrics().find(value => value.binding === this.binding); if (metrics === undefined || metrics.calls === 0) throw new Error('No scenario calls'); return metrics.maxFuel; }
  save(): ScenarioSnapshot { const saved = { host: this.host.snapshot(), world: this.world.snapshot() }; this.saved = structuredClone(saved); return saved; }
  restore(snapshot: ScenarioSnapshot | undefined = this.saved): void {
    if (snapshot === undefined) throw new Error('No scenario save');
    // Validate fixture data before changing either owner, then let the host validate its complete continuation.
    const world = new ScenarioWorld(snapshot.world), before = this.world.snapshot(); this.world.restore(world.snapshot());
    try { this.host.restore(snapshot.host); } catch (error) { this.world.restore(before); throw error; }
    this.tick = snapshot.host.tick; this.cursor = this.entries.length;
  }
}

/** Core constructor seam for the real KA2 host and built module bytes. No Wasm compiler or alternate host. */
export function createScriptScenario(Host: ScenarioHostConstructor, input: ScriptScenarioInput): ScriptScenario {
  if (!Number.isSafeInteger(input.seed) || input.seed < 0 || input.seed > 0xffffffff) throw new Error('Invalid scenario seed');
  const world = new ScenarioWorld(input), entries: DecisionTrace[] = [];
  const host = new Host({ scripts: [input.script], bindings: input.bindings ?? [input.binding], modules: new Map([[input.script.module, input.bytes]]), seed: [input.seed, 0], world,
    trace: entry => { entries.push(structuredClone(entry)); } });
  return new ScriptScenario(host, world, input.script, input.binding.id, entries, input.bindings?.map(binding => binding.id));
}
