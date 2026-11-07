import * as v from 'valibot';
import { CLIENT_CHANNEL_LIMITS, NumericPoseSchema, NumericPoseInputSchema, ClientChannelsSchema, parseClientChannelInputs, parseClientChannels, type ClientChannelProgram, type ClientChannelProperty } from '@wildshard/format/clientChannels';

type Node = ClientChannelProgram['nodes'][number];
type Unary = Extract<Node, { a: number }>['op'];
type Binary = Exclude<Extract<Node, { b: number }>['op'], 'hypot3'>;
/** Readable authoring of bounded straight-line visual expressions; build output is ordinary format data. */
export class ClientChannels {
  private readonly nodes: Node[] = [];
  private readonly reads: string[] = [];
  private readonly locals: NonNullable<ClientChannelProgram['locals']> = [];
  private readonly bindings: NonNullable<ClientChannelProgram['bindings']> = [];
  private readonly connectorRows: NonNullable<ClientChannelProgram['connectors']> = [];
  private geometryRow: ClientChannelProgram['geometry'];
  private promptRow: ClientChannelProgram['prompt'];
  private moverId: string | undefined;
  private readonly channels: ClientChannelProgram['channels'] = [];
  private readonly id: string;
  constructor(id: string) { this.id = id; }
  private append(node: Node): number { const at = this.nodes.length; this.nodes.push(node); return at; }
  /** Literal scalar, retained exactly as authored. */
  constant(value: number): number { return this.append({ op: 'constant', value }); }
  /** Continuous presentation time or the caller's original frame interval. */
  clock(value: 'time' | 'delta'): number { return this.append({ op: 'clock', value }); }
  /** Name an explicitly copied numeric observation; there is no state object or write port. */
  read(name: string): number {
    let index = this.reads.indexOf(name); if (index < 0) { index = this.reads.length; this.reads.push(name); }
    return this.append({ op: 'read', index });
  }
  /** Read a private previous-frame scalar, initially a literal or a copied first-frame observation. */
  local(initial: number | { readonly read: string }): number {
    let seed: NonNullable<ClientChannelProgram['locals']>[number]['initial'];
    if (typeof initial === 'number') seed = { op: 'constant', value: initial };
    else {
      let index = this.reads.indexOf(initial.read);
      if (index < 0) { index = this.reads.length; this.reads.push(initial.read); }
      seed = { op: 'read', index };
    }
    const index = this.locals.length, at = this.append({ op: 'local', index });
    this.locals.push({ initial: seed, next: at });
    return at;
  }
  /** Commit a finite node to this private slot after every frame calculation succeeds. */
  retain(local: number, next: number): void {
    const node = this.nodes[local];
    if (node?.op !== 'local') throw new Error('Expected a private client slot');
    const slot = this.locals[node.index];
    if (slot === undefined) throw new Error('Missing private client slot');
    slot.next = next;
  }
  /** One admitted unary arithmetic/trigonometric operation. */
  unary(op: Exclude<Unary, Binary | 'hypot3' | 'sample'>, a: number): number { return this.append({ op, a }); }
  /** One admitted binary arithmetic/trigonometric operation, preserving operand order. */
  binary(op: Binary, a: number, b: number): number { return this.append({ op, a, b }); }
  /** The original three-axis Math.hypot operation, without nested binary rounding. */
  hypot3(a: number, b: number, c: number): number { return this.append({ op: 'hypot3', a, b, c }); }
  /** Sample bounded ordered keys, retaining the original linear or smoothstep arithmetic. */
  sample(a: number, keys: readonly (readonly [number, number])[], interpolation: 'linear' | 'smoothstep'): number {
    return this.append({ op: 'sample', a, keys: keys.map(key => [key[0], key[1]]), interpolation });
  }
  /** Bind a declared fast kernel to private geometry, retaining the caller's original scalar arithmetic. */
  deformTube(row: NonNullable<ClientChannelProgram['geometry']>): void { this.geometryRow = structuredClone(row); }
  /** Declare bounded exact connector poses on borrowed private objects or existing instance slots. */
  connector(row: NonNullable<ClientChannelProgram['connectors']>[number]): void { this.connectorRows.push(structuredClone(row)); }
  /** Declare a normal input prompt; channel evaluation never dispatches its separate trusted action. */
  prompt(row: NonNullable<ClientChannelProgram['prompt']>): void { this.promptRow = structuredClone(row); }
  /** Select already evaluated scalar nodes without a call, loop or side effect. */
  select(test: number, yes: number, no: number): number { return this.append({ op: 'select', test, yes, no }); }
  /** Bind a scalar result to one private visual property. */
  output(property: ClientChannelProperty, value: number): void { this.channels.push({ property, value }); }
  /** Bind a visual channel to a named private scene object; rotations may specify their original Euler order. */
  bind(property: NonNullable<ClientChannelProgram['bindings']>[number]['property'], target: string,
    order?: NonNullable<ClientChannelProgram['bindings']>[number]['order']): void {
    this.bindings.push({ property, target, ...(order === undefined ? {} : { order }) });
  }
  /** Observe a declared mover's copied pose/fields; this source has no additional clock or private recurrence. */
  fromMover(id: string): void { this.moverId = id; }
  /** Validate and detach the authored program. */
  build(): ClientChannelProgram {
    const result = parseClientChannels([{ id: this.id, reads: this.reads, nodes: this.nodes, channels: this.channels, ...(this.geometryRow === undefined ? {} : { geometry: this.geometryRow }), ...(this.connectorRows.length === 0 ? {} : { connectors: this.connectorRows }), ...(this.locals.length === 0 ? {} : { locals: this.locals }), ...(this.bindings.length === 0 ? {} : { bindings: this.bindings }), ...(this.moverId === undefined ? {} : { mover: this.moverId }), ...(this.promptRow === undefined ? {} : { prompt: this.promptRow }) }])[0];
    if (result === undefined) throw new Error('Missing client channel program'); return result;
  }
}

/** One numeric output of a group: a private root's field (`[field]` or `[field, axis]`) and the expression that fills it,
 *  reading owner fields by path (`read(owner, path)` declares the input binding). */
export interface NumericChannelOutput {
  readonly target: string;
  readonly path: readonly [string] | readonly [string, string];
  readonly expr: (b: ClientChannels, read: (owner: string, path: readonly (string | number)[]) => number) => number;
}
const NUMERIC_PROPERTIES: readonly ClientChannelProperty[] = ['x', 'y', 'z', 'yaw', 'pitch', 'roll', 'scaleX', 'scaleY', 'scaleZ', 'value', 'turn', 'visible'];
/** A numeric group's outputs as programs of at most twelve channels each (`<prefix>.<n>`), every read a declared owner
 *  path: build-time authoring for `@wildshard/engine/game/plugin/channelPrograms` (a sky's frame, a weather's look). */
export function numericChannelPrograms(prefix: string, group: string, outputs: readonly NumericChannelOutput[]): ClientChannelProgram[] {
  const programs: ClientChannelProgram[] = [];
  for (let at = 0; at < outputs.length; at += NUMERIC_PROPERTIES.length) {
    const b = new ClientChannels(`${prefix}.${String(programs.length)}`), inputs = new Map<string, { input: string; owner: string; path: (string | number)[] }>();
    const read = (owner: string, path: readonly (string | number)[]): number => {
      const input = [owner, ...path].join('.');
      inputs.set(input, { input, owner, path: [...path] });
      return b.read(input);
    };
    const rows = outputs.slice(at, at + NUMERIC_PROPERTIES.length).map((out, i) => {
      const property = NUMERIC_PROPERTIES[i];
      if (property === undefined) throw new Error('numeric channel property overflow');
      b.output(property, out.expr(b, read));
      return { property, target: out.target, path: [...out.path] };
    });
    const program = parseClientChannels([{ ...b.build(), numeric: { group, outputs: rows, inputs: [...inputs.values()], restoreOnly: [] } }])[0];
    if (program === undefined) throw new Error('Missing numeric channel program');
    programs.push(program);
  }
  return programs;
}

/** Compile creature-only borrowed observations into finite pose inputs. The
 * authoring paths never cross the admitted wire; the original node and read
 * order, numeric names and output arithmetic stay byte-for-byte unchanged. */
export function creaturePoseRows(input: unknown): v.InferOutput<typeof NumericPoseSchema> {
  const source = v.parse(v.looseObject({ programs: ClientChannelsSchema, scalars: NumericPoseSchema.entries.scalars }), input);
  const programs = source.programs.map(program => {
    const numeric = program.numeric;
    if (numeric === undefined) throw new Error('Creature authoring requires numeric inputs');
    const inputs = parseClientChannelInputs(numeric.inputs).map(row => {
      const [first, second] = row.path;
      let value: unknown;
      if (row.owner === 'frame' && row.path.length === 1) value = { kind: 'frame', field: first };
      else if (row.owner === 'frame' && row.path.length === 2 && (first === 'mem' || first === 'dims') && typeof second === 'string')
        value = { kind: 'scalar', record: first === 'mem' ? 'memory' : 'dimensions', name: second };
      else if (row.owner === 'scalars' && row.path.length === 1) value = { kind: 'scalar', record: 'declared', name: first };
      else if (row.owner === 'look' && row.path.length === 1) value = { kind: 'look', axis: first };
      else if ((row.owner.startsWith('joint.') || row.owner.startsWith('read.joint.')) && row.path.length === 2)
        value = { kind: 'joint', joint: row.owner.slice(row.owner.startsWith('read.') ? 11 : 6), transform: first, axis: second };
      else throw new Error(`Unsupported creature input: ${row.owner}`);
      if (typeof value !== 'object' || value === null) throw new Error('Missing creature input');
      return v.parse(NumericPoseInputSchema, { ...value, input: row.input });
    });
    return { ...program, numeric: { ...numeric, inputs } };
  });
  return v.parse(NumericPoseSchema, { ...source, programs });
}

/** The defining channel bounds used by bounded source recipe packers. */
export function clientChannelLimits(): typeof CLIENT_CHANNEL_LIMITS { return CLIENT_CHANNEL_LIMITS; }

/** Offline smoothing and floor observations used to author creature channels. */
export interface CreatureSurfaceFrame {
  smooth: { input: string; output: string; rate: number; initial: number | null }[];
  floor: { field: string; lift: string; death: string; delay: number; rate: number };
  look: [number, number, number];
  group: string;
}
/** Admit the complete ordered frame inputs before compiling channel expressions.
 * Defaults stay caller-owned; this only validates them and the observation-bank
 * ceiling. No animation state or frame owner is constructed. */
export function creatureSurfaceFrame(input: unknown, defaults: unknown, observationPrograms: unknown): CreatureSurfaceFrame {
  const number = v.pipe(v.number(), v.finite());
  const key = v.pipe(v.string(), v.minLength(1), v.maxLength(96),
    v.check(value => !['__proto__', 'prototype', 'constructor'].includes(value)));
  const frame = v.parse(v.object({
    smooth: v.pipe(v.array(v.object({ input: key, output: key, rate: number, initial: v.nullable(number) })), v.maxLength(16)),
    floor: v.object({ field: key, lift: key, death: key, delay: number, rate: number }),
    look: v.tuple([number, number, number]), group: key,
  }), input);
  v.parse(v.record(key, number), defaults);
  v.parse(v.pipe(v.array(v.unknown()), v.maxLength(32)), observationPrograms);
  return frame;
}
