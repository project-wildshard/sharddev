import { AmbientLight, Bone, BufferAttribute, BufferGeometry, Color, DirectionalLight, Fog, FogExp2, Group, HemisphereLight, InstancedMesh, LOD, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, MeshToonMaterial, Object3D, PointLight, Scene, Skeleton, SkinnedMesh, SpotLight, type Light, type TypedArray } from 'three';
import type { SceneDescription, SceneGeometry, SceneMaterial, SceneNode } from './scene';
import { restoreSceneAnimations } from './sceneAnimation';
import { restoreSceneDeclaration } from './sceneDeclarations';
import { catalogueMaterial } from './materials';

function isSkin(object: Object3D | undefined): object is SkinnedMesh { return object instanceof SkinnedMesh; }
function isBone(object: Object3D | undefined): object is Bone { return object instanceof Bone; }

function storage(name: string, values: number[]): TypedArray {
  switch (name) {
    case 'Float32Array': return new Float32Array(values);
    case 'Float64Array': return new Float64Array(values);
    case 'Int8Array': return new Int8Array(values);
    case 'Uint8Array': return new Uint8Array(values);
    case 'Uint8ClampedArray': return new Uint8ClampedArray(values);
    case 'Int16Array': return new Int16Array(values);
    case 'Uint16Array': return new Uint16Array(values);
    case 'Int32Array': return new Int32Array(values);
    case 'Uint32Array': return new Uint32Array(values);
    default: throw new Error(`Unknown scene channel storage ${name}`);
  }
}

function geometryOf(row: SceneGeometry): BufferGeometry {
  const geometry = new BufferGeometry();
  for (const [name, attribute] of Object.entries(row.attributes)) {
    if (!Number.isSafeInteger(attribute.itemSize) || attribute.itemSize < 1 || attribute.itemSize > 16 || attribute.array.length % attribute.itemSize !== 0 || !attribute.array.every(Number.isFinite)) throw new Error('Malformed scene geometry channel');
    const array = storage(attribute.storage, attribute.array);
    if (!array.every((value, index) => value === attribute.array[index])) throw new Error('Scene channel cannot be represented in its declared storage');
    geometry.setAttribute(name, new BufferAttribute(array, attribute.itemSize, attribute.normalized));
  }
  if (row.index !== null) geometry.setIndex(row.index);
  for (const group of row.groups) geometry.addGroup(group.start, group.count, group.materialIndex);
  geometry.setDrawRange(row.drawRange.start, row.drawRange.count ?? Infinity);
  return geometry;
}

function materialOf(row: SceneMaterial): MeshStandardMaterial | MeshToonMaterial | MeshBasicMaterial {
  const material = row.entry !== undefined ? catalogueMaterial(row.entry) : row.type === 'MeshStandardMaterial' ? new MeshStandardMaterial() : row.type === 'MeshToonMaterial' ? new MeshToonMaterial() : row.type === 'MeshBasicMaterial' ? new MeshBasicMaterial() : null;
  if (material === null) throw new Error(`Unknown scene material ${row.type}`);
  material.name = row.name; material.color.fromArray(row.color); material.opacity = row.opacity; material.transparent = row.transparent; material.side = row.side; material.vertexColors = row.vertexColors;
  const { emissive, emissiveIntensity, alphaTest, flatShading, roughness, metalness } = row.parameters;
  if (!(material instanceof MeshBasicMaterial) && Array.isArray(emissive)) material.emissive.fromArray(emissive);
  if (!(material instanceof MeshBasicMaterial) && typeof emissiveIntensity === 'number') material.emissiveIntensity = emissiveIntensity;
  if (typeof alphaTest === 'number') material.alphaTest = alphaTest;
  if (material instanceof MeshStandardMaterial) {
    if (typeof flatShading === 'boolean') material.flatShading = flatShading;
    if (typeof roughness === 'number') material.roughness = roughness;
    if (typeof metalness === 'number') material.metalness = metalness;
  }
  return material;
}

function lightOf(row: SceneNode): Light {
  const data = row.light;
  if (data === undefined) throw new Error('Missing scene light');
  const color = new Color().fromArray(data.color), p = data.parameters;
  const number = (name: string, fallback: number): number => typeof p[name] === 'number' ? p[name] : fallback;
  if (row.type === 'AmbientLight') return new AmbientLight(color, data.intensity);
  if (row.type === 'HemisphereLight') return new HemisphereLight(color, new Color().fromArray(Array.isArray(p['groundColor']) ? p['groundColor'] : [1, 1, 1]), data.intensity);
  const light = row.type === 'DirectionalLight' ? new DirectionalLight(color, data.intensity)
    : row.type === 'PointLight' ? new PointLight(color, data.intensity, number('distance', 0), number('decay', 2))
      : row.type === 'SpotLight' ? new SpotLight(color, data.intensity, number('distance', 0), number('angle', Math.PI / 3), number('penumbra', 0), number('decay', 2)) : null;
  if (light === null) throw new Error(`Unknown scene light ${row.type}`);
  if (light instanceof DirectionalLight || light instanceof SpotLight) {
    const at = p['target'];
    if (!Array.isArray(at)) throw new Error('Missing scene light target');
    light.target.position.fromArray(at); light.target.updateMatrixWorld(true);
  }
  return light;
}

/** Rebuild the draw/animation graph and defining SDK declarations from persisted scene JSON in Node.
 * Declaration classes emit compiler rows again; restoration never installs runtime hosts.
 * It retains sharing, skeleton joint order, inverse binds and authored TRS without resampling clips. */
export function restoreSceneGraph(data: SceneDescription): Object3D {
  if (data.nodes.length === 0) throw new Error('Empty scene description');
  const geometries = data.geometries.map(geometryOf), materials = data.materials.map(materialOf), nodes = new Map<string, Object3D>();
  const rows = new Map(data.nodes.map(row => [row.id, row])), constructing = new Set<string>();
  if (rows.size !== data.nodes.length) throw new Error('Duplicate scene node identity');
  let root: Object3D | undefined;
  const linked = new Set<string>();
  function create(row: SceneNode): Object3D {
    const cached = nodes.get(row.id); if (cached !== undefined) return cached;
    if (constructing.has(row.id)) throw new Error('Cyclic scene declaration dependency');
    constructing.add(row.id);
    if (row.matrix.length !== 16 || !row.matrix.every(Number.isFinite)) throw new Error('Malformed scene node identity or matrix');
    let object: Object3D;
    if (row.declaration !== undefined && (row.geometry !== undefined || row.light !== undefined)) throw new Error('SDK declaration cannot replace a draw resource');
    if (row.declaration !== undefined) object = restoreSceneDeclaration(row.declaration, id => {
      const child = rows.get(id); if (child === undefined || child.parent !== row.id) throw new Error('Mover body must be its graph child'); return create(child);
    });
    else if (row.geometry !== undefined) {
      const geometry = geometries[row.geometry], selected = row.materials?.map(index => materials[index]);
      if (geometry === undefined || selected === undefined || selected.length === 0 || selected.some(material => material === undefined)) throw new Error('Missing scene mesh resource');
      const valid = selected.filter((material): material is MeshStandardMaterial | MeshToonMaterial | MeshBasicMaterial => material !== undefined);
      const material = valid.length === 1 ? valid[0] : valid;
      if (material === undefined) throw new Error('Missing scene mesh material');
      object = row.skin !== undefined ? new SkinnedMesh(geometry, material) : row.instances !== undefined ? new InstancedMesh(geometry, material, row.instances.length) : new Mesh(geometry, material);
      if (object instanceof InstancedMesh && row.instances !== undefined) {
        const instances = object;
        row.instances.forEach((matrix, index) => { instances.setMatrixAt(index, new Matrix4().fromArray(matrix)); });
        row.instanceColors?.forEach((color, index) => { instances.setColorAt(index, new Color().fromArray(color)); });
      }
    } else object = row.light !== undefined ? lightOf(row) : row.type === 'Bone' ? new Bone() : row.type === 'LOD' ? new LOD() : row.type === 'Scene' ? new Scene() : row.type === 'Group' ? new Group() : new Object3D();
    object.name = row.name; object.visible = row.visible; object.castShadow = row.castShadow; object.receiveShadow = row.receiveShadow; object.matrix.fromArray(row.matrix);
    if (row.transform === undefined) object.matrixAutoUpdate = false;
    else { object.position.fromArray(row.transform.position); object.quaternion.fromArray(row.transform.quaternion); object.scale.fromArray(row.transform.scale); }
    object.animations = restoreSceneAnimations(row.animations ?? []);
    nodes.set(row.id, object);
    constructing.delete(row.id);
    return object;
  }
  for (const row of data.nodes) {
    const object = create(row);
    if (row.parent === null) { if (root !== undefined) throw new Error('Multiple scene roots'); root = object; }
    else { const parent = nodes.get(row.parent); if (parent === undefined || !linked.has(row.parent)) throw new Error('Scene parent must precede its child'); parent.add(object); }
    linked.add(row.id);
  }
  if (root === undefined) throw new Error('Missing scene root');
  root.updateMatrixWorld(true);
  for (const row of data.nodes) {
    const object = nodes.get(row.id);
    if (row.skin !== undefined) {
      if (!isSkin(object)) throw new Error('Skin requires a mesh');
      const bones = row.skin.bones.map(id => { const bone = nodes.get(id); if (!isBone(bone)) throw new Error('Unknown scene skin joint'); return bone; });
      if (bones.length === 0 || bones.length !== row.skin.inverses.length || new Set(bones).size !== bones.length) throw new Error('Malformed scene skeleton');
      object.skeleton = new Skeleton(bones, row.skin.inverses.map(values => new Matrix4().fromArray(values)));
      object.bindMode = row.skin.bindMode; object.bindMatrix.fromArray(row.skin.bindMatrix); object.bindMatrixInverse.fromArray(row.skin.bindMatrixInverse);
    }
    if (row.levels !== undefined) {
      if (!(object instanceof LOD)) throw new Error('LOD levels require an LOD object');
      for (const level of row.levels) { const child = nodes.get(level.object); if (child === undefined) throw new Error('Unknown LOD child'); object.addLevel(child, level.distance, level.hysteresis); }
    }
  }
  if (root instanceof Scene && data.fog !== null) root.fog = data.fog.kind === 'linear' ? new Fog(new Color().fromArray(data.fog.color), data.fog.near, data.fog.far) : new FogExp2(new Color().fromArray(data.fog.color), data.fog.density);
  return root;
}
