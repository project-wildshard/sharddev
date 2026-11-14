import {
  AdditiveBlending, AmbientLight, BackSide, Box3, DataTexture, DirectionalLight, DoubleSide, Fog, FogExp2, Group, HemisphereLight, InstancedMesh, Line, Matrix4,
  Mesh, MeshBasicMaterial, MeshStandardMaterial, type Object3D, PointLight, Points, Quaternion, Scene, SpotLight, Sprite, SpriteMaterial, Vector3,
  type BufferAttribute, type BufferGeometry, type Color, type InterleavedBufferAttribute, type Material, type Texture,
} from 'three';
import { isSolid, paintedPixels, Water, type ShardWorld } from './author';
import type {
  Rgb, SceneCollider, SceneDraw, SceneGeometry, SceneGround, SceneLight, SceneLook, SceneMaterial, ScenePart, ScenePost, SceneSprite, SceneTexture,
  SceneWater, ShardIdentityInput, ShardScene, Vec3,
} from './description';
import { ContentHash, hashOf } from './hash';

/**
 * AUTHORING-PARITY AP1: the walker. It runs the author's build function on a fresh `Scene`, then reads every object once
 * into a `ShardScene`. It refuses only what has no lowering yet, naming the object's path, its type and the row that
 * adds it, so an author is never left with a silently missing thing.
 */

/** A refusal: the object's path and the fix. */
export class SceneRefusalError extends Error {
  constructor(path: string, problem: string, fix: string) { super(`scene: ${path}: ${problem}. ${fix}`); this.name = 'SceneRefusalError'; }
}

const rgb = (colour: Color, scale = 1): Rgb => [colour.r * scale, colour.g * scale, colour.b * scale];
const v3 = (v: Vector3): Vec3 => [v.x, v.y, v.z];

interface Tables {
  materials: Map<string, SceneMaterial>; textures: Map<string, SceneTexture>; geometries: Map<string, SceneGeometry>;
  geometryKeys: WeakMap<BufferGeometry, string>; materialKeys: WeakMap<Material, string>; textureKeys: WeakMap<Texture, string>;
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

function lowerTexture(texture: Texture, path: string, tables: Tables): string {
  const known = tables.textureKeys.get(texture); if (known !== undefined) return known;
  let pixels = paintedPixels(texture.source);
  if (pixels === undefined && texture instanceof DataTexture) {
    const { data, width, height } = texture.image as { data: unknown; width: number; height: number };
    if ((data instanceof Uint8Array || data instanceof Uint8ClampedArray) && data.length === width * height * 4) pixels = { width, height, rgba: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) };
  }
  if (pixels === undefined) throw new SceneRefusalError(path, `texture ${texture.name || texture.constructor.name} has no pixels at compile time`, 'Paint it with paint(width, height, fn) from @wildshard/sdk/scene/shard (a CanvasTexture needs a browser), or hand in an RGBA8 DataTexture');
  const colourSpace = texture.colorSpace === 'srgb' ? 'srgb' : 'linear';
  const key = `t${hashOf((h) => { h.numbers([pixels.width, pixels.height]).text(colourSpace).bytes(pixels.rgba); })}`;
  if (!tables.textures.has(key)) tables.textures.set(key, { key, width: pixels.width, height: pixels.height, rgba: pixels.rgba, colourSpace });
  tables.textureKeys.set(texture, key);
  return key;
}

function lowerMaterial(material: Material, path: string, tables: Tables): string {
  const known = tables.materialKeys.get(material); if (known !== undefined) return known;
  let kind: SceneMaterial['kind'];
  if (material instanceof MeshStandardMaterial) kind = 'standard';
  else if (material instanceof MeshBasicMaterial) kind = 'basic';
  else if (material instanceof SpriteMaterial) kind = 'sprite';
  else throw new SceneRefusalError(path, `${material.type} has no lowering yet`, 'Use MeshStandardMaterial or MeshBasicMaterial; node (TSL) materials arrive with AP13');
  const m = material as MeshStandardMaterial & MeshBasicMaterial & SpriteMaterial;
  const map = m.map === null || m.map === undefined ? null : lowerTexture(m.map, path, tables);
  const standard = material instanceof MeshStandardMaterial;
  const fields: Omit<SceneMaterial, 'key' | 'name'> = {
    kind, colour: rgb(m.color), roughness: standard ? m.roughness : 1, metalness: standard ? m.metalness : 0,
    emissive: standard ? rgb(m.emissive) : [0, 0, 0], emissiveIntensity: standard ? m.emissiveIntensity : 0, map,
    repeat: m.map ? [m.map.repeat.x, m.map.repeat.y] : [1, 1], offset: m.map ? [m.map.offset.x, m.map.offset.y] : [0, 0],
    alphaTest: material.alphaTest, side: material.side === DoubleSide ? 'double' : material.side === BackSide ? 'back' : 'front',
    vertexColours: material.vertexColors, transparent: material.transparent, opacity: material.opacity,
    blending: material.blending === AdditiveBlending ? 'additive' : 'normal', depthWrite: material.depthWrite, fog: m.fog !== false,
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

function lowerPart(root: Object3D, tables: Tables): ScenePart {
  const draws: SceneDraw[] = [], sprites: SceneSprite[] = [], lights: SceneLight[] = [], colliders: SceneCollider[] = [], water: SceneWater[] = [];
  const visit = (object: Object3D): void => {
    const path = pathOf(object, root);
    if (!object.visible) {
      // an invisible solid is a collider only: said once, drawn never
      if (object instanceof Mesh && isSolid(object)) { object.geometry.computeBoundingBox(); colliders.push(colliderOf(path, object.matrixWorld, object.geometry.boundingBox ?? new Box3())); }
      return;
    }
    if (object instanceof Water) {
      // the format holds at most 64 outline points: 48 evenly spaced along the shape
      const points = object.shape.getSpacedPoints(48).slice(0, 48).map((p) => new Vector3(p.x, p.y, 0).applyMatrix4(object.matrixWorld));
      const geometry = object.geometry, position = geometry.getAttribute('position'), index = geometry.getIndex(), n = index?.count ?? position.count;
      const triangles = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { const p = new Vector3().fromBufferAttribute(position, index?.getX(i) ?? i).applyMatrix4(object.matrixWorld); triangles.set([p.x, p.y, p.z], i * 3); }
      const level = new Vector3().setFromMatrixPosition(object.matrixWorld).y;
      water.push({ path, outline: points.map((p) => [p.x, p.z] as const), level, tint: rgb(object.material.color), reflect: object.reflect, triangles });
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
      draws.push({ path, geometry, material, matrix: [...object.matrixWorld.elements], instances, castShadow: object.castShadow, receiveShadow: object.receiveShadow });
    } else if (object instanceof Sprite) {
      const material = lowerMaterial(object.material, path, tables), scale = new Vector3().setFromMatrixScale(object.matrixWorld);
      sprites.push({ path, material, position: v3(new Vector3().setFromMatrixPosition(object.matrixWorld)), scale: [scale.x, scale.y], center: [object.center.x, object.center.y] });
    } else if (object instanceof PointLight || object instanceof DirectionalLight || object instanceof HemisphereLight || object instanceof AmbientLight) {
      const position = v3(new Vector3().setFromMatrixPosition(object.matrixWorld));
      const kind: SceneLight['kind'] = object instanceof PointLight ? 'point' : object instanceof DirectionalLight ? 'directional' : object instanceof HemisphereLight ? 'hemisphere' : 'ambient';
      lights.push({ path, kind, colour: rgb(object.color), groundColour: object instanceof HemisphereLight ? rgb(object.groundColor) : null, intensity: object.intensity,
        distance: object instanceof PointLight ? object.distance : 0, decay: object instanceof PointLight ? object.decay : 0, position,
        target: object instanceof DirectionalLight ? v3(object.target.getWorldPosition(new Vector3())) : null, castShadow: object.castShadow });
    } else if (object instanceof SpotLight) {
      throw new SceneRefusalError(path, 'SpotLight has no lowering yet', 'Use a PointLight; spot lamps are an engine row after M1');
    } else if (object instanceof Points || object instanceof Line) {
      throw new SceneRefusalError(path, `${object.type} has no lowering yet`, 'Motes and lines arrive with AP11; leave them out of the part until then');
    } else if (isSolid(object)) {
      colliders.push(colliderOf(path, new Matrix4(), new Box3().setFromObject(object))); // a solid group is one world box; its meshes still draw
    }
    for (const child of object.children) visit(child);
  };
  visit(root);
  const materials = [...new Set([...draws.map((d) => d.material), ...sprites.map((s) => s.material)])];
  const textures = [...new Set(materials.map((key) => tables.materials.get(key)?.map).filter((key): key is string => typeof key === 'string'))];
  const geometries = [...new Set(draws.map((d) => d.geometry))];
  const hash = new ContentHash().text(root.name);
  for (const draw of draws) {
    hash.text(draw.geometry).text(draw.material).numbers(draw.matrix).numbers([draw.castShadow ? 1 : 0, draw.receiveShadow ? 1 : 0]);
    if (draw.instances !== null) { hash.bytes(draw.instances.matrices); if (draw.instances.colours !== null) hash.bytes(draw.instances.colours); }
  }
  hash.json(sprites).json(lights).json(colliders).json(water.map((w) => ({ ...w, triangles: [...w.triangles] })));
  return { name: root.name, hash: hash.hex(), draws, sprites, lights, colliders, water, materials, textures, geometries };
}

function groundHash(heightAt: (x: number, z: number) => number, colourAt: SceneGround['colourAt']): string {
  const samples: number[] = [];
  for (let z = -250; z <= 250; z += 2) for (let x = -250; x <= 250; x += 2) { samples.push(heightAt(x, z)); if (colourAt !== null) samples.push(...colourAt(x, z)); }
  return hashOf((h) => h.numbers(samples));
}

const DEFAULT_POST: ScenePost = { tone: 'aces', exposure: 1, bloom: null, vignette: 0 };

/** Run the author's build on a fresh scene and read it. Parts come in authored order; `scene` holds anything outside one. */
export function lowerShard(identity: ShardIdentityInput, build: (world: ShardWorld) => void): ShardScene {
  const scene = new Scene(), parts: Group[] = [];
  let ground: SceneGround | null = null, post: ScenePost | null = null, spawn: ShardScene['spawn'] = { position: [0, 0, 0], yaw: 0 };
  const world: ShardWorld = {
    scene,
    part: (name, fill) => {
      if (!/^[a-z][a-z0-9-]{0,63}$/u.test(name)) throw new SceneRefusalError(name, 'a part name must be kebab-case', 'Name it like `hut` or `pond-lamps`');
      if (name === 'scene' || parts.some((p) => p.name === name)) throw new SceneRefusalError(name, 'two parts share this name', 'Give every world.part its own name');
      const group = new Group(); group.name = name; parts.push(group); scene.add(group); fill(group); return group;
    },
    ground: (heightAt, options = {}) => { ground = { heightAt, colourAt: options.colourAt ?? null, hash: groundHash(heightAt, options.colourAt ?? null) }; },
    post: (settings) => { post = { ...DEFAULT_POST, ...post, ...settings }; },
    spawn: (x, y, z, yaw = 0) => { spawn = { position: [x, y, z], yaw }; },
  };
  build(world);
  scene.updateMatrixWorld(true);
  // anything added to the scene outside a part is the part `scene`
  const loose = new Group(); loose.name = 'scene';
  for (const child of scene.children.slice()) if (!parts.includes(child as Group)) loose.add(child);
  const roots = loose.children.length > 0 ? [...parts, loose] : parts;
  scene.add(loose); scene.updateMatrixWorld(true);
  const tables: Tables = { materials: new Map(), textures: new Map(), geometries: new Map(), geometryKeys: new WeakMap(), materialKeys: new WeakMap(), textureKeys: new WeakMap() };
  const lowered = roots.map((root) => lowerPart(root, tables));
  const fog: SceneLook['fog'] = scene.fog instanceof FogExp2 ? { kind: 'exp2', colour: rgb(scene.fog.color), density: scene.fog.density }
    : scene.fog instanceof Fog ? { kind: 'linear', colour: rgb(scene.fog.color), near: scene.fog.near, far: scene.fog.far } : null;
  const background = scene.background !== null && typeof scene.background === 'object' && 'isColor' in scene.background ? rgb(scene.background as Color) : null;
  return {
    identity, parts: lowered, materials: Object.fromEntries(tables.materials), textures: Object.fromEntries(tables.textures),
    geometries: Object.fromEntries(tables.geometries), look: { fog, background, post }, ground, spawn,
  };
}

/** One line per part and kind: what the walker read, for logs and tests. */
export function sceneSummary(shard: ShardScene): { part: string; draws: number; instances: number; triangles: number; sprites: number; lights: number; colliders: number; water: number; materials: number; textures: number }[] {
  return shard.parts.map((part) => ({
    part: part.name, draws: part.draws.length, instances: part.draws.reduce((n, d) => n + (d.instances?.count ?? 0), 0),
    triangles: part.draws.reduce((n, d) => n + (shard.geometries[d.geometry]?.triangles ?? 0) * (d.instances?.count ?? 1), 0),
    sprites: part.sprites.length, lights: part.lights.length, colliders: part.colliders.length, water: part.water.length, materials: part.materials.length, textures: part.textures.length,
  }));
}
