import { Color, DoubleSide, FrontSide, MeshStandardMaterial, MeshToonMaterial, SRGBColorSpace, Vector2, Vector3, Vector4, type ColorRepresentation } from 'three';
import { AttributeNode, ConditionalNode, ConstNode, ConvertNode, JoinNode, MathNode, Node, OperatorNode, SplitNode, SubBuildNode, UniformNode, VaryingNode, VarNode } from 'three/webgpu';
import {
  cameraPosition, dot, frontFacing, normalLocal, normalView, normalWorld, normalWorldGeometry, positionGeometry, positionLocal, positionView, positionViewDirection,
  positionWorld, screenCoordinate, screenUV, smoothstep, step, time,
} from 'three/tsl';
import { GRAPH_PRESET_VERSION, parseFamilyMaterial, type PainterlyMaterialParams, type ToonMaterialParams } from '@wildshard/format/materialFamilies';
import { validateGraph, type GraphBudget, type GraphIr, type GraphLiteral, type GraphNode, type GraphParam, type GraphRef, type GraphStages, type GraphValueType } from '@wildshard/format/materialGraph';
import type { MaterialEntry } from '@wildshard/format/materials';

/**
 * `@wildshard/sdk/materials` (DS1.4): the authoring materials a generator puts on its three.js meshes, and the TSL → graph
 * compiler. Each class is an ordinary three.js material (so a generator previews in any three.js renderer) that also
 * knows the shardfile catalogue entry it bakes to (`toMaterialEntry()`); `readScene` writes that entry into the scene
 * description, so a material never becomes shader code (G306).
 *
 * - `ToonMaterial extends MeshToonMaterial`: the `toon` family (flat-shaded, vertex-coloured facets). With `bands` or
 *   `rim` set it bakes to a cel graph instead (N hard bands, a sun-coloured rim), built with `graph()` below.
 * - `PainterlyMaterial extends MeshStandardMaterial`: the `painterly` family (soft cel bands, painted shade, rim, sway).
 * - `GraphMaterial extends MeshStandardMaterial`: carries one validated material graph (`family: "graph"`).
 * - `graph(spec)`: compiles TSL node trees (`three/tsl`) placed in the graph stages into SF59 graph IR
 *   (`@wildshard/format/materialGraph`), validated under the author caps. Only the approved vocabulary converts; a TSL
 *   node with no graph op (a `Fn`, `uniform()`, a code node, a texture not declared through `sample`) is refused with
 *   its class name. Graph-only inputs (the sun, irradiance, the lit colour, noise, the post taps) are the exports below.
 *   A trusted shard's own programs also have `atan(y, x)`, `mod`, `varying(node)`, `attribute('aName', type)`,
 *   `screenCoordinate` (the `fragCoord` input) and `surface.discard`; a code-fed uniform is an unbound `param()`.
 */

/** A value a graph stage or op input takes: a TSL node, or a literal number / 2–4 number vector. */
export type GraphValue = Node | number | readonly number[];

/** What a graph-only op node carries (side table: the node itself is a plain TSL `Node` of the op's type). */
interface GraphOpInfo {
  readonly graphOp: string;
  readonly args: readonly GraphValue[];
  readonly paramName: string | undefined;
  readonly paramDef: GraphParam | undefined;
}
const graphOps = new WeakMap<object, GraphOpInfo>();
function op<T extends GraphValueType>(graphOp: string, type: T, args: readonly GraphValue[] = [], paramName?: string, paramDef?: GraphParam): Node<T> {
  const node = new Node<T>(type);
  graphOps.set(node, { graphOp, args, paramName, paramDef });
  return node;
}
function isVar(node: Node): node is VarNode<unknown, Node> { return node instanceof VarNode; }
function unwrap(node: Node): Node {
  let current = node;
  while (isVar(current)) current = current.node;
  return current;
}

/** The TSL node type a param stands for (a colour is a vec3; a texture is read with `sample`). */
export type ParamNodeType<P extends GraphParam['type']> = P extends 'colour' ? 'vec3' : P extends 'texture' ? 'vec4' : P;
/**
 * A typed graph param (a uniform the graph reads): `param('bands', { type: 'float', value: 3, min: 1, max: 8 })`. The
 * definition is the format's `GraphParam` as written (a colour in sRGB, an optional day / state `bind`); the returned
 * TSL node stands for it in expressions. A texture param is read with `sample(param, uv)`.
 */
export function param<const P extends GraphParam>(name: string, def: P): Node<ParamNodeType<P['type']>> {
  const type = (def.type === 'colour' ? 'vec3' : def.type === 'texture' ? 'vec4' : def.type) as ParamNodeType<P['type']>;
  return op('param', type, [], name, def);
}
/** Sample a texture param at a uv (base mip in vertex stages, derivative-selected mip in fragments). */
export function sample(texture: Node, at: GraphValue): Node<'vec4'> {
  const info = graphOps.get(unwrap(texture));
  if (info?.paramDef?.type !== 'texture') throw new Error('sample() reads a texture param()');
  return op('texture', 'vec4', [at], info.paramName, info.paramDef);
}
/** Sample an existing lent 2D texture array at UV and nearest integer layer; no texture is repacked. */
export function sampleArray(texture: Node, at: GraphValue, layer: GraphValue): Node<'vec4'> {
  const info = graphOps.get(unwrap(texture));
  if (info?.paramDef?.type !== 'texture' || info.paramDef.role !== 'lent') throw new Error('sampleArray() reads a lent texture param()');
  return op('textureArray', 'vec4', [at, layer], info.paramName, info.paramDef);
}
/** The original mesh material's colour map at its own UV, or white RGBA when unmapped. */
export const meshMap: Node<"vec4"> = op('meshMap', 'vec4');

/** MaterialX noise over a position (`noise`, about 40 instructions). */
export function noise(at: GraphValue): Node<'float'> { return op('noise', 'float', [at]); }
/** A view-space direction as a unit world one (`viewToWorld`). */
export function viewToWorld(direction: GraphValue): Node<'vec3'> { return op('viewToWorld', 'vec3', [direction]); }
/** Diffuse sky irradiance (× π) along a nonzero world direction, normalized by the compiler.
 * Ambient lighting only; follows the live scene environment, rotation and intensity, or black without an environment.
 * Reading this makes the ambient stage own the whole indirect term, like graphInputs.environmentIrradiance. */
export function environmentIrradianceAt(direction: GraphValue): Node<'vec3'> { return op('environmentIrradianceAt', 'vec3', [direction]); }
/** A world direction into the model space `vertex.offset` is added in (`worldToLocal`). */
export function worldToLocal(direction: GraphValue): Node<'vec3'> { return op('worldToLocal', 'vec3', [direction]); }
/** Apply the full instance matrix to a homogeneous vector in the vertex stage (identity on ordinary meshes).
 * w=1 places a point; w=0 rotates/scales a direction. Apply placement ONCE: positionLocal already includes instancing.
 * For vertex.position, transform vec4(positionGeometry, 1), not positionLocal. */
export function instanceTransform(value: GraphValue): Node<'vec4'> { return op('instanceTransform', 'vec4', [value]); }

/** The engine's gust front at world xz; reads the existing wind clock and gust owner. */
export function windGustAt(at: GraphValue): Node<'float'> { return op('windGustAt', 'float', [at]); }

/** Smooth upward wave normal at a REST xz point, using the CPU ocean's shared coefficients. */
export function gerstnerNormal(at: GraphValue, clock: GraphValue, damping: GraphValue): Node<'vec3'> {
  return op('gerstnerNormal', 'vec3', [at, clock, damping]);
}

/** The scene depth (linear metres) at a uv, or at the pixel (a post tap, `sceneDepth`). */
export function sceneDepth(at?: GraphValue): Node<'float'> { return op('sceneDepth', 'float', at === undefined ? [] : [at]); }
/** The scene's view-space normal at a uv, or at the pixel (a post tap, `sceneNormal`). */
export function sceneNormal(at?: GraphValue): Node<'vec3'> { return op('sceneNormal', 'vec3', at === undefined ? [] : [at]); }

/** The lighting stage's inputs and the other graph-only inputs, as TSL nodes (each maps to one graph input op). */
export const graphInputs: {
/** toward the light (the `sun` sub-graph only) */
/** true for a front-facing fragment; vertex stages refuse this input */
readonly frontFacing: Node<"bool">;
/** shared wind clock (seconds), current gust, and prevailing xz direction */
readonly windTime: Node<"float">; readonly windGust: Node<"float">; readonly windDirection: Node<"vec2">;
/** Live fog sun direction/linear colour, from the existing atmosphere owner. */
readonly atmosphereSunDirection: Node<"vec3">; readonly atmosphereSunColour: Node<"vec3">;
/** Scene fog colour; black without fog. */
readonly fogColour: Node<"vec3">;
/** Active material/page FogModel.node colour-ramp zenith; scene fog colour if no ramp, black without fog. */
readonly fogZenithColour: Node<"vec3">; readonly sunDirection: Node<"vec3">;
/** the light's colour × intensity, unshadowed (the `sun` sub-graph only) */
readonly sunColour: Node<"vec3">;
/** 1 lit … 0 in cast shadow (the `sun` sub-graph only) */
readonly sunShadow: Node<"float">;
/** the surface colour × (1 − metalness) (the lighting stage) */
readonly albedo: Node<"vec3">;
/** the indirect irradiance (the `ambient` sub-graph only) */
readonly irradiance: Node<"vec3">;
/** the environment's prefiltered radiance along the reflected view ray (the `ambient` sub-graph only; reading it or
 *  `environmentIrradiance` makes `ambient` the whole indirect term) */
readonly radiance: Node<"vec3">;
/** the environment's irradiance (× π) for the shading normal (the `ambient` sub-graph only) */
readonly environmentIrradiance: Node<"vec3">;
/** the lit colour, emissive included (the `grade` sub-graph only) */
readonly litColour: Node<"vec3">;
/** a per-instance hash in [0, 1) */
readonly instanceHash: Node<"float">;
/** the world position of the object's (or instance's) origin (vertex places) */
readonly objectOrigin: Node<"vec3">;
/** the geometry's `color` attribute (rgb, linear; white where it has none) */
readonly vertexColour: Node<"vec3">;
/** Original geometry colour alpha; 1 for RGB colour attributes or no colour attribute. */
readonly vertexColourAlpha: Node<"float">;
/** The material's own colour (linear), read live: a per-material tint a runtime sets (a creature's per-animal coat). */
readonly materialColour: Node<"vec3">;
/** The material's emissive × emissiveIntensity (linear), read live: the hit-flash port a runtime drives. */
readonly materialEmissive: Node<"vec3">;
/** Camera-space vertex position after skinning/instancing; forward is negative Z. */
readonly positionView: Node<"vec3">;
/** Toward the first visible scene directional light (shadow casters first), world space; zero when absent. */
readonly skyLightDirection: Node<"vec3">;
/** Its linear colour multiplied by intensity; excludes shadowing and atmosphere fog colour. */
readonly skyLightColour: Node<"vec3">;
/** the scene colour at the pixel (a post input) */
readonly sceneColour: Node<"vec4">; } = {
  /** toward the light (the `sun` sub-graph only) */
  /** true for a front-facing fragment; vertex stages refuse this input */
  frontFacing: op('frontFacing', 'bool'),
  /** shared wind clock (seconds), current gust, and prevailing xz direction */
  windTime: op('windTime', 'float'), windGust: op('windGust', 'float'), windDirection: op('windDirection', 'vec2'),
  /** Live fog sun direction/linear colour, from the existing atmosphere owner. */
  atmosphereSunDirection: op('atmosphereSunDirection', 'vec3'), atmosphereSunColour: op('atmosphereSunColour', 'vec3'),
  /** Scene fog colour; black without fog. */
  fogColour: op('fogColour', 'vec3'),
  /** Active material/page FogModel.node colour-ramp zenith; scene fog colour if no ramp, black without fog. */
  fogZenithColour: op('fogZenithColour', 'vec3'),
  sunDirection: op('sunDirection', 'vec3'),
  /** the light's colour × intensity, unshadowed (the `sun` sub-graph only) */
  sunColour: op('sunColour', 'vec3'),
  /** 1 lit … 0 in cast shadow (the `sun` sub-graph only) */
  sunShadow: op('sunShadow', 'float'),
  /** the surface colour × (1 − metalness) (the lighting stage) */
  albedo: op('albedo', 'vec3'),
  /** the indirect irradiance (the `ambient` sub-graph only) */
  irradiance: op('irradiance', 'vec3'),
  /** the environment's prefiltered radiance along the reflected view ray (the `ambient` sub-graph only; reading it or
   *  `environmentIrradiance` makes `ambient` the whole indirect term) */
  radiance: op('radiance', 'vec3'),
  /** the environment's irradiance (× π) for the shading normal (the `ambient` sub-graph only) */
  environmentIrradiance: op('environmentIrradiance', 'vec3'),
  /** the lit colour, emissive included (the `grade` sub-graph only) */
  litColour: op('litColour', 'vec3'),
  /** a per-instance hash in [0, 1) */
  instanceHash: op('instanceHash', 'float'),
  /** the world position of the object's (or instance's) origin (vertex places) */
  objectOrigin: op('objectOrigin', 'vec3'),
  /** the geometry's `color` attribute (rgb, linear; white where it has none) */
  vertexColour: op('vertexColour', 'vec3'),
  /** Original geometry colour alpha; 1 for RGB colour attributes or no colour attribute. */
  vertexColourAlpha: op('vertexColourAlpha', 'float'),
  /** The material's own colour (linear), read live: a per-material tint a runtime sets (a creature's per-animal coat). */
  materialColour: op('materialColour', 'vec3'),
  /** The material's emissive × emissiveIntensity (linear), read live: the hit-flash port a runtime drives. */
  materialEmissive: op('materialEmissive', 'vec3'),
  /** Camera-space vertex position after skinning/instancing; forward is negative Z. */
  positionView: op('positionView', 'vec3'),
  /** Toward the first visible scene directional light (shadow casters first), world space; zero when absent. */
  skyLightDirection: op('skyLightDirection', 'vec3'),
  /** Its linear colour multiplied by intensity; excludes shadowing and atmosphere fog colour. */
  skyLightColour: op('skyLightColour', 'vec3'),
  /** the scene colour at the pixel (a post input) */
  sceneColour: op('sceneColour', 'vec4'),
} as const;

/** TSL built-ins that are graph inputs as they are (matched by identity; `uv()` by its attribute). */
const BUILTINS = new Map<Node, string>([
  [positionLocal, 'positionLocal'], [positionGeometry, 'positionGeometry'], [positionWorld, 'positionWorld'], [positionView, 'positionView'],
  [normalLocal, 'normalLocal'], [normalWorld, 'normalWorld'], [normalWorldGeometry, 'normalWorld'], [normalView, 'normalView'],
  [positionViewDirection, 'viewDirection'], [cameraPosition, 'cameraPosition'], [time, 'time'], [screenUV, 'screenUV'],
  [screenCoordinate, 'fragCoord'], [frontFacing, 'frontFacing'],
]);
const OPERATORS: Readonly<Record<string, string>> = { '+': 'add', '-': 'sub', '*': 'mul', '/': 'div', '%': 'mod', '<': 'lt', '<=': 'lte', '>': 'gt', '>=': 'gte', '==': 'eq', '&&': 'and', '||': 'or', '!': 'not' };
const METHODS = new Set(['abs', 'floor', 'fract', 'sin', 'cos', 'exp', 'atan', 'mod', 'negate', 'oneMinus', 'fwidth', 'normalize', 'length', 'dot', 'mix', 'min', 'max', 'pow', 'step', 'smoothstep', 'clamp']);
const SWIZZLE: Readonly<Record<string, string>> = { r: 'x', g: 'y', b: 'z', a: 'w', s: 'x', t: 'y', p: 'z', q: 'w', x: 'x', y: 'y', z: 'z', w: 'w' };

/** What `graph()` compiles: TSL values in the graph's stages, plus the graph's own switches. */
export interface GraphSpec {
  /** Optional geometry channels: numeric literals matching each attribute's type; omitted channels use these constants. */
  readonly attributeDefaults?: Readonly<Record<string, GraphLiteral>>;
  /** Validated author declaration; only an admitted host may grant this budget at runtime. */
  readonly budget?: GraphBudget;
  /** a material (the default) or a post pass (`post` only) */
  readonly kind?: 'material' | 'post';
  /** Toon borrows the runtime catalogue's live family bands, cloud clock and caustics. */
  readonly model?: 'standard' | 'unlit' | 'toon';
  readonly doubleSided?: boolean;
  /** false: borrowed normal maps keep the front-face basis on back faces; culling is unchanged. */
  readonly flipBackfaceNormals?: boolean;
  /** false: omit underwater caustics on this toon material, leaving its shared look unchanged. */
  readonly toonCaustics?: boolean;
  readonly flatShading?: boolean;
  /** shadow:true reuses displacement and alpha/discard in the shadow camera. */
  readonly vertex?: { readonly offset: GraphValue; readonly shadow?: boolean };
  /** World-space shadow RECEIVER lookup shift, independent of vertex displacement/caster depth. Lit mesh only. */
  readonly shadow?: { readonly offset: GraphValue };
  readonly surface?: {
    readonly colour?: GraphValue; readonly alpha?: GraphValue; readonly alphaCutoff?: number; readonly emissive?: GraphValue;
    readonly roughness?: GraphValue; readonly metalness?: GraphValue; readonly occlusion?: GraphValue;
    /** bool: discard the fragment where true (a dither against `screenCoordinate`, a clip) */
    readonly discard?: GraphValue;
    /** vec3: the world-space shading normal (a lit model only) */
    readonly normal?: GraphValue;
  };
  readonly lighting?: { readonly sun: GraphValue; readonly sunSpecular?: GraphValue; readonly ambient?: GraphValue; readonly grade?: GraphValue };
  readonly outline?: { readonly offset: GraphValue; readonly colour: GraphValue };
  readonly post?: { readonly colour: GraphValue };
}

function isLiteral(value: GraphValue): value is number | readonly number[] { return typeof value === 'number' || Array.isArray(value); }
function constLiteral(value: unknown): GraphLiteral | undefined {
  if (typeof value === 'number') return value;
  if (value instanceof Color) return [value.r, value.g, value.b];
  if (value instanceof Vector2 || value instanceof Vector3 || value instanceof Vector4) return value.toArray();
  return undefined;
}

/**
 * Compile TSL node trees into one SF59 graph (a `GraphIr`), validated under the author caps (`validateGraph`). Shared
 * subtrees become one graph node; `.toVar('name')` names a node (ids are otherwise `n0`, `n1` … in first-use order);
 * TSL constants become inline literals. Throws, naming the node, on anything outside the approved vocabulary.
 *
 * ```ts
 * const bands = param('bands', { type: 'float', value: 3, min: 1, max: 8 });
 * const lit = dot(normalView, graphInputs.sunDirection).saturate().mul(graphInputs.sunShadow);
 * const cel = lit.mul(bands).add(0.5).floor().div(bands);
 * const ir = graph({ flatShading: true, lighting: { sun: graphInputs.albedo.mul(graphInputs.sunColour).mul(cel).mul(1 / Math.PI) } });
 * ```
 */
export function graph(spec: GraphSpec): GraphIr {
  const nodes: Record<string, GraphNode> = {}, ids = new Map<Node, string>(), used = new Set<string>(), paramDefs: Record<string, GraphParam> = {};
  let counter = 0;
  const fresh = (): string => { let id = `n${counter++}`; while (used.has(id)) id = `n${counter++}`; return id; };
  const define = (key: Node, name: string | null, node: GraphNode): string => {
    const id = name ?? fresh();
    if (used.has(id)) throw new Error(`graph: the node name ${id} is used twice`);
    used.add(id); ids.set(key, id); nodes[id] = node;
    return id;
  };
  const refOf = (value: GraphValue): GraphRef => {
    if (isLiteral(value)) return value;
    let node: Node = value, name: string | null = null;
    for (;;) {
      const seen = ids.get(node); if (seen !== undefined) return seen;
      const builtin = BUILTINS.get(node);
      if (builtin !== undefined) return define(node, name, { op: builtin });
      if (!isVar(node)) break;
      const label: unknown = node.name; // null at runtime for an unnamed var, whatever the typings say
      if (!node.intent && typeof label === 'string' && label !== '') name ??= label;
      node = node.node;
    }
    const key = node;
    const seen = ids.get(key); if (seen !== undefined) return seen;
    if (key instanceof ConstNode) {
      const literal = constLiteral(key.value);
      if (literal === undefined) throw new Error(`graph: a ${typeof key.value} constant is not a graph literal`);
      if (name === null) return literal;
      return define(key, name, { op: 'const', value: literal });
    }
    const info = graphOps.get(key);
    if (info !== undefined) {
      const paramName = info.paramName, def = info.paramDef;
      if (paramName !== undefined) {
        if (def === undefined) throw new Error('graph: a param must come from param()');
        const prior = paramDefs[paramName];
        if (prior !== undefined && JSON.stringify(prior) !== JSON.stringify(def)) throw new Error(`graph: two params are named ${paramName}`);
        paramDefs[paramName] = def;
      }
      if (info.graphOp === 'param') {
        if (paramName === undefined) throw new Error('graph: a param must come from param()');
        return define(key, name, { op: 'param', param: paramName });
      }
      const inputs = info.args.map(refOf);
      return define(key, name, { op: info.graphOp, ...(inputs.length === 0 ? {} : { in: inputs }), ...(info.paramName === undefined ? {} : { param: info.paramName }) });
    }
    if (key instanceof AttributeNode) {
      const attributeName: unknown = Reflect.get(key, '_attributeName'), type = key.nodeType;
      if (attributeName === 'uv') return define(key, name, { op: 'uv' });
      if (typeof attributeName !== 'string' || (type !== 'float' && type !== 'vec2' && type !== 'vec3' && type !== 'vec4')) {
        throw new Error(`graph: attribute ${String(attributeName)} needs a float / vec2 / vec3 / vec4 type: attribute('aSeed', 'float')`);
      }
      const fallback = spec.attributeDefaults?.[attributeName];
      return define(key, name, { op: 'attribute', name: attributeName, type, ...(fallback === undefined ? {} : { default: fallback }) });
    }
    if (key instanceof VaryingNode) {
      const source = key.node instanceof SubBuildNode ? key.node.node : key.node; // varying() wraps its input in the vertex sub-build
      if ((key.interpolationType !== null && key.interpolationType !== 'flat') || key.interpolationSampling !== null) throw new Error('graph: varying interpolation supports flat or the default only');
      return define(key, name, { op: 'varying', in: [refOf(source)], ...(key.interpolationType === 'flat' ? { interpolation: 'flat' } : {}) });
    }
    if (key instanceof OperatorNode) {
      const graphOp = OPERATORS[key.op];
      if (graphOp === undefined) throw new Error(`graph: the TSL operator ${key.op} has no graph op`);
      const inputs = graphOp === 'not' ? [refOf(key.aNode)] : [refOf(key.aNode), refOf(key.bNode)];
      return define(key, name, { op: graphOp, in: inputs });
    }
    if (key instanceof MathNode) {
      if (!METHODS.has(key.method)) throw new Error(`graph: the TSL math ${key.method} has no graph op`);
      const operands = [key.aNode, key.bNode, key.cNode].filter((input): input is Node => input !== null);
      if (key.method === 'clamp' && operands.length === 3) {
        const lo = constOf(operands[1]), hi = constOf(operands[2]);
        if (lo === 0 && hi === 1) return define(key, name, { op: 'saturate', in: [refOf(operands[0] ?? 0)] });
      }
      return define(key, name, { op: key.method, in: operands.map(refOf) });
    }
    if (key instanceof SplitNode) {
      const mask = key.components.split('').map((c) => SWIZZLE[c] ?? '?').join('');
      if (mask.includes('?')) throw new Error(`graph: the swizzle ${key.components} is not xyzw / rgba`);
      return define(key, name, { op: 'swizzle', in: [refOf(key.node)], mask });
    }
    if (key instanceof JoinNode) return define(key, name, { op: 'combine', in: key.nodes.map(refOf) });
    if (key instanceof ConditionalNode) {
      if (key.elseNode === null) throw new Error('graph: a select needs both sides');
      return define(key, name, { op: 'select', in: [refOf(key.condNode), refOf(key.ifNode), refOf(key.elseNode)] });
    }
    if (key instanceof ConvertNode) {
      const literal = constOf(key.node);
      const width = { vec2: 2, vec3: 3, vec4: 4 }[key.convertTo];
      if (typeof literal === 'number' && width !== undefined) return Array.from({ length: width }, () => literal);
      throw new Error(`graph: a ${key.convertTo}() conversion of a node; write combine(x, x …) or rely on float broadcast`);
    }
    if (key instanceof UniformNode) throw new Error('graph: a TSL uniform() has no name or range; use param()');
    throw new Error(`graph: the TSL node ${key.constructor.name} has no graph op`);
  };
  const vertex: GraphStages['vertex.offset'] = spec.vertex === undefined ? undefined : { offset: refOf(spec.vertex.offset), ...(spec.vertex.shadow === undefined ? {} : { shadow: spec.vertex.shadow }) };
  let surface: GraphStages['surface'];
  if (spec.surface !== undefined) {
    const s = spec.surface, refs: Record<string, GraphRef> = {};
    for (const key of ['colour', 'alpha', 'emissive', 'roughness', 'metalness', 'occlusion', 'discard', 'normal'] as const) { const value = s[key]; if (value !== undefined) refs[key] = refOf(value); }
    surface = { ...refs, ...(s.alphaCutoff === undefined ? {} : { alphaCutoff: s.alphaCutoff }) };
  }
  const l = spec.lighting;
  const lighting: GraphStages['lighting'] = l === undefined ? undefined
    : { sun: refOf(l.sun), ...(l.sunSpecular === undefined ? {} : { sunSpecular: refOf(l.sunSpecular) }), ...(l.ambient === undefined ? {} : { ambient: refOf(l.ambient) }), ...(l.grade === undefined ? {} : { grade: refOf(l.grade) }) };
  const outline: GraphStages['outline'] = spec.outline === undefined ? undefined : { offset: refOf(spec.outline.offset), colour: refOf(spec.outline.colour) };
  const post: GraphStages['post'] = spec.post === undefined ? undefined : { colour: refOf(spec.post.colour) };
  const stages: GraphStages = {
    ...(spec.shadow === undefined ? {} : { 'shadow.offset': { offset: refOf(spec.shadow.offset) } }),
    ...(vertex === undefined ? {} : { 'vertex.offset': vertex }), ...(surface === undefined ? {} : { surface }), ...(lighting === undefined ? {} : { lighting }),
    ...(outline === undefined ? {} : { outline }), ...(post === undefined ? {} : { post }),
  };
  const kind = spec.kind ?? (spec.post !== undefined ? 'post' : 'material');
  const ir = {
    version: 1, kind, ...(spec.budget === undefined ? {} : { budget: spec.budget }), ...(kind === 'material' ? { model: spec.model ?? 'standard' } : {}),
    ...(spec.doubleSided === undefined ? {} : { doubleSided: spec.doubleSided }), ...(spec.flipBackfaceNormals === undefined ? {} : { flipBackfaceNormals: spec.flipBackfaceNormals }), ...(spec.toonCaustics === undefined ? {} : { toonCaustics: spec.toonCaustics }), ...(spec.flatShading === undefined ? {} : { flatShading: spec.flatShading }),
    ...(Object.keys(paramDefs).length === 0 ? {} : { params: paramDefs }), nodes, stages,
  };
  const checked = validateGraph(structuredClone(ir), { trustedBudget: true });
  if (!checked.ok) throw new Error(`graph: ${checked.errors.join('; ')}`);
  return checked.graph;
}
function constOf(node: Node | undefined): GraphLiteral | undefined {
  const current = node === undefined ? undefined : unwrap(node);
  return current instanceof ConstNode ? constLiteral(current.value) : undefined;
}

/** sRGB, rounded to 4 decimals (three's colour management round-trips to about 1e-5; an 8-bit step is 0.004), from a three.js colour. */
function srgb(color: Color): [number, number, number] {
  const out = color.getRGB(new Color(), SRGBColorSpace);
  return [out.r, out.g, out.b].map((c) => Math.round(c * 1e4) / 1e4) as [number, number, number];
}
function parseToonMaterial(input: unknown): ToonMaterialParams {
  const params = parseFamilyMaterial(input);
  if (params.family !== 'toon') throw new Error('expected a toon entry');
  return params;
}
function parsePainterlyMaterial(input: unknown): PainterlyMaterialParams {
  const params = parseFamilyMaterial(input);
  if (params.family !== 'painterly') throw new Error('expected a painterly entry');
  return params;
}

/** How a family material is written into the catalogue. */
export interface CatalogueOptions {
  /** write `{ family: 'graph', preset, version }` (the engine re-expresses the family as graph IR) instead of the family entry */
  readonly graphPreset?: boolean;
}

/** `ToonMaterial` options: three's toon parameters plus the toon family's own. */
export interface ToonMaterialOptions extends CatalogueOptions {
  readonly color?: ColorRepresentation;
  /** the geometry's vertex colours multiply the colour (default true) */
  readonly vertexColors?: boolean;
  /** one normal per triangle (default true) */
  readonly faceted?: boolean;
  /** both faces drawn (default true) */
  readonly doubleSided?: boolean;
  /** false: borrowed normal maps keep the front-face basis on back faces; culling is unchanged. */
  readonly flipBackfaceNormals?: boolean;
  /** false: omit underwater caustics on this toon material, leaving its shared look unchanged. */
  readonly toonCaustics?: boolean;
  readonly roughness?: number;
  readonly metalness?: number;
  /** hard cel bands (2–8); absent: the family's own two-band ramp. Set, the material bakes to a cel graph. */
  readonly bands?: number;
  /** rim strength (0–2) of a sun-coloured rim; absent: the toon look's rim. Set, the material bakes to a cel graph. */
  readonly rim?: number;
}
/** The toon family as a three.js material (the scene reader bakes it to a catalogue entry). */
export class ToonMaterial extends MeshToonMaterial {
  readonly isToonFamilyMaterial = true;
  faceted: boolean;
  roughness: number;
  metalness: number;
  bands: number | undefined;
  rim: number | undefined;
  graphPreset: boolean;
  constructor(options: ToonMaterialOptions = {}) {
    super({ color: options.color ?? 0xffffff, vertexColors: options.vertexColors ?? true, side: options.doubleSided === false ? FrontSide : DoubleSide });
    this.faceted = options.faceted ?? true; this.roughness = options.roughness ?? 0.88; this.metalness = options.metalness ?? 0;
    this.bands = options.bands; this.rim = options.rim; this.graphPreset = options.graphPreset ?? false;
    if (this.bands !== undefined && (!Number.isInteger(this.bands) || this.bands < 2 || this.bands > 8)) throw new Error('ToonMaterial: bands is an integer 2–8');
    if (this.rim !== undefined && !(this.rim >= 0 && this.rim <= 2)) throw new Error('ToonMaterial: rim is 0–2');
  }
  /** The toon family entry (defaults filled) this material stands for. */
  toFamilyParams(): ToonMaterialParams {
    return parseToonMaterial({ family: 'toon', colour: srgb(this.color), vertexColours: this.vertexColors, faceted: this.faceted, doubleSided: this.side === DoubleSide, roughness: this.roughness, metalness: this.metalness });
  }
  /** The catalogue entry: the toon family (or its graph preset), or a cel graph when `bands` / `rim` are set. */
  toMaterialEntry(): MaterialEntry {
    const params = this.toFamilyParams();
    if (this.bands !== undefined || this.rim !== undefined) return { family: 'graph', graph: celGraph(params, this.bands ?? 2, this.rim ?? 0) };
    return this.graphPreset ? { family: 'graph', preset: params, version: GRAPH_PRESET_VERSION } : params;
  }
}

/** `PainterlyMaterial` options: three's standard colour plus the painterly family's surface terms. */
export interface PainterlyMaterialOptions extends CatalogueOptions {
  readonly color?: ColorRepresentation;
  readonly vertexColors?: boolean;
  readonly doubleSided?: boolean;
  /** false: borrowed normal maps keep the front-face basis on back faces; culling is unchanged. */
  readonly flipBackfaceNormals?: boolean;
  /** false: omit underwater caustics on this toon material, leaving its shared look unchanged. */
  readonly toonCaustics?: boolean;
  /** rim-light strength 0–1 (default 0.35) */
  readonly rim?: number;
  /** cel strength 0 (Lambert) … 1 (the full three-band ramp) (default 0.8) */
  readonly bands?: number;
  /** share of the painted shade tint (default 1) */
  readonly shade?: number;
  /** share of the painted floor (default 1) */
  readonly floor?: number;
  /** wind sway, metres per (local metre above the origin)² (default 0) */
  readonly sway?: number;
  readonly emissive?: ColorRepresentation;
  readonly emissiveIntensity?: number;
  readonly alphaCutoff?: number;
}
/** The painterly family as a three.js material (a preview is a plain standard material). */
export class PainterlyMaterial extends MeshStandardMaterial {
  readonly isPainterlyFamilyMaterial = true;
  rim: number; bands: number; shade: number; floor: number; sway: number; graphPreset: boolean;
  constructor(options: PainterlyMaterialOptions = {}) {
    super({ color: options.color ?? 0xffffff, vertexColors: options.vertexColors ?? true, side: options.doubleSided === true ? DoubleSide : FrontSide,
      roughness: 1, metalness: 0, emissive: options.emissive ?? 0x000000, emissiveIntensity: options.emissiveIntensity ?? 1, alphaTest: options.alphaCutoff ?? 0 });
    this.rim = options.rim ?? 0.35; this.bands = options.bands ?? 0.8; this.shade = options.shade ?? 1; this.floor = options.floor ?? 1; this.sway = options.sway ?? 0;
    this.graphPreset = options.graphPreset ?? false;
  }
  /** The painterly family entry (defaults filled) this material stands for. */
  toFamilyParams(): PainterlyMaterialParams {
    return parsePainterlyMaterial({ family: 'painterly', colour: srgb(this.color), rim: this.rim, bands: this.bands, shade: this.shade, floor: this.floor, sway: this.sway,
      emissive: srgb(this.emissive), emissiveIntensity: this.emissiveIntensity, vertexColours: this.vertexColors, doubleSided: this.side === DoubleSide, alphaCutoff: this.alphaTest });
  }
  /** The catalogue entry: the painterly family, or its graph preset. */
  toMaterialEntry(): MaterialEntry {
    const params = this.toFamilyParams();
    return this.graphPreset ? { family: 'graph', preset: params, version: GRAPH_PRESET_VERSION } : params;
  }
}

/** A material graph on a three.js material: a preview draws the standard model in `color`; the bake writes the graph. */
export class GraphMaterial extends MeshStandardMaterial {
  readonly isGraphFamilyMaterial = true;
  readonly graph: GraphIr;
  constructor(ir: GraphIr | GraphSpec, preview: ColorRepresentation = 0xffffff) {
    super({ color: preview, flatShading: false });
    this.graph = 'version' in ir ? checkedGraph(ir) : graph(ir);
    if (this.graph.kind !== 'material') throw new Error('GraphMaterial holds a material graph, not a post pass');
    this.side = this.graph.doubleSided === true ? DoubleSide : FrontSide;
    this.flatShading = this.graph.flatShading === true;
  }
  /** The catalogue entry: the inline graph. */
  toMaterialEntry(): MaterialEntry { return { family: 'graph', graph: this.graph }; }
}
function checkedGraph(ir: GraphIr): GraphIr {
  const checked = validateGraph(structuredClone(ir), { trustedBudget: true });
  if (!checked.ok) throw new Error(`graph: ${checked.errors.join('; ')}`);
  return checked.graph;
}

function rgb(values: readonly number[]): Color { return new Color().setRGB(values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, SRGBColorSpace); }

/** An SDK material the scene reader bakes to a catalogue entry. */
export type CatalogueMaterial = ToonMaterial | PainterlyMaterial | GraphMaterial;
/** Whether a material is one of this module's catalogue materials. */
export function isCatalogueMaterial(material: unknown): material is CatalogueMaterial {
  return material instanceof ToonMaterial || material instanceof PainterlyMaterial || material instanceof GraphMaterial;
}
/** Rebuild the SDK material a catalogue entry came from (the scene graph restore path). */
export function catalogueMaterial(entry: MaterialEntry): CatalogueMaterial {
  if (entry.family === 'toon' || entry.family === 'graph' && 'preset' in entry && entry.preset.family === 'toon') {
    const p = entry.family === 'toon' ? entry : entry.preset.family === 'toon' ? entry.preset : null;
    if (p === null) throw new Error('unreachable toon entry');
    return new ToonMaterial({ color: rgb(p.colour), vertexColors: p.vertexColours, faceted: p.faceted, doubleSided: p.doubleSided, roughness: p.roughness, metalness: p.metalness, graphPreset: entry.family === 'graph' });
  }
  if (entry.family === 'painterly' || entry.family === 'graph' && 'preset' in entry && entry.preset.family === 'painterly') {
    const p = entry.family === 'painterly' ? entry : entry.preset.family === 'painterly' ? entry.preset : null;
    if (p === null) throw new Error('unreachable painterly entry');
    if (p.map !== null || p.terrain !== undefined) throw new Error('PainterlyMaterial: a mapped or painted-terrain surface needs its texture declarations');
    return new PainterlyMaterial({ color: rgb(p.colour), vertexColors: p.vertexColours, doubleSided: p.doubleSided, rim: p.rim, bands: p.bands, shade: p.shade, floor: p.floor, sway: p.sway,
      emissive: rgb(p.emissive), emissiveIntensity: p.emissiveIntensity, alphaCutoff: p.alphaCutoff, graphPreset: entry.family === 'graph' });
  }
  if (entry.family === 'graph' && 'graph' in entry) return new GraphMaterial(entry.graph);
  throw new Error(`no SDK material for a ${entry.family} entry of this shape`);
}

/**
 * The cel graph a `ToonMaterial` with `bands` / `rim` bakes to: the sun in `bands` hard steps over the albedo, a
 * sun-coloured rim of `rim` strength where the surface turns from the view, the physical ambient. Built with `graph()`.
 */
function celGraph(p: ToonMaterialParams, bands: number, rim: number): GraphIr {
  const { albedo, sunColour, sunDirection, sunShadow, vertexColour } = graphInputs;
  const colour = param('colour', { type: 'colour', value: [...p.colour] });
  const bandsP = param('bands', { type: 'float', value: bands, min: 2, max: 8 });
  const rimP = param('rim', { type: 'float', value: rim, min: 0, max: 2 });
  const lit = dot(normalView, sunDirection).saturate().mul(sunShadow);
  const cel = lit.mul(bandsP).add(0.5).floor().div(bandsP);
  const fresnel = smoothstep(0.55, 1, dot(normalView, positionViewDirection).saturate().oneMinus());
  // the rim shows on the lit side only (step(edge, x): 1 where lit ≥ 0.01)
  const rimTerm = fresnel.mul(rimP).mul(step(0.01, lit)).mul(0.25);
  const sun = albedo.mul(sunColour).mul(cel.mul(1 / Math.PI).add(rimTerm));
  return graph({
    model: 'standard', flatShading: p.faceted, doubleSided: p.doubleSided,
    surface: { colour: p.vertexColours ? colour.mul(vertexColour) : colour, roughness: p.roughness, metalness: p.metalness },
    lighting: { sun },
  });
}
