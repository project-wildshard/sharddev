import { AmbientLight, Bone, type BufferGeometry, DirectionalLight, Fog, FogExp2, HemisphereLight, InstancedMesh, InterleavedBufferAttribute, Light, Line, LOD, Material, Mesh, MeshBasicMaterial, MeshStandardMaterial, MeshToonMaterial, PointLight, Points, Scene, ShaderMaterial, SkinnedMesh, SpotLight, Sprite, Matrix4, Vector3, type Object3D, type Side } from 'three';
import { updateAuthoringMatrix } from './sceneTransform';
import { Collider, type ColliderData } from './physics';
import { Entry, type EntryData } from './entries';
import { PlayerStart, Spawn, spawnPlacement, type SpawnPlacement } from './spawns';
import { readSceneAnimations, readSceneSkin, type SceneAnimation, type SceneSkin } from './sceneAnimation';
import { AmbienceZone, Cue, Score } from './sceneAudio';
import type { AudioData } from './audio';
import { readSceneDeclaration, type SceneDeclaration } from './sceneDeclarations';
import { Grapple, Mount, Updraft, Zipline, Ladder } from './modes';
import { parseModes, type ModeRows } from '@wildshard/format/modes';
import { parseLightRows, type LightRow } from '@wildshard/format/lights';
import type { MaterialEntry } from '@wildshard/format/materials';
import { isCatalogueMaterial } from './materials';
/** One geometry channel, including normalized attributes and its original typed-array representation. */
export interface SceneAttribute {
    itemSize: number;
    normalized: boolean;
    array: number[];
    storage: string;
}
/** BufferGeometry data without transient three.js UUIDs or browser resources. */
export interface SceneGeometry {
    attributes: Record<string, SceneAttribute>;
    index: number[] | null;
    groups: {
        start: number;
        count: number;
        materialIndex?: number;
    }[];
    drawRange: {
        start: number;
        count: number | null;
    };
}
/** Ordinary material parameters; arbitrary shader code and callbacks are never authoring data. */
export interface SceneMaterial {
    type: string;
    name: string;
    color: number[];
    opacity: number;
    transparent: boolean;
    side: Side;
    vertexColors: boolean;
    parameters: Record<string, number | boolean | number[]>;
    /** The catalogue entry an SDK material (`@wildshard/sdk/materials`) bakes to: a family, a graph preset or a graph. */
    entry?: MaterialEntry;
}
/** A graph node uses unique author names as identity; repeated display names receive deterministic traversal IDs. */
export interface SceneNode {
    /** Original local SDK recipe; restored with this node's hierarchy and transform. */
    declaration?: SceneDeclaration;
    id: string;
    parent: string | null;
    name: string;
    type: string;
    matrix: number[];
    transform?: { position: number[]; quaternion: number[]; scale: number[] };
    visible: boolean;
    castShadow: boolean;
    receiveShadow: boolean;
    geometry?: number;
    materials?: number[];
    instances?: number[][];
    instanceColors?: number[][];
    skin?: SceneSkin;
    animations?: SceneAnimation[];
    levels?: {
        object: string;
        distance: number;
        hysteresis: number;
    }[];
    light?: {
        color: number[];
        intensity: number;
        parameters: Record<string, number | number[] | string>;
    };
}
/** Inspectable build intermediate. It contains no executable callbacks, handles or randomly generated UUIDs. */
export interface SceneDescription {
    version: 1;
    nodes: SceneNode[];
    geometries: SceneGeometry[];
    materials: SceneMaterial[];
    colliders: {
        id: string;
        shape: ColliderData;
    }[];
    spawns: ({
        id: string;
        kind: string;
    } & SpawnPlacement)[];
    playerStart: SpawnPlacement | null;
    entries: EntryData[];
    audio?: AudioData;
    /** Point and spot light rows (`@wildshard/format/lights`) in graph order, world space; absent when none is placed. */
    lights?: LightRow[];
    /** Admitted player-mode rows collected in graph order; absent when no mode is authored. */
    modes?: ModeRows;
    fog: {
        kind: 'linear';
        color: number[];
        near: number;
        far: number;
    } | {
        kind: 'exponential';
        color: number[];
        density: number;
    } | null;
}
function isMesh(object: Object3D): object is Mesh { return object instanceof Mesh; }
function isSkin(object: Object3D): object is SkinnedMesh { return object instanceof SkinnedMesh; }
function isBone(object: Object3D): object is Bone { return object instanceof Bone; }
/** Preserve each scalar read and native ToLength behavior while avoiding a
 * generic Array.from callback for ordinary bounded array lengths. */
function copyGeometryArray(length: number, read: (index: number) => number): number[] {
    if (!Number.isSafeInteger(length) || length < 0 || length >= 2 ** 32)
        return Array.from({ length }, (_, index) => read(index));
    const values: number[] = [];
    values.length = length;
    for (let index = 0; index < length; index++) values[index] = read(index);
    return values;
}
function geometryData(geometry: BufferGeometry): SceneGeometry {
    const attributes: Record<string, SceneAttribute> = {};
    for (const name of Object.keys(geometry.attributes).sort()) {
        const attribute = geometry.getAttribute(name);
        // Preserve integer storage, including normalized weights; component getters decode those integers.
        const array = copyGeometryArray(attribute.count * attribute.itemSize, i => attribute instanceof InterleavedBufferAttribute
            ? attribute.data.array[Math.floor(i / attribute.itemSize) * attribute.data.stride + attribute.offset + i % attribute.itemSize] ?? Number.NaN
            : attribute.array[i] ?? Number.NaN);
        if (!array.every(Number.isFinite))
            throw new Error(`Nonfinite geometry attribute ${name}`);
        attributes[name] = { itemSize: attribute.itemSize, normalized: attribute.normalized, array, storage: attribute.array.constructor.name };
    }
    if (Object.keys(geometry.morphAttributes).length > 0)
        throw new Error('Scene reader does not yet compile morph targets');
    const index = geometry.getIndex();
    return { attributes, index: index === null ? null : copyGeometryArray(index.count, i => index.getX(i)), groups: geometry.groups.map(group => ({ start: group.start, count: group.count, ...(group.materialIndex === undefined ? {} : { materialIndex: group.materialIndex }) })), drawRange: { start: geometry.drawRange.start, count: geometry.drawRange.count === Infinity ? null : geometry.drawRange.count } };
}
function materialData(material: Material): SceneMaterial {
    if (material instanceof ShaderMaterial || material.onBeforeCompile !== Material.prototype.onBeforeCompile)
        throw new Error('Raw shaders and material callbacks are trusted runtime code');
    if (!(material instanceof MeshStandardMaterial) && !(material instanceof MeshToonMaterial) && !(material instanceof MeshBasicMaterial))
        throw new Error(`Unsupported authoring material ${material.type}`);
    if (material.type !== 'MeshStandardMaterial' && material.type !== 'MeshToonMaterial' && material.type !== 'MeshBasicMaterial')
        throw new Error(`Material requires a dedicated compiler: ${material.type}`);
    if (material.map !== null || material.alphaMap !== null || material.aoMap !== null || (!(material instanceof MeshBasicMaterial) && (material.normalMap !== null || material.emissiveMap !== null || material.bumpMap !== null || material.displacementMap !== null)) || (material instanceof MeshBasicMaterial && (material.envMap !== null || material.lightMap !== null || material.specularMap !== null)))
        throw new Error('Scene reader requires independently compiled texture declarations');
    if (material instanceof MeshStandardMaterial && (material.roughnessMap !== null || material.metalnessMap !== null) || material instanceof MeshToonMaterial && material.gradientMap !== null)
        throw new Error('Scene reader requires independently compiled texture declarations');
    const parameters: SceneMaterial['parameters'] = { flatShading: material instanceof MeshStandardMaterial && material.flatShading, alphaTest: material.alphaTest, ...(material instanceof MeshBasicMaterial ? {} : { emissive: [...material.emissive], emissiveIntensity: material.emissiveIntensity }) };
    if (material instanceof MeshStandardMaterial) {
        parameters['roughness'] = material.roughness;
        parameters['metalness'] = material.metalness;
    }
    const row: SceneMaterial = { type: material.type, name: material.name, color: [...material.color], opacity: material.opacity, transparent: material.transparent, side: material.side, vertexColors: material.vertexColors, parameters };
    if (isCatalogueMaterial(material)) row.entry = material.toMaterialEntry();
    return row;
}
/** Walk an ordinary three.js hierarchy in Node. Updates world matrices; never installs services or draws a frame.
 * Unsupported authoring features fail explicitly instead of silently changing a collider, material or spawn. */
export function readScene(scene: Object3D): SceneDescription {
    updateAuthoringMatrix(scene);
    scene.updateMatrixWorld(true);
    const objects: Object3D[] = [];
    scene.traverse(object => objects.push(object));
    const ids = new Map<Object3D, string>(), counts = new Map<string, number>();
    for (const object of objects) if (object.name) counts.set(object.name, (counts.get(object.name) ?? 0) + 1);
    const used = new Set([...counts].filter(([, count]) => count === 1).map(([name]) => name));
    for (const [index, object] of objects.entries()) {
        if (object.name && counts.get(object.name) === 1) ids.set(object, object.name);
        else {
            let id = `node.${index}`;
            while (used.has(id)) id += '.';
            used.add(id); ids.set(object, id);
        }
    }
    const out: SceneDescription = { version: 1, nodes: [], geometries: [], materials: [], colliders: [], spawns: [], playerStart: null, entries: [], fog: null };
    const boneIds = new Map<Bone, string>();
    for (const object of objects) if (isBone(object)) { const id = ids.get(object); if (id === undefined) throw new Error('Unindexed bone'); boneIds.set(object, id); }
    const geometries = new Map<BufferGeometry, number>(), materials = new Map<Material, number>();
    const lights: LightRow[] = [];
    const cues: AudioData['cues'] = [], zones: NonNullable<AudioData['zones']>['zones'] = [];
    const modes: ModeRows = { traverse: [] }, ride: NonNullable<ModeRows['ride']> = [], grapple: NonNullable<ModeRows['grapple']> = [];
    let score: Score | undefined;
    for (const object of objects) {
        const id = ids.get(object);
        if (id === undefined)
            throw new Error('Unindexed scene node');
        if (!object.matrix.elements.every(Number.isFinite))
            throw new Error('Scene requires finite matrices');
        if (object instanceof Line || object instanceof Points || object instanceof Sprite) throw new Error(`Unsupported draw primitive ${object.type}`);
        const node: SceneNode = { id, parent: object === scene ? null : ids.get(object.parent ?? scene) ?? null, name: object.name, type: object.type, matrix: [...(object === scene ? object.matrixWorld : object.matrix).elements], visible: object.visible, castShadow: object.castShadow, receiveShadow: object.receiveShadow };
        if (object.matrixAutoUpdate && (object !== scene || object.parent === null)) node.transform = { position: object.position.toArray(), quaternion: object.quaternion.toArray(), scale: object.scale.toArray() };
        const declaration = readSceneDeclaration(object, ids);
        if (declaration !== undefined) node.declaration = declaration;
        if (object.animations.length > 0) node.animations = readSceneAnimations(object.animations);
        if (isSkin(object)) node.skin = readSceneSkin(object, boneIds);
        if (isMesh(object)) {
            let geometry = geometries.get(object.geometry);
            if (geometry === undefined) {
                geometry = out.geometries.length;
                geometries.set(object.geometry, geometry);
                out.geometries.push(geometryData(object.geometry));
            }
            node.geometry = geometry;
            node.materials = (Array.isArray(object.material) ? object.material : [object.material]).map(material => {
                let index = materials.get(material);
                if (index === undefined) {
                    index = out.materials.length;
                    materials.set(material, index);
                    out.materials.push(materialData(material));
                }
                return index;
            });
            if (object instanceof InstancedMesh) {
                const matrix = new Matrix4();
                node.instances = [];
                for (let i = 0; i < object.count; i++) {
                    object.getMatrixAt(i, matrix);
                    if (!matrix.elements.every(Number.isFinite))
                        throw new Error('Nonfinite instance transform');
                    node.instances.push([...matrix.elements]);
                }
                const colors = object.instanceColor;
                if (colors !== null)
                    node.instanceColors = Array.from({ length: object.count }, (_, i) => [colors.getX(i), colors.getY(i), colors.getZ(i)]);
            }
        }
        if (object instanceof LOD)
            node.levels = object.levels.map(level => {
                const target = ids.get(level.object);
                if (target === undefined)
                    throw new Error('LOD object is outside the scene');
                return { object: target, distance: level.distance, hysteresis: level.hysteresis };
            });
        if (object instanceof Light) {
            if (!(object instanceof AmbientLight || object instanceof HemisphereLight || object instanceof DirectionalLight || object instanceof PointLight || object instanceof SpotLight))
                throw new Error(`Unsupported authoring light ${object.type}`);
            const parameters: NonNullable<SceneNode['light']>['parameters'] = {};
            if (object instanceof HemisphereLight)
                parameters['groundColor'] = [...object.groundColor];
            if (object instanceof PointLight || object instanceof SpotLight) {
                parameters['distance'] = object.distance;
                parameters['decay'] = object.decay;
            }
            if (object instanceof SpotLight) {
                parameters['angle'] = object.angle;
                parameters['penumbra'] = object.penumbra;
            }
            if (object instanceof DirectionalLight || object instanceof SpotLight) {
                updateAuthoringMatrix(object.target);
                parameters['target'] = [object.target.matrixWorld.elements[12], object.target.matrixWorld.elements[13], object.target.matrixWorld.elements[14]];
            }
            node.light = { color: [...object.color], intensity: object.intensity, parameters };
            if (object instanceof PointLight || object instanceof SpotLight) {
                const base = { id, position: new Vector3().setFromMatrixPosition(object.matrixWorld).toArray(), colour: [object.color.r, object.color.g, object.color.b] as [number, number, number], intensity: object.intensity, distance: object.distance, decay: object.decay };
                lights.push(object instanceof SpotLight
                    ? { kind: 'spot', ...base, target: new Vector3().setFromMatrixPosition(object.target.matrixWorld).toArray(), angle: object.angle, penumbra: object.penumbra }
                    : { kind: 'point', ...base });
            }
        }
        if (object instanceof Collider) {
            if (!object.name)
                throw new Error('Collider requires a stable name');
            if (out.colliders.some(row => row.id === object.name))
                throw new Error(`Duplicate collider identity ${object.name}`);
            out.colliders.push({ id: object.name, shape: object.toColliderData() });
        }
        if (object instanceof PlayerStart) {
            if (out.playerStart !== null)
                throw new Error('Scene permits only one player start');
            out.playerStart = spawnPlacement(object);
        }
        if (object instanceof Spawn) {
            if (!object.name)
                throw new Error('Spawn requires a stable name');
            if (object.kind.length === 0)
                throw new Error('Spawn requires a kind');
            if (out.spawns.some(row => row.id === object.name))
                throw new Error(`Duplicate spawn identity ${object.name}`);
            out.spawns.push({ id: object.name, kind: object.kind, ...spawnPlacement(object) });
        }
        if (object instanceof Entry)
            out.entries.push(object.toEntryData());
        if (object instanceof Cue) cues.push(object.toCueData());
        if (object instanceof AmbienceZone) zones.push(object.toZoneData());
        if (object instanceof Score) { if (score !== undefined) throw new Error('Scene permits one audio profile'); score = object; }
        if (object instanceof Zipline || object instanceof Updraft || object instanceof Ladder) modes.traverse.push(object.toModeData());
        if (object instanceof Mount) ride.push(object.toModeData());
        if (object instanceof Grapple) grapple.push(object.toModeData());
        out.nodes.push(node);
    }
    if (new Set(out.entries.map(entry => entry.edge)).size !== out.entries.length)
        throw new Error('Duplicate entry edge');
    if (lights.length > 0) out.lights = lights;
    if (score !== undefined || cues.length > 0 || zones.length > 0) out.audio = (score ?? new Score()).toAudioData(cues, zones);
    if (modes.traverse.length > 0 || ride.length > 0 || grapple.length > 0) out.modes = parseModes({ ...modes, ...(ride.length === 0 ? {} : { ride }), ...(grapple.length === 0 ? {} : { grapple }) });
    if (scene instanceof Scene) {
        if (scene.fog instanceof Fog)
            out.fog = { kind: 'linear', color: [...scene.fog.color], near: scene.fog.near, far: scene.fog.far };
        else if (scene.fog instanceof FogExp2)
            out.fog = { kind: 'exponential', color: [...scene.fog.color], density: scene.fog.density };
    }
    if (!finiteData(out))
        throw new Error('Scene description requires finite JSON data');
    if (out.lights !== undefined) out.lights = parseLightRows(out.lights);
    return out;
}
function finiteData(value: unknown): boolean {
    if (typeof value === 'number')
        return Number.isFinite(value);
    if (value === null || typeof value === 'string' || typeof value === 'boolean')
        return true;
    if (Array.isArray(value))
        return value.every(finiteData);
    if (typeof value === 'object')
        return Object.values(value).every(finiteData);
    return false;
}
