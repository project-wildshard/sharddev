import {
  AdditiveBlending, AmbientLight, BackSide, Box3, DataTexture, DirectionalLight, DoubleSide, Fog, FrontSide, FogExp2, Group, HemisphereLight, InstancedMesh, Line, Matrix4,
  Mesh, MeshBasicMaterial, MeshStandardMaterial, type Object3D, PointLight, Points, PointsMaterial, Quaternion, Scene, SpotLight, Sprite, SpriteMaterial, Vector3,
  type BufferAttribute, type BufferGeometry, Color, type InterleavedBufferAttribute, Material, ShaderMaterial, type Texture,
} from 'three';
import { vec3 } from 'three/tsl';
import { GraphMaterial, graph, isCatalogueMaterial, meshMap, type GraphValue } from '../materials';
import { LOOK_SKY_BUDGET } from '@wildshard/format/look-sky';
import { hungOf, isSolid, motionOf, paintedPixels, Water, type HangOptions, type MoverOptions, type SetsOptions, type ShardWorld, type ShownWhen, type TouchableOptions } from './author';
import type {
  Rgb, SceneCollider, SceneDraw, SceneSky, SceneGeometry, SceneGround, SceneLight, SceneLook, SceneMaterial, SceneMotion, ScenePart, ScenePoints, ScenePost, SceneSprite, SceneTexture,
  SceneDetailScatter, SceneMove, SceneStateWrite, SceneSwing, SceneTouch, SceneWater, ShardIdentityInput, ShardScene, Vec3,
} from './description';
import { ContentHash, hashOf } from './hash';

/**
 * AUTHORING-PARITY AP1: the walker. It runs the author's build function on a fresh `Scene`, then reads every object once
 * into a `ShardScene`. It refuses only what has no lowering yet, naming the object's path, its type and the row that
 * adds it, so an author is never left with a silently missing thing.
 */

/** A refusal: the object's path and the fix. */
/** ss4d: whether a graph material entry samples the mesh's own map (a `meshMap` node in its graph). */
const readsMeshMap = (entry: object): boolean =>
  Object.values((entry as { graph?: { nodes?: Record<string, { op?: string }> } }).graph?.nodes ?? {}).some((node) => node.op === 'meshMap');

export class SceneRefusalError extends Error {
  constructor(path: string, problem: string, fix: string) { super(`scene: ${path}: ${problem}. ${fix}`); this.name = 'SceneRefusalError'; }
}

const rgb = (colour: Color, scale = 1): Rgb => [colour.r * scale, colour.g * scale, colour.b * scale];
const v3 = (v: Vector3): Vec3 => [v.x, v.y, v.z];

interface Tables {
  materials: Map<string, SceneMaterial>; textures: Map<string, SceneTexture>; geometries: Map<string, SceneGeometry>;
  geometryKeys: WeakMap<BufferGeometry, string>; materialKeys: WeakMap<Material, string>; textureKeys: WeakMap<Texture, string>;
  /** AP32c: this lowering's world.detail meshes, which the walker leaves out (per call: a mesh reused later draws) */
  details: ReadonlySet<Object3D>;
}

function floats(attribute: BufferAttribute | InterleavedBufferAttribute, width: number): Float32Array {
  const out = new Float32Array(attribute.count * width);
  for (let i = 0; i < attribute.count; i++) for (let c = 0; c < width; c++) out[i * width + c] = c < attribute.itemSize ? attribute.getComponent(i, c) : 0;
  return out;
}

function lowerGeometry(geometry: BufferGeometry, path: string, tables: Tables): string {
  const known = tables.geometryKeys.get(geometry); if (known !== undefined) return known;
  const positionAttribute = geometry.getAttribute('position');
  if (positionAttribute === undefined) throw new SceneRefusalError(path, 'its geometry has no position', 'Give the geometry a position attribute');
  if (!geometry.hasAttribute('normal')) geometry.computeVertexNormals();
  const index = geometry.getIndex(), count = index?.count ?? positionAttribute.count;
  if (count % 3 !== 0) throw new SceneRefusalError(path, 'its geometry is not triangles', 'Draw lines and points with Line / Points once AP11 lands; a Mesh must be triangles');
  const position = floats(positionAttribute, 3), normal = floats(geometry.getAttribute('normal'), 3);
  const uv = geometry.hasAttribute('uv') ? floats(geometry.getAttribute('uv'), 2) : null;
  const colour = geometry.hasAttribute('color') ? floats(geometry.getAttribute('color'), 3) : null;
  const indices = index === null ? null : Uint32Array.from(index.array);
  const key = `g${hashOf((h) => { h.bytes(position).bytes(normal); if (uv !== null) h.text('uv').bytes(uv); if (colour !== null) h.text('colour').bytes(colour); if (indices !== null) h.text('index').bytes(indices); })}`;
  if (!tables.geometries.has(key)) tables.geometries.set(key, { key, position, normal, uv, colour, index: indices, triangles: count / 3 });
  tables.geometryKeys.set(geometry, key);
  return key;
}

/** A painted array's texture key per colour space (an array is never written after it is painted). */
const PIXEL_KEYS = new WeakMap<Uint8Array, Partial<Record<'srgb' | 'linear', string>>>();
function lowerTexture(texture: Texture, path: string, tables: Tables): string {
  const known = tables.textureKeys.get(texture); if (known !== undefined) return known;
  let pixels = paintedPixels(texture.source);
  if (pixels === undefined && texture instanceof DataTexture) {
    const { data, width, height } = texture.image as { data: unknown; width: number; height: number };
    if ((data instanceof Uint8Array || data instanceof Uint8ClampedArray) && data.length === width * height * 4) pixels = { width, height, rgba: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) };
  }
  if (pixels === undefined) throw new SceneRefusalError(path, `texture ${texture.name || texture.constructor.name} has no pixels at compile time`, 'Paint it with paint(width, height, fn) from @wildshard/sdk/scene/shard (a CanvasTexture needs a browser), or hand in an RGBA8 DataTexture');
  const colourSpace = texture.colorSpace === 'srgb' ? 'srgb' : 'linear';
  // AP17: a watched revision's memoised paint hands back the same pixel array, so its hash is kept by that array
  const cached = PIXEL_KEYS.get(pixels.rgba)?.[colourSpace], { rgba, width, height } = pixels;
  const key = cached ?? `t${hashOf((h) => { h.numbers([width, height]).text(colourSpace).bytes(rgba); })}`;
  if (cached === undefined) PIXEL_KEYS.set(rgba, { ...PIXEL_KEYS.get(rgba), [colourSpace]: key });
  if (!tables.textures.has(key)) tables.textures.set(key, { key, width: pixels.width, height: pixels.height, rgba: pixels.rgba, colourSpace });
  tables.textureKeys.set(texture, key);
  return key;
}

interface NodeSlots { readonly isNodeMaterial?: boolean; readonly isMeshBasicNodeMaterial?: boolean; readonly map?: Texture | null; readonly [slot: string]: unknown }
const isNodeMaterial = (material: Material): boolean => Reflect.get(material, 'isNodeMaterial') === true;
/** AP13: a three.js node material (`MeshStandardNodeMaterial`, `MeshBasicNodeMaterial`) as one material graph: its TSL slots
 *  go through `graph()`, its plain numbers stand where a slot is empty. A slot the graph has no stage for is refused. */
function nodeMaterialGraph(material: Material, path: string): GraphMaterial {
  const m = material as Material & NodeSlots & { color?: Color; emissive?: Color; roughness?: number; metalness?: number };
  for (const slot of ['positionNode', 'normalNode', 'outputNode', 'fragmentNode', 'vertexNode', 'castShadowNode', 'receivedShadowNode', 'aoNode', 'lightsNode', 'envNode']) {
    if (m[slot] !== null && m[slot] !== undefined) throw new SceneRefusalError(path, `its ${slot} has no graph stage`, 'Use colorNode, emissiveNode, roughnessNode, metalnessNode and opacityNode, or write the whole surface with graph() in a GraphMaterial');
  }
  const value = (node: unknown, fallback: GraphValue): GraphValue => (node === null || node === undefined ? fallback : node as GraphValue);
  const c = m.color ?? new Color(1, 1, 1), e = m.emissive ?? new Color(0, 0, 0);
  const unlit = m.isMeshBasicNodeMaterial === true;
  // ss4d: a node material's own `map` (three draws map x color when colorNode is empty) is the mesh's colour map: the
  // graph reads it as `meshMap`, the shard binds the lowered texture to it (props.materials `colour`)
  const mapped = m.map !== null && m.map !== undefined, empty = (slot: string): boolean => m[slot] === null || m[slot] === undefined;
  const cutsOrBlends = material.transparent || material.alphaTest > 0;
  const surface = {
    colour: value(m['colorNode'], mapped ? meshMap.rgb.mul(vec3(c.r, c.g, c.b)) : [c.r, c.g, c.b]),
    ...(unlit ? {} : { emissive: value(m['emissiveNode'], [e.r, e.g, e.b]), roughness: value(m['roughnessNode'], m.roughness ?? 1), metalness: value(m['metalnessNode'], m.metalness ?? 0) }),
    ...(!empty('opacityNode') ? { alpha: value(m['opacityNode'], 1) } : mapped && empty('colorNode') && cutsOrBlends ? { alpha: meshMap.a.mul(material.opacity) } : {}),
    ...(material.alphaTest > 0 ? { alphaCutoff: material.alphaTest } : {}),
  };
  return new GraphMaterial(graph({ model: unlit ? 'unlit' : 'standard', doubleSided: material.side === DoubleSide, surface }));
}

function lowerMaterial(material: Material, path: string, tables: Tables): string {
  const known = tables.materialKeys.get(material); if (known !== undefined) return known;
  // AP13: shaders are TSL; raw GLSL never reaches a shard file
  if (material instanceof ShaderMaterial) throw new SceneRefusalError(path, `a ${material.type} is raw GLSL`, 'Write the shader in TSL and draw it with new GraphMaterial(graph({ surface: { colour } })) from @wildshard/sdk/materials');
  const catalogue = isCatalogueMaterial(material) ? material.toMaterialEntry() : isNodeMaterial(material) ? nodeMaterialGraph(material, path).toMaterialEntry() : null;
  if (catalogue === null && material.onBeforeCompile !== Material.prototype.onBeforeCompile) throw new SceneRefusalError(path, 'its onBeforeCompile patches GLSL', 'Write the change in TSL as a GraphMaterial (graph() from @wildshard/sdk/materials), or declare it with animate() if it is motion');
  let kind: SceneMaterial['kind'];
  if (material instanceof MeshStandardMaterial) kind = 'standard';
  else if (material instanceof MeshBasicMaterial) kind = 'basic';
  else if (material instanceof SpriteMaterial) kind = 'sprite';
  else if (material instanceof PointsMaterial) kind = 'points';
  else if (catalogue !== null) kind = 'standard';
  else throw new SceneRefusalError(path, `${material.type} has no lowering yet`, 'Use MeshStandardMaterial, MeshBasicMaterial, a node material or a GraphMaterial (TSL through graph())');
  if (material instanceof PointsMaterial && !material.sizeAttenuation) throw new SceneRefusalError(path, 'a Points cloud sized in pixels has no lowering', 'Leave sizeAttenuation on: a point is a card `size` metres across');
  const m = material as MeshStandardMaterial & MeshBasicMaterial & SpriteMaterial & PointsMaterial;
  // ss4d: a graph draws only what it samples: a map reaches the shard (its props.materials `colour`) only when the graph
  // reads the mesh map (a node material's colorNode replaces its map, as in three)
  const sampled = catalogue === null || (catalogue as { family?: string }).family !== 'graph' || readsMeshMap(catalogue);
  const map = m.map === null || m.map === undefined || !sampled ? null : lowerTexture(m.map, path, tables);
  const standard = material instanceof MeshStandardMaterial;
  const fields: Omit<SceneMaterial, 'key' | 'name'> = {
    kind, colour: rgb(m.color), roughness: standard ? m.roughness : 1, metalness: standard ? m.metalness : 0,
    emissive: standard ? rgb(m.emissive) : [0, 0, 0], emissiveIntensity: standard ? m.emissiveIntensity : 0, map,
    repeat: m.map ? [m.map.repeat.x, m.map.repeat.y] : [1, 1], offset: m.map ? [m.map.offset.x, m.map.offset.y] : [0, 0],
    alphaTest: material.alphaTest, side: material.side === DoubleSide ? 'double' : material.side === BackSide ? 'back' : 'front',
    vertexColours: material.vertexColors, transparent: material.transparent, opacity: material.opacity,
    blending: material.blending === AdditiveBlending ? 'additive' : 'normal', depthWrite: material.depthWrite, fog: m.fog !== false,
    polygonOffset: material.polygonOffset ? material.polygonOffsetFactor : 0,
    pointSize: material instanceof PointsMaterial ? material.size : 0,
    entry: catalogue,
  };
  const key = `m${hashOf((h) => h.json(fields))}`;
  if (!tables.materials.has(key)) tables.materials.set(key, { key, name: material.name === '' ? key : material.name, ...fields });
  tables.materialKeys.set(material, key);
  return key;
}

/** The object's path under its part: names where given, else `Type index`. */
function pathOf(object: Object3D, root: Object3D): string {
  const parts: string[] = [];
  for (let node: Object3D | null = object; node !== null && node !== root; node = node.parent) {
    const index = node.parent === null ? 0 : node.parent.children.indexOf(node);
    parts.unshift(node.name === '' ? `${node.type} ${index}` : node.name);
  }
  return [root.name, ...parts].join('/');
}

function colliderOf(path: string, matrix: Matrix4, box: Box3): SceneCollider {
  const centre = box.getCenter(new Vector3()), size = box.getSize(new Vector3());
  const position = new Vector3(), rotation = new Quaternion(), scale = new Vector3();
  matrix.decompose(position, rotation, scale);
  const world = centre.clone().applyMatrix4(matrix);
  return { path, kind: 'cuboid', centre: v3(world), half: [Math.abs(size.x * scale.x) / 2, Math.abs(size.y * scale.y) / 2, Math.abs(size.z * scale.z) / 2], rotation: [rotation.x, rotation.y, rotation.z, rotation.w] };
}

const CARD_MOTIONS: ReadonlySet<string> = new Set(['pulse', 'drift', 'rise']), MESH_MOTIONS: ReadonlySet<string> = new Set(['sway', 'uvScroll']), LIGHT_MOTIONS: ReadonlySet<string> = new Set(['flicker']);
/** The motion `object` takes (AP12): one declared on it must fit what it is (else a refusal by path); one declared on a
 *  group reaches only the objects it fits (a fire's group pulses its cards and flickers its light). */
function fitMotion(object: Object3D, root: Object3D, path: string, kinds: ReadonlySet<string>, what: string): SceneMotion | null {
  const own = motionOf(object, object);
  if (own !== null && !kinds.has(own.kind)) throw new SceneRefusalError(path, `${own.kind} does not move a ${what}`, 'flicker moves a PointLight; pulse, drift and rise move a Sprite or Points; sway and uvScroll move a mesh. spin and bob need moving parts: an engine row after M2');
  if (own !== null) return own;
  const inherited = object.parent === null || object === root ? null : motionOf(object.parent, root);
  return inherited !== null && kinds.has(inherited.kind) ? inherited : null;
}

/**
 * ss4d: a graph material (TSL, a node material, a catalogue entry) is its own whole surface: the engine draws its graph
 * and nothing of the scene's card or motion rows, so a card or a declared motion on one would be dropped. Refused by
 * path, never dropped: a card is a SpriteMaterial or a PointsMaterial; a graph moves in its own `vertex.offset` stage.
 */
function refuseGraphMotion(path: string, key: string, tables: Tables, what: string): void {
  if (tables.materials.get(key)?.entry === null) return;
  throw new SceneRefusalError(path, what === 'card' ? 'a graph material has no card (a camera-facing quad)' : `a graph material does not take a declared ${what}`,
    what === 'card' ? 'Draw a Sprite or Points with a SpriteMaterial or PointsMaterial (its map, colour and blending), or a plain Mesh with the graph'
      : 'Move it in the graph: vertex: { offset } over graphInputs.windTime (sway) or a uv over time (uvScroll), or draw it with a MeshStandardMaterial');
}

/** SS8d: a hung body's swing row: its pivot is the group's origin, its length the drop to the middle of what it holds. */
function swingRow(path: string, node: Object3D, options: Required<HangOptions>): SceneSwing {
  const pivot = node.getWorldPosition(new Vector3()), box = new Box3().setFromObject(node);
  const middle = box.isEmpty() ? pivot.y - 0.5 : (box.min.y + box.max.y) / 2;
  const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));
  return { path, pivot: v3(pivot), length: clamp(pivot.y - middle, 0.05, 10), rate: clamp(options.rate, 0.05, 4), amount: clamp(options.amount, 0, 0.6), reach: clamp(options.reach, 0, 3) };
}

function lowerPart(root: Object3D, tables: Tables, panel?: string, touchable?: TouchableOptions, mover?: MoverOptions): ScenePart {
  const draws: SceneDraw[] = [], sprites: SceneSprite[] = [], lights: SceneLight[] = [], colliders: SceneCollider[] = [], water: SceneWater[] = [], points: ScenePoints[] = [];
  // SS8d: the part's hung bodies, each a row the first time something under it lowers
  const swings: SceneSwing[] = [], swingIndex = new Map<Object3D, number>();
  const swingOf = (object: Object3D, path: string): { swing?: number } => {
    const hung = hungOf(object, root);
    if (hung === null) return {};
    if (panel !== undefined) throw new SceneRefusalError(path, 'a panel part cannot swing', 'Hang it in a part of its own');
    let at = swingIndex.get(hung.node);
    if (at === undefined) { at = swings.length; swings.push(swingRow(pathOf(hung.node, root), hung.node, hung.options)); swingIndex.set(hung.node, at); }
    return { swing: at };
  };
  const visit = (object: Object3D): void => {
    // AP32c: a world.detail mesh is its layer's, never copies in a tile
    if (tables.details.has(object)) return;
    const path = pathOf(object, root);
    if (!object.visible) {
      // an invisible solid is a collider only: said once, drawn never
      if (object instanceof Mesh && isSolid(object)) { object.geometry.computeBoundingBox(); colliders.push(colliderOf(path, object.matrixWorld, object.geometry.boundingBox ?? new Box3())); }
      return;
    }
    if (object instanceof Water) {
      // the format holds at most 64 outline points: 48 evenly spaced along the shape
      const outline = object.shape.getSpacedPoints(48).slice(0, 48).map((p) => new Vector3(p.x, p.y, 0).applyMatrix4(object.matrixWorld));
      const geometry = object.geometry, position = geometry.getAttribute('position'), index = geometry.getIndex(), n = index?.count ?? position.count;
      const triangles = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { const p = new Vector3().fromBufferAttribute(position, index?.getX(i) ?? i).applyMatrix4(object.matrixWorld); triangles.set([p.x, p.y, p.z], i * 3); }
      const level = new Vector3().setFromMatrixPosition(object.matrixWorld).y;
      water.push({ path, outline: outline.map((p) => [p.x, p.z] as const), level, tint: rgb(object.material.color), reflect: object.reflect, triangles });
      return;
    }
    if (object instanceof Mesh) {
      if (Array.isArray(object.material)) throw new SceneRefusalError(path, 'it has several materials', 'Split it into one mesh per material');
      const geometry = lowerGeometry(object.geometry, path, tables), material = lowerMaterial(object.material, path, tables);
      let instances: SceneDraw['instances'] = null;
      if (object instanceof InstancedMesh) {
        const count = object.count, matrices = new Float32Array(object.instanceMatrix.array.buffer, object.instanceMatrix.array.byteOffset, count * 16).slice();
        const colours = object.instanceColor === null ? null : new Float32Array(object.instanceColor.array.buffer, object.instanceColor.array.byteOffset, count * 3).slice();
        instances = { count, matrices, colours };
        if (isSolid(object)) {
          object.geometry.computeBoundingBox(); const box = object.geometry.boundingBox ?? new Box3();
          for (let i = 0; i < count; i++) colliders.push(colliderOf(`${path}#${i}`, object.matrixWorld.clone().multiply(new Matrix4().fromArray(matrices, i * 16)), box));
        }
      } else if (isSolid(object)) {
        object.geometry.computeBoundingBox(); colliders.push(colliderOf(path, object.matrixWorld, object.geometry.boundingBox ?? new Box3()));
      }
      const motion = fitMotion(object, root, path, MESH_MOTIONS, 'mesh'), swing = swingOf(object, path);
      if (motion !== null) refuseGraphMotion(path, material, tables, motion.kind);
      if (swing.swing !== undefined) refuseGraphMotion(path, material, tables, 'swing');
      draws.push({ path, geometry, material, matrix: [...object.matrixWorld.elements], instances, castShadow: object.castShadow, receiveShadow: object.receiveShadow, motion, ...swing });
    } else if (object instanceof Sprite) {
      const material = lowerMaterial(object.material, path, tables), scale = new Vector3().setFromMatrixScale(object.matrixWorld);
      refuseGraphMotion(path, material, tables, 'card');
      sprites.push({ path, material, position: v3(new Vector3().setFromMatrixPosition(object.matrixWorld)), scale: [scale.x, scale.y], center: [object.center.x, object.center.y], motion: fitMotion(object, root, path, CARD_MOTIONS, 'Sprite'), ...swingOf(object, path) });
    } else if (object instanceof PointLight || object instanceof DirectionalLight || object instanceof HemisphereLight || object instanceof AmbientLight) {
      const position = v3(new Vector3().setFromMatrixPosition(object.matrixWorld));
      const kind: SceneLight['kind'] = object instanceof PointLight ? 'point' : object instanceof DirectionalLight ? 'directional' : object instanceof HemisphereLight ? 'hemisphere' : 'ambient';
      lights.push({ path, kind, colour: rgb(object.color), groundColour: object instanceof HemisphereLight ? rgb(object.groundColor) : null, intensity: object.intensity,
        distance: object instanceof PointLight ? object.distance : 0, decay: object instanceof PointLight ? object.decay : 0, position,
        target: object instanceof DirectionalLight ? v3(object.target.getWorldPosition(new Vector3())) : null, castShadow: object.castShadow,
        motion: object instanceof PointLight ? fitMotion(object, root, path, LIGHT_MOTIONS, 'light') : null, ...(object instanceof PointLight ? swingOf(object, path) : {}) });
    } else if (object instanceof SpotLight) {
      throw new SceneRefusalError(path, 'SpotLight has no lowering yet', 'Use a PointLight; spot lamps are an engine row after M1');
    } else if (object instanceof Points) {
      // AP11: each point a camera-facing card; the cloud keeps its own motion (drift, rise)
      if (Array.isArray(object.material)) throw new SceneRefusalError(path, 'it has several materials', 'Give a Points cloud one PointsMaterial');
      const material = lowerMaterial(object.material, path, tables), position = object.geometry.getAttribute('position');
      refuseGraphMotion(path, material, tables, 'card');
      if (position === undefined) throw new SceneRefusalError(path, 'its geometry has no position', 'Give the cloud a position attribute');
      const seats = new Float32Array(position.count * 3), p = new Vector3();
      for (let i = 0; i < position.count; i++) { p.fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld); seats.set([p.x, p.y, p.z], i * 3); }
      points.push({ path, material, positions: seats, motion: fitMotion(object, root, path, CARD_MOTIONS, 'Points cloud') });
    } else if (object instanceof Line) {
      throw new SceneRefusalError(path, `${object.type} has no lowering yet`, 'Draw a line as a thin mesh (a TubeGeometry)');
    } else if (isSolid(object)) {
      colliders.push(colliderOf(path, new Matrix4(), new Box3().setFromObject(object))); // a solid group is one world box; its meshes still draw
    }
    for (const child of object.children) visit(child);
  };
  visit(root);
  const materials = [...new Set([...draws.map((d) => d.material), ...sprites.map((s) => s.material), ...points.map((c) => c.material)])];
  const textures = [...new Set(materials.map((key) => tables.materials.get(key)?.map).filter((key): key is string => typeof key === 'string'))];
  const geometries = [...new Set(draws.map((d) => d.geometry))];
  const hash = new ContentHash().text(root.name).text(panel ?? '');
  // AP16: a panel is meshes and solids, the things a state row can hide; anything else would stay when it hides
  if (panel !== undefined && sprites.length + points.length + lights.length + water.length > 0) throw new SceneRefusalError(root.name, 'a panel part holds meshes and solids only (its sprites, points, lights and water would not hide with it)', 'Put them in a part of their own');
  // a panel is a library model, which carries no tile motion: a moving mesh would stand still
  if (panel !== undefined && draws.some((d) => d.motion !== null)) throw new SceneRefusalError(root.name, 'a panel part cannot move (sway, flicker, pulse or uvScroll)', 'Put the moving meshes in a part of their own');
  for (const draw of draws) {
    hash.text(draw.geometry).text(draw.material).numbers(draw.matrix).numbers([draw.castShadow ? 1 : 0, draw.receiveShadow ? 1 : 0]).json(draw.motion);
    if (draw.instances !== null) { hash.bytes(draw.instances.matrices); if (draw.instances.colours !== null) hash.bytes(draw.instances.colours); }
  }
  hash.json(sprites).json(lights).json(colliders).json(swings).json(draws.map((d) => d.swing ?? -1)).json(water.map((w) => ({ ...w, triangles: [...w.triangles] })));
  for (const cloud of points) hash.text(cloud.material).bytes(cloud.positions).json(cloud.motion);
  const touch = touchable === undefined ? undefined : touchOf(root, touchable);
  if (touch !== undefined) hash.json(touch);
  const move = mover === undefined ? undefined : moveOf(root, colliders, mover);
  if (move !== undefined) hash.json(move);
  return { name: root.name, hash: hash.hex(), ...(panel === undefined ? {} : { panel }), ...(touch === undefined ? {} : { touch }), ...(move === undefined ? {} : { move }), draws, sprites, points, lights, colliders, water, ...(swings.length === 0 ? {} : { swings }), materials, textures, geometries };
}

/** SS-GF2a: a mover part's track: its rest at the centre of its bounds, its solids about that, the path from there. */
function moveOf(root: Object3D, colliders: readonly SceneCollider[], options: MoverOptions): SceneMove {
  const box = new Box3().setFromObject(root);
  if (box.isEmpty()) throw new SceneRefusalError(root.name, 'a mover part has no bounds', 'Give it a mesh');
  if (colliders.length === 0) throw new SceneRefusalError(root.name, 'a mover part has no solid to stand on', 'Mark its deck solid: solid(mesh)');
  if (colliders.length > 128) throw new SceneRefusalError(root.name, `a mover part has ${colliders.length} solids, over the 128 a mover holds`, 'Merge its solids into fewer boxes');
  if (options.path.length === 0 || options.path.length > 9) throw new SceneRefusalError(root.name, `a mover's path has ${options.path.length} points, not 1 to 9`, 'Give world.part\'s mover 1 to 9 points after where it is built');
  if (options.start !== undefined && options.start !== 'stand' && options.start !== 'always') throw new SceneRefusalError(root.name, `a mover's start ${String(options.start)} is not stand or always`, 'Give it start: \'stand\' or \'always\'');
  if (options.loop !== undefined && !['pingpong', 'once', 'repeat'].includes(options.loop)) throw new SceneRefusalError(root.name, `a mover's loop ${String(options.loop)} is not pingpong, once or repeat`, 'Give it one of the three loops');
  if (!(options.seconds >= 0.1 && options.seconds <= 3600)) throw new SceneRefusalError(root.name, `a mover's ${options.seconds} seconds is outside 0.1 to 3600`, 'Give it the seconds from its start to its last point');
  const round = (n: number): number => Math.round(n * 1e4) / 1e4;
  const centre = box.getCenter(new Vector3()), at: Vec3 = [round(centre.x), round(centre.y), round(centre.z)];
  const path: Vec3[] = [at, ...options.path.map(([x, y, z]): Vec3 => [round(x), round(y), round(z)])];
  if (path.some((p) => p.some((n) => !Number.isFinite(n) || Math.abs(n) > 250))) throw new SceneRefusalError(root.name, 'a mover\'s path leaves the 500 m cell', 'Keep every point within 250 m of the cell\'s centre');
  if (path.some((p, i) => i > 0 && p.every((n, k) => n === path[i - 1]?.[k]))) throw new SceneRefusalError(root.name, 'a mover\'s path stands still between two points', 'Drop the repeated point');
  const boxes = colliders.map((c) => ({ x: round(c.centre[0] - at[0]), y: round(c.centre[1] - at[1]), z: round(c.centre[2] - at[2]), hx: round(c.half[0]), hy: round(c.half[1]), hz: round(c.half[2]), rot: c.rotation }));
  return { at, boxes, path, seconds: options.seconds, start: options.start ?? 'stand', loop: options.loop ?? 'pingpong' };
}

/** SS9d: a touchable panel's body, fitted round the part's world bounds (each half extent at most 8 m, the format's). */
function touchOf(root: Object3D, options: TouchableOptions): SceneTouch {
  const box = new Box3().setFromObject(root);
  if (box.isEmpty()) throw new SceneRefusalError(root.name, 'a touchable part has no bounds', 'Give it a mesh');
  const centre = box.getCenter(new Vector3()), half = box.getSize(new Vector3()).multiplyScalar(0.5);
  const fit = (n: number): number => Math.round(Math.min(Math.max(n, 0.005), 8) * 1e4) / 1e4;
  if (Math.max(half.x, half.y, half.z) > 8) throw new SceneRefusalError(root.name, 'a touchable part is over 16 m across', 'Make the touchable part smaller');
  const kind = options.shape ?? 'box';
  const shape: SceneTouch['shape'] = kind === 'ball' ? { ball: fit(Math.max(half.x, half.y, half.z)) }
    : kind === 'cylinder' ? { cylinder: { radius: fit(Math.max(half.x, half.z)), halfHeight: fit(half.y) } }
      : { cuboid: { x: fit(half.x), y: fit(half.y), z: fit(half.z) } };
  const round = (n: number): number => Math.round(n * 1e4) / 1e4;
  return { at: [round(centre.x), round(centre.y), round(centre.z)], shape, material: options.material,
    ...(options.density === undefined ? {} : { density: options.density }), ...(options.friction === undefined ? {} : { friction: options.friction }),
    ...(options.restitution === undefined ? {} : { restitution: options.restitution }), ...(options.damping === undefined ? {} : { damping: options.damping }) };
}

function groundHash(heightAt: (x: number, z: number) => number, colourAt: SceneGround['colourAt']): string {
  const samples: number[] = [];
  for (let z = -250; z <= 250; z += 2) for (let x = -250; x <= 250; x += 2) { samples.push(heightAt(x, z)); if (colourAt !== null) samples.push(...colourAt(x, z)); }
  return hashOf((h) => h.numbers(samples));
}

const DEFAULT_POST: ScenePost = { tone: 'aces', exposure: 1, bloom: null, vignette: 0 };

/** Format `look.details` limits (shard-format `look-details.ts`): a refusal names them before the schema would. */
const DETAIL_LIMITS = { layers: 8, side: 512, clumps: 64, triangles: 2000, vertices: 6000, cell: [0.5, 8], radius: [4, 200], scale: [0.05, 20], rate: [0.05, 10] } as const;

interface DetailRequest { readonly id: string; readonly mesh: InstancedMesh; readonly cell: number; readonly radius: number; readonly sway: { amount: number; rate: number } | null; readonly shadow: boolean }

/**
 * AP32c: one `world.detail` InstancedMesh as a detail layer. Its copies' world seats are counted per `cell`-metre square of
 * the box round them (the mask: the fullest cell is 255, `clumps` clumps), their mean height per cell (u16 over the
 * span), and the ranges their scale (the matrix's mean axis length), lean (the copy's up from world up) and colour span.
 */
function lowerDetail(request: DetailRequest, tables: Tables): SceneDetailScatter {
  const { id, mesh, cell } = request, path = `detail ${id}`;
  if (Array.isArray(mesh.material)) throw new SceneRefusalError(path, 'its mesh has several materials', 'Give a detail card one material');
  const material = lowerMaterial(mesh.material, path, tables), entry = tables.materials.get(material);
  if (entry?.entry !== null && entry?.entry !== undefined) throw new SceneRefusalError(path, 'a graph material on a detail card has no lowering yet', 'Draw the card with a MeshStandardMaterial');
  if (entry?.kind !== 'standard') throw new SceneRefusalError(path, `its card's ${mesh.material.type} has no detail lowering (a layer draws lit PBR cards)`, 'Draw the card with a MeshStandardMaterial');
  const geometry = lowerGeometry(mesh.geometry, path, tables), card = tables.geometries.get(geometry);
  const vertices = (card?.position.length ?? 0) / 3, triangles = card?.triangles ?? 0;
  if (triangles > DETAIL_LIMITS.triangles || vertices > DETAIL_LIMITS.vertices) throw new SceneRefusalError(path, `its card has ${triangles} triangles and ${vertices} vertices, over ${DETAIL_LIMITS.triangles} and ${DETAIL_LIMITS.vertices}`, 'Draw the clump as a few crossed cards');
  if (!(cell >= DETAIL_LIMITS.cell[0] && cell <= DETAIL_LIMITS.cell[1])) throw new SceneRefusalError(path, `its cell ${cell} m is outside ${DETAIL_LIMITS.cell[0]} to ${DETAIL_LIMITS.cell[1]} m`, 'Count clumps per 0.5 to 8 m square');
  if (!(request.radius >= DETAIL_LIMITS.radius[0] && request.radius <= DETAIL_LIMITS.radius[1])) throw new SceneRefusalError(path, `its radius ${request.radius} m is outside ${DETAIL_LIMITS.radius[0]} to ${DETAIL_LIMITS.radius[1]} m`, 'Grow it 4 to 200 m round the camera');
  const sway = request.sway;
  if (sway !== null && !(sway.amount >= 0 && sway.amount <= 1 && sway.rate >= DETAIL_LIMITS.rate[0] && sway.rate <= DETAIL_LIMITS.rate[1])) throw new SceneRefusalError(path, 'its sway is outside amount 0 to 1 and rate 0.05 to 10', 'Give sway an amount 0 to 1 and a rate in cycles a second');
  const count = mesh.count;
  if (count === 0) throw new SceneRefusalError(path, 'its InstancedMesh holds no copies', 'Fill the mesh before handing it to world.detail');
  // every copy's world matrix: the mesh's own (it may sit in a part) times the copy's
  mesh.updateMatrixWorld(true);
  const seat = new Matrix4(), local = new Matrix4(), position = new Vector3(), rotation = new Quaternion(), size = new Vector3(), up = new Vector3();
  const xs = new Float64Array(count), ys = new Float64Array(count), zs = new Float64Array(count);
  let scaleLow = Infinity, scaleHigh = 0, tilt = 0;
  for (let i = 0; i < count; i++) {
    seat.multiplyMatrices(mesh.matrixWorld, local.fromArray(mesh.instanceMatrix.array, i * 16));
    seat.decompose(position, rotation, size);
    xs[i] = position.x; ys[i] = position.y; zs[i] = position.z;
    const s = (Math.abs(size.x) + Math.abs(size.y) + Math.abs(size.z)) / 3;
    scaleLow = Math.min(scaleLow, s); scaleHigh = Math.max(scaleHigh, s);
    tilt = Math.max(tilt, Math.acos(Math.min(1, Math.max(-1, up.set(0, 1, 0).applyQuaternion(rotation).y))));
  }
  if (scaleLow < DETAIL_LIMITS.scale[0] || scaleHigh > DETAIL_LIMITS.scale[1]) throw new SceneRefusalError(path, `its copies scale ${scaleLow.toFixed(3)} to ${scaleHigh.toFixed(3)}, outside 0.05 to 20`, 'Size the card so its copies scale 0.05 to 20');
  // the grid: whole cells from the low corner of the copies' box, at most 512 a side
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < count; i++) { minX = Math.min(minX, xs[i] ?? 0); maxX = Math.max(maxX, xs[i] ?? 0); minZ = Math.min(minZ, zs[i] ?? 0); maxZ = Math.max(maxZ, zs[i] ?? 0); }
  const corner: [number, number] = [Math.floor(minX / cell) * cell, Math.floor(minZ / cell) * cell];
  const columns = Math.floor((maxX - corner[0]) / cell) + 1, rows = Math.floor((maxZ - corner[1]) / cell) + 1;
  if (columns > DETAIL_LIMITS.side || rows > DETAIL_LIMITS.side) throw new SceneRefusalError(path, `its copies span ${columns} × ${rows} cells of ${cell} m, over ${DETAIL_LIMITS.side} a side`, 'Use a bigger cell, or split the clumps into two layers');
  const counts = new Uint32Array(columns * rows), sums = new Float64Array(columns * rows);
  for (let i = 0; i < count; i++) {
    const c = Math.min(columns - 1, Math.floor(((xs[i] ?? 0) - corner[0]) / cell)), r = Math.min(rows - 1, Math.floor(((zs[i] ?? 0) - corner[1]) / cell)), at = r * columns + c;
    counts[at] = (counts[at] ?? 0) + 1; sums[at] = (sums[at] ?? 0) + (ys[i] ?? 0);
  }
  let clumps = 0;
  for (const n of counts) clumps = Math.max(clumps, n);
  if (clumps > DETAIL_LIMITS.clumps) throw new SceneRefusalError(path, `its fullest ${cell} m cell holds ${clumps} copies, over ${DETAIL_LIMITS.clumps}`, 'Use a smaller cell, or fewer, bigger clumps');
  let low = Infinity, high = -Infinity;
  for (let at = 0; at < counts.length; at++) if ((counts[at] ?? 0) > 0) { const mean = (sums[at] ?? 0) / (counts[at] ?? 1); low = Math.min(low, mean); high = Math.max(high, mean); }
  const mask = new Uint8Array(counts.length), heights = new Uint8Array(counts.length * 2), view = new DataView(heights.buffer);
  for (let at = 0; at < counts.length; at++) {
    const n = counts[at] ?? 0; mask[at] = Math.round((n / clumps) * 255);
    const mean = n > 0 ? (sums[at] ?? 0) / n : low;
    view.setUint16(at * 2, high > low ? Math.round(((mean - low) / (high - low)) * 65535) : 0, true);
  }
  // tint: each channel's lowest and highest instance colour (linear), or white
  let tint: [Rgb, Rgb] = [[1, 1, 1], [1, 1, 1]];
  const colours = mesh.instanceColor?.array;
  if (colours !== undefined) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < count; i++) for (let k = 0; k < 3; k++) { const v = colours[i * 3 + k] ?? 1; lo[k] = Math.min(lo[k] ?? v, v); hi[k] = Math.max(hi[k] ?? v, v); }
    tint = [[lo[0] ?? 1, lo[1] ?? 1, lo[2] ?? 1], [hi[0] ?? 1, hi[1] ?? 1, hi[2] ?? 1]];
  }
  return {
    id, path: mesh.name === '' ? path : mesh.name, geometry, material, region: { corner, cell, columns, rows, span: [low, Math.max(low, high)] }, mask, heights, clumps,
    scale: [scaleLow, scaleHigh], tilt: Math.min(1, tilt), tint, sway, radius: request.radius, shadow: request.shadow, instances: count,
  };
}

/** Run the author's build on a fresh scene and read it. Parts come in authored order; `scene` holds anything outside one. */
export function lowerShard(identity: ShardIdentityInput, build: (world: ShardWorld) => void): ShardScene {
  const scene = new Scene(), parts: Group[] = [], panels = new Map<Object3D, string>(), touchables = new Map<Object3D, TouchableOptions>(), movers = new Map<Object3D, MoverOptions>();
  // SS-GF0: the state writes of `sets` prompts, and the panels a field shows
  const writes: SceneStateWrite[] = [], shown = new Map<Object3D, ShownWhen>();
  let sky: SceneSky | null = null;
  let ground: SceneGround | null = null, post: ScenePost | null = null, spawn: ShardScene['spawn'] = { position: [0, 0, 0], yaw: 0 };
  // AP25: rows placed at nodes; read once the build has run and every matrix is current
  const triggers: { id: string; at: Object3D; radius: number; flag: string }[] = [], interactions: { id: string; at: Object3D; radius: number; label: string; scene: string; unless?: string }[] = [];
  const anchorIds = new Set<string>(), detailRequests: DetailRequest[] = [];
  const anchor = (kind: string, id: string): void => {
    if (!/^[a-z][a-zA-Z0-9.-]{0,127}$/u.test(id)) throw new SceneRefusalError(id, `a ${kind} id is not a shardfile id`, 'Name it like `slice.pond`: a lower-case letter, then letters, digits, dots and dashes');
    if (anchorIds.has(`${kind}:${id}`)) throw new SceneRefusalError(id, `two ${kind}s share this id`, `Give every world.${kind} its own id`);
    anchorIds.add(`${kind}:${id}`);
  };
  const world: ShardWorld = {
    scene,
    part: (name, fill, options = {}) => {
      if (!/^[a-z][a-z0-9-]{0,63}$/u.test(name)) throw new SceneRefusalError(name, 'a part name must be kebab-case', 'Name it like `hut` or `pond-lamps`');
      if (name === 'scene' || parts.some((p) => p.name === name)) throw new SceneRefusalError(name, 'two parts share this name', 'Give every world.part its own name');
      const { panel } = options;
      // AP16: the format's panel id (props `id`), one part each, at most 64 (props.panels)
      // a panel's collider takes its id, so it may not look like a part's collider (`scene.<part>`)
      if (panel !== undefined && (!/^[a-z][a-z0-9.-]{0,127}$/u.test(panel) || panel.startsWith('scene.'))) throw new SceneRefusalError(name, `panel id ${panel} is not a shardfile id`, 'Name it like `brasscap.gate`: lower case, digits, dots and dashes');
      if (panel !== undefined && [...panels.values()].includes(panel)) throw new SceneRefusalError(name, `two parts are panel ${panel}`, 'Give every panel part its own id');
      if (panel !== undefined && panels.size >= 64) throw new SceneRefusalError(name, 'a shard has at most 64 panels', 'Merge panels that hide together');
      const group = new Group(); group.name = name; parts.push(group); scene.add(group);
      if (panel !== undefined) panels.set(group, panel);
      // SS9d: a touchable part is a panel (its GLB is what moves), and the format holds at most 64 bodies (one a panel)
      if (options.touchable !== undefined) {
        if (panel === undefined) throw new SceneRefusalError(name, 'a touchable part is a panel', 'Give it a panel id too: world.part(name, build, { panel, touchable })');
        touchables.set(group, options.touchable);
      }
      // SS-GF2a: a mover part is a panel too (its GLB is what every page moves), and never touchable (one body moves it)
      if (options.mover !== undefined) {
        if (panel === undefined) throw new SceneRefusalError(name, 'a mover part is a panel', 'Give it a panel id too: world.part(name, build, { panel, mover })');
        if (options.touchable !== undefined) throw new SceneRefusalError(name, 'a part is a mover or touchable, not both', 'Drop one of the two options');
        if (movers.size >= 32) throw new SceneRefusalError(name, 'a shard has at most 32 movers', 'Merge movers that travel together');
        movers.set(group, options.mover);
      }
      // SS-GF0: a shown part is a panel (its GLB and collider are what show), read against its field once the build has run
      if (options.shownWhen !== undefined) {
        if (panel === undefined) throw new SceneRefusalError(name, 'a shown part is a panel', 'Give it a panel id too: world.part(name, build, { panel, shownWhen })');
        shown.set(group, options.shownWhen);
      }
      fill(group); return group;
    },
    ground: (heightAt, options = {}) => {
      // ss4d: the ground is a lit PBR surface (the cleanroom's ground mesh material), never the format's default toon
      const m = options.material;
      if (m !== undefined && !(m instanceof MeshStandardMaterial)) throw new SceneRefusalError('ground', `a ${(m as { type?: string }).type ?? 'material'} ground has no lowering`, 'Give world.ground a MeshStandardMaterial');
      // the shard's ground takes colour, roughness, metalness and detail only: anything else is refused, never dropped
      if (m?.map !== null && m?.map !== undefined) throw new SceneRefusalError('ground', 'a ground map has no lowering (the terrain has no uvs)', 'Say its grain with world.ground(h, { detail }), the PBR detail layer');
      if (m !== undefined && (m.emissive.getHex() !== 0 || m.transparent || m.side !== FrontSide)) throw new SceneRefusalError('ground', 'a ground material is opaque, one-sided and unlit by itself', 'Leave emissive black, transparent off and side FrontSide on the ground material');
      const surface = { colour: m === undefined ? [1, 1, 1] as Rgb : rgb(m.color), roughness: m?.roughness ?? 1, metalness: m?.metalness ?? 0, detail: options.detail ?? null };
      ground = { heightAt, colourAt: options.colourAt ?? null, surface, hash: groundHash(heightAt, options.colourAt ?? null) };
    },
    post: (settings) => { post = { ...DEFAULT_POST, ...post, ...settings }; },
    // AP14: the sky compiles at once, so a graph outside the vocabulary or the sky's budget is refused at its line
    sky: (colour, options = {}) => {
      const env = options.environment;
      sky = { graph: graph({ kind: 'material', model: 'unlit', surface: { colour } }, { budget: LOOK_SKY_BUDGET }),
        environment: env === undefined ? null : { intensity: env.intensity, ground: [env.ground[0], env.ground[1], env.ground[2]] } };
    },
    spawn: (x, y, z, yaw = 0) => { spawn = { position: [x, y, z], yaw }; },
    trigger: (id, at, options) => {
      anchor('trigger', id);
      if (!(options.radius >= 0.01 && options.radius <= 500)) throw new SceneRefusalError(id, `a trigger's radius ${options.radius} is outside 0.01 to 500 m`, 'Give it a radius in metres between 0.01 and 500');
      triggers.push({ id, at, radius: options.radius, flag: options.flag ?? id });
    },
    interact: (id, at, options) => {
      anchor('interact', id);
      if (!(options.radius >= 0.1 && options.radius <= 8)) throw new SceneRefusalError(id, `a use prompt's radius ${options.radius} is outside 0.1 to 8 m`, 'Give it a reach in metres between 0.1 and 8');
      if (options.label.length === 0 || options.label.length > 128) throw new SceneRefusalError(id, 'a use prompt\'s label is 1 to 128 characters', 'Shorten the label');
      const { sets, ...prompt } = options;
      if (sets === undefined && prompt.scene === undefined) throw new SceneRefusalError(id, 'a use prompt needs a scene or sets', 'Give it the scene it runs (from extend) or the state field it sets');
      if (sets !== undefined && prompt.scene !== undefined) throw new SceneRefusalError(id, 'a use prompt takes a scene or sets, not both', 'Drop one of the two');
      // SS-GF0: a `sets` prompt's scene is its own id; the generated script writes its field
      if (sets !== undefined) writes.push(stateWrite(id, sets, writes));
      interactions.push({ id, at, label: prompt.label, radius: prompt.radius, scene: prompt.scene ?? id, ...(prompt.unless === undefined ? {} : { unless: prompt.unless }) });
    },
    detail: (id, mesh, options) => {
      if (!/^[a-z0-9][a-z0-9._-]{0,63}$/u.test(id)) throw new SceneRefusalError(id, 'a detail id is not a look id', 'Name it like `moss-grass`: lower case, digits, dots, dashes and underscores');
      if (detailRequests.some((d) => d.id === id)) throw new SceneRefusalError(id, 'two detail layers share this id', 'Give every world.detail its own id');
      if (detailRequests.length >= DETAIL_LIMITS.layers) throw new SceneRefusalError(id, `a look holds at most ${DETAIL_LIMITS.layers} detail layers`, 'Merge layers that share a card');
      if (!(mesh instanceof InstancedMesh)) throw new SceneRefusalError(id, 'world.detail takes an InstancedMesh', 'Build the clumps as one InstancedMesh of a small card');
      detailRequests.push({ id, mesh, cell: options.cell, radius: options.radius, sway: options.sway ?? null, shadow: options.shadow ?? false });
    },
  };
  build(world);
  scene.updateMatrixWorld(true);
  // anything added to the scene outside a part is the part `scene`
  const loose = new Group(); loose.name = 'scene';
  for (const child of scene.children.slice()) if (!parts.includes(child as Group)) loose.add(child);
  const roots = loose.children.length > 0 ? [...parts, loose] : parts;
  scene.add(loose); scene.updateMatrixWorld(true);
  const tables: Tables = { materials: new Map(), textures: new Map(), geometries: new Map(), geometryKeys: new WeakMap(), materialKeys: new WeakMap(), textureKeys: new WeakMap(),
    details: new Set(detailRequests.map((request) => request.mesh)) };
  const lowered = roots.map((root) => {
    const part = lowerPart(root, tables, panels.get(root), touchables.get(root), movers.get(root)), when = shown.get(root);
    return when === undefined ? part : Object.assign(part, { shownWhen: shownValue(root.name, when, writes) });
  });
  const details = detailRequests.map((request) => lowerDetail(request, tables));
  const fog: SceneLook['fog'] = scene.fog instanceof FogExp2 ? { kind: 'exp2', colour: rgb(scene.fog.color), density: scene.fog.density }
    : scene.fog instanceof Fog ? { kind: 'linear', colour: rgb(scene.fog.color), near: scene.fog.near, far: scene.fog.far } : null;
  const background = scene.background !== null && typeof scene.background === 'object' && 'isColor' in scene.background ? rgb(scene.background as Color) : null;
  const placed = (id: string, at: Object3D): Vector3 => {
    let root: Object3D = at; while (root.parent !== null) root = root.parent;
    if (root !== scene) throw new SceneRefusalError(id, 'its node is not in the scene', 'Add the node to a part (or the scene) before the build returns');
    const p = at.getWorldPosition(new Vector3());
    if (Math.abs(p.x) > 250 || Math.abs(p.z) > 250 || Math.abs(p.y) > 250) throw new SceneRefusalError(id, 'its node stands outside the 500 m cell', 'Move the node inside the cell (x, y and z within 250 m)');
    return p;
  };
  const r3 = (n: number): number => Math.round(n * 1000) / 1000;
  const anchored: ShardScene['anchored'] = {
    ...(writes.length === 0 ? {} : { writes }),
    triggers: triggers.map((t) => { const p = placed(t.id, t.at); return { id: t.id, kind: 'region' as const, flag: t.flag, x: r3(p.x), z: r3(p.z), radius: t.radius }; }),
    interactions: interactions.map((i) => {
      const p = placed(i.id, i.at), row: { id: string; at: readonly [number, number, number]; radius: number; label: string; scene: string; unless?: string } = { id: i.id, at: [r3(p.x), r3(p.y), r3(p.z)], radius: i.radius, label: i.label, scene: i.scene };
      if (i.unless !== undefined) row.unless = i.unless;
      return row;
    }),
  };
  return {
    identity, parts: lowered, materials: Object.fromEntries(tables.materials), textures: Object.fromEntries(tables.textures),
    geometries: Object.fromEntries(tables.geometries), look: { fog, background, post, sky }, ground, spawn, anchored,
    ...(details.length === 0 ? {} : { details }),
  };
}

const FIELD_NAME = /^[a-z][a-z0-9.-]{0,127}$/u, I32_MAX = 0x7fffffff;
const whole = (n: unknown, low: number): n is number => typeof n === 'number' && Number.isInteger(n) && n >= low && n <= I32_MAX;
/** SS-GF0: one `sets` as the write it lowers to; a field keeps one scope and one kind (a flag or a count) across its uses. */
function stateWrite(use: string, sets: SetsOptions, before: readonly SceneStateWrite[]): SceneStateWrite {
  const { field, scope } = sets;
  if (typeof field !== 'string' || !FIELD_NAME.test(field)) throw new SceneRefusalError(use, `${String(field)} is not a state field name`, 'Name it like `glowfen.shrine.lit`: a lower-case letter, then lower case, digits, dots and dashes');
  if (scope !== 'player' && scope !== 'shared') throw new SceneRefusalError(use, `a field's scope ${String(scope)} is not player or shared`, 'Give sets a scope: \'player\' (the user\'s own) or \'shared\' (every player\'s)');
  let write: SceneStateWrite;
  if ('add' in sets) {
    if (!whole(sets.max, 1)) throw new SceneRefusalError(use, `a count's max ${String(sets.max)} is not a whole number of 1 or more`, 'Give sets the most the count reaches');
    if (!Number.isInteger(sets.add) || sets.add === 0 || Math.abs(sets.add) > sets.max) throw new SceneRefusalError(use, `a count's add ${String(sets.add)} is not a whole number from 1 to its max (or down to -max)`, 'Add a whole number');
    write = { use, field, scope, kind: 'count', add: sets.add, max: sets.max };
  } else if (typeof sets.value === 'boolean') write = { use, field, scope, kind: 'bool', value: Number(sets.value) };
  else if (whole(sets.value, 0)) write = { use, field, scope, kind: 'count', value: sets.value };
  else throw new SceneRefusalError(use, `a field's value ${String(sets.value)} is not true, false or a whole number of 0 or more`, 'Set a flag to true or false, or a count to a whole number');
  const earlier = before.find((w) => w.field === field);
  if (earlier !== undefined && earlier.scope !== scope) throw new SceneRefusalError(use, `field ${field} is ${earlier.scope} at ${earlier.use}: a field takes one scope`, 'Use one scope for the field, or name another field');
  if (earlier !== undefined && earlier.kind !== write.kind) throw new SceneRefusalError(use, `field ${field} holds true or false, or numbers, not both (${earlier.use} sets it as a ${earlier.kind === 'bool' ? 'flag' : 'count'})`, 'Set a flag with true or false only, a count with numbers only');
  return write;
}

/** SS-GF0: a shown part's value, as the field holds it (a flag 0 or 1, a count within its bounds). */
function shownValue(part: string, when: ShownWhen, writes: readonly SceneStateWrite[]): { field: string; equals: number } {
  const uses = writes.filter((w) => w.field === when.field), [first] = uses;
  if (first === undefined) throw new SceneRefusalError(part, `no use prompt sets ${String(when.field)}`, 'Show the part by a field a world.interact sets');
  if (first.kind === 'bool' && typeof when.equals !== 'boolean') throw new SceneRefusalError(part, `${when.field} is a flag: shownWhen equals true or false`, 'Give shownWhen equals: true or false');
  if (first.kind === 'count' && !(whole(when.equals, 0) && when.equals <= countMax(uses))) throw new SceneRefusalError(part, `${when.field} is a count from 0 to ${countMax(uses)}: shownWhen equals ${String(when.equals)} never holds`, 'Give shownWhen a whole number the count reaches');
  return { field: when.field, equals: Number(when.equals) };
}

/** SS-GF0: the most a count field holds: the largest of its uses' `max` and set values. */
export function countMax(uses: readonly SceneStateWrite[]): number {
  return Math.max(0, ...uses.map((w) => 'max' in w ? w.max : w.value));
}

/** One line per part and kind: what the walker read, for logs and tests. */
export function sceneSummary(shard: ShardScene): { part: string; draws: number; instances: number; triangles: number; sprites: number; lights: number; colliders: number; water: number; materials: number; textures: number }[] {
  return shard.parts.map((part) => ({
    part: part.name, draws: part.draws.length, instances: part.draws.reduce((n, d) => n + (d.instances?.count ?? 0), 0),
    triangles: part.draws.reduce((n, d) => n + (shard.geometries[d.geometry]?.triangles ?? 0) * (d.instances?.count ?? 1), 0),
    sprites: part.sprites.length + part.points.reduce((n, c) => n + c.positions.length / 3, 0), lights: part.lights.length, colliders: part.colliders.length, water: part.water.length, materials: part.materials.length, textures: part.textures.length,
  }));
}
