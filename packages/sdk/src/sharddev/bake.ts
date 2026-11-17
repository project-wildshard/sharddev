import { Group, InstancedMesh, Matrix4, Mesh, type Object3D } from 'three';
import { readScene, type SceneDescription } from './scene';
import { confinedScenePath, publishSceneDescription } from './bakePublication';
import { Collider } from './physics';
import { declareNavigation } from './bake/navigationAsset';
import { bakeTerrain, type BakedTerrain, type TerrainBakeSource } from './bake/terrain';
import { bakeProps, type BakedProps, type PropScatter, type PropsBakeSource, type PropWhole } from './bake/props';
import { bakeKinds, type KindBakeOptions, type KindCollider, type PieceBake } from './bake/kinds';
import { completeL0Tiles } from './bake/tileGrid';

/**
 * SHARD-PLATFORM SF80 (design-system.md §3, "the design's central call"): `bake(scene, identity)`. A generator builds an
 * ordinary three.js `Scene`; `bake` walks it once, writes its inspectable `scene.json` (`synth`), and emits the shardfile
 * content the scene declares:
 *
 * - **terrain**: the ground's height / colour recipe (`inputs.terrain`) baked into the 64 L0 + 16 L1 tiles and the critical
 *   collider (`bake/terrain`);
 * - **static props**: every plain `Mesh` outside a `BakedPiece` / `Scatter`, merged per tile onto those tiles (`bake/props`);
 * - **scatter**: every `InstancedMesh` (one model) and every `Scatter` (a multi-mesh model) as per-tile instance lists;
 * - **pieces**: every `BakedPiece`, its named `InstancedMesh` kinds folded into one instanced GLB (`bake/kinds`; one draw
 *   per kind, never multi-draw) with the collider rows it declares;
 * - **colliders**: the SDK `Collider` nodes (`@wildshard/sdk/physics`), the props' collider rows and each piece's rows.
 *
 * The full-world tile inventory includes every L0 square. Vacant squares have
 * zero costs and no files; the sparse render/terrain payload sections stay sparse.
 *
 * It runs only at build time and never installs a service. Generic: it knows no shard, only the scene it is handed.
 */

/** An inspected author graph and the exact digest/path of its canonical JSON; neither is a finished shardfile. */
export interface SynthResult {
  scene: SceneDescription;
  hash: string;
  path: string;
}

/** A path under the author project, refused when it resolves outside it. */
export function confined(root: string, path: string): string { return confinedScenePath(root, path); }

/** Publish the canonical description through the existing confined Node writer. */
export function publishScene(description: SceneDescription, project: string, slug: string): SynthResult {
  return publishSceneDescription(description, project, slug);
}

/** The shard a scene bakes into (`shard.config.ts`'s identity). */
export interface BakeIdentity { slug: string; name?: string }

/** A code-built world piece baked as instanced kinds: its children are the named kinds, its rows the colliders it declares. */
export class BakedPiece<C extends KindCollider = KindCollider> extends Group {
  readonly colliders: readonly C[];
  readonly options: KindBakeOptions;
  /** Extra plain JSON rows the piece's client reads beside its kinds (anchors, per-piece placements). */
  readonly rows: Readonly<Record<string, unknown>>;
  constructor(name: string, kinds: readonly (readonly [string, Mesh])[], colliders: readonly C[], options: KindBakeOptions = {}, rows: Readonly<Record<string, unknown>> = {}) {
    super();
    this.name = name; this.colliders = colliders; this.options = options; this.rows = rows;
    for (const [kind, mesh] of kinds) { mesh.name = kind; this.add(mesh); }
  }
  /** The piece's kinds, in authored order. */
  kinds(): (readonly [string, Mesh])[] {
    return this.children.filter((child): child is Mesh => child instanceof Mesh).map((mesh) => [mesh.name, mesh] as const);
  }
}

/** One (possibly multi-mesh) model scattered at world transforms; the model is its only child, at the scatter's origin. */
export class Scatter extends Group {
  readonly model: Object3D;
  readonly transforms: readonly Matrix4[];
  constructor(name: string, model: Object3D, transforms: readonly Matrix4[]) {
    super();
    this.name = name; this.model = model; this.transforms = transforms.map((m) => m.clone());
    this.add(model);
  }
}

/** A named static mesh kept whole in its own frame, owned by its origin's L0 tile.
 * Its ordinary scene transforms become the existing PropWhole transform; its child is never also merged. */
export class WholeShape extends Group {
  readonly mesh: Mesh;
  readonly options: Pick<PropWhole, 'customAttributes' | 'nativeAttributes' | 'partition' | 'overhang' | 'compact' | 'compactGlow' | 'materialName'>;
  constructor(name: string, mesh: Mesh, options: Pick<PropWhole, 'customAttributes' | 'nativeAttributes' | 'partition' | 'overhang' | 'compact' | 'compactGlow' | 'materialName'> = {}) {
    super();
    this.name = name; this.mesh = mesh; this.options = options; this.add(mesh);
  }
}

/** Build-time inputs a scene graph cannot hold: closures, library panels and hand-made proxies. */
export interface BakeInputs {
  /** Repository / author-project root: `scene.json` goes to `<project>/.wildshard/cache/<slug>/`. Omitted: nothing is written. */
  project?: string;
  /** Original WSNM bytes, declared and charged without resampling or changing queries. */
  navigation?: Uint8Array;
  /** The ground's recipe (closures run here only). Omitted: the shardfile has no terrain. */
  terrain?: TerrainBakeSource;
  /** Props options the graph does not express yet: panels, library models, coarse / far proxies, family, colour texture. */
  props?: Omit<PropsBakeSource, 'static' | 'scatter'>;
}

/** A baked piece: its GLB, kind rows, collider rows and extra rows. */
export interface BakedSceneParts extends PieceBake { name: string; rows: Readonly<Record<string, unknown>> }

/** Everything `bake` emits: the shardfile rows, the immutable files by hash and the pieces' GLBs. */
export interface BakedScene {
  identity: BakeIdentity;
  /** The synthesized description, its content hash and where it was written (null without `inputs.project`). */
  scene: SceneDescription; sceneHash: string | null; scenePath: string | null;
  terrain: BakedTerrain | null;
  props: BakedProps | null;
  pieces: BakedSceneParts[];
  /** Shardfile rows in the product's canonical order (tiles by lod, x, z; files by hash). */
  shardfile: Pick<BakedTerrain, 'tiles' | 'files' | 'critical'> & Partial<Pick<BakedTerrain, 'edge' | 'terrain'> & Pick<BakedProps, 'far' | 'library'>> & { navigation?: ReturnType<typeof declareNavigation>['navigation'] };
  colliders: { scene: SceneDescription['colliders']; props: BakedProps['props']['colliders']; pieces: { piece: string; colliders: PieceBake['colliders'] }[] };
  assets: Map<string, Uint8Array>;
}

const SLUG = /^[a-z][a-z0-9-]{0,127}$/u;

const isPiece = (object: Object3D): object is BakedPiece => object instanceof BakedPiece;
const isMesh = (object: Object3D): object is Mesh => object instanceof Mesh;

/** Inside a piece or a scatter (their own bakers own those meshes). */
function owned(object: Object3D): boolean {
  for (let node: Object3D | null = object.parent; node !== null; node = node.parent) if (node instanceof BakedPiece || node instanceof Scatter || node instanceof WholeShape) return true;
  return false;
}

/** World-placed stand-in for a mesh, so the props merge reads exactly its world triangles. */
function placed(mesh: Mesh): Mesh {
  const proxy = new Mesh(mesh.geometry, mesh.material);
  proxy.matrixAutoUpdate = false; proxy.matrix.copy(mesh.matrixWorld);
  return proxy;
}

/** Bake the existing scene content, optionally publishing its canonical diagnostic description. */
export function bake(scene: Object3D, identity: BakeIdentity, inputs: BakeInputs = {}): BakedScene {
  const result = bakeOwned(scene, identity, inputs);
  if (inputs.project !== undefined) {
    const published = publishScene(result.scene, inputs.project, identity.slug);
    result.sceneHash = published.hash; result.scenePath = published.path;
  }
  return result;
}

/** Build-only scene compilation into owned rows and bytes, without publishing
 * files or installing services. Shares the complete algorithm with `bake`;
 * source programs cache the returned values through their injected context. */
export function bakeOwned(scene: Object3D, identity: BakeIdentity, inputs: Omit<BakeInputs, 'project'> = {}): BakedScene {
  if (!SLUG.test(identity.slug)) throw new Error('bake: identity needs a bounded shard slug');
  scene.updateMatrixWorld(true);
  const statics = new Group(), scatter: PropScatter[] = [], pieces: BakedPiece[] = [], whole: PropWhole[] = [...inputs.props?.whole ?? []];
  scene.traverse((object) => {
    if (owned(object)) return;
    if (isPiece(object)) { pieces.push(object); return; }
    if (object instanceof WholeShape) {
      whole.push({ ...object.options, id: object.name, mesh: object.mesh, transform: object.mesh.matrixWorld.clone() }); return;
    }
    if (object instanceof Scatter) {
      if (!object.matrixWorld.equals(new Matrix4())) throw new Error(`bake: scatter ${object.name} must sit at the world origin (its transforms are world space)`);
      scatter.push({ model: object.model, transforms: object.transforms }); return;
    }
    if (object instanceof InstancedMesh) {
      const transforms = Array.from({ length: object.count }, (_, i) => { const m = new Matrix4(); object.getMatrixAt(i, m); return object.matrixWorld.clone().multiply(m); });
      scatter.push({ model: new Mesh(object.geometry, object.material), transforms }); return;
    }
    if (isMesh(object) && !(object instanceof Collider)) statics.add(placed(object));
  });
  if (new Set(pieces.map((p) => p.name)).size !== pieces.length || pieces.some((p) => p.name === '')) throw new Error('bake: every piece needs a unique name');

  // synth: the inspectable middle step, with each scatter's instances and each piece's declared rows on its node
  const description = readScene(scene), byId = new Map(description.nodes.map((n) => [n.id, n]));
  scene.traverse((object) => {
    if (!(object instanceof Scatter)) return;
    const node = byId.get(object.name);
    if (node === undefined) throw new Error(`bake: scatter ${object.name} needs a unique name`);
    node.instances = object.transforms.map((m) => [...m.elements]);
  });

  const navigation = inputs.navigation === undefined ? null : declareNavigation(inputs.navigation);
  const terrain = inputs.terrain === undefined ? null : bakeTerrain(inputs.terrain);
  if (terrain !== null) { terrain.tiles.sort((a, b) => a.lod - b.lod || a.x - b.x || a.z - b.z); terrain.files.sort((a, b) => a.hash.localeCompare(b.hash)); }
  const hasProps = statics.children.length > 0 || scatter.length > 0 || whole.length > 0 || (inputs.props?.panels?.length ?? 0) > 0;
  const props = hasProps ? bakeProps({ ...inputs.props, static: statics, scatter, whole }, terrain?.tiles ?? []) : null;
  const baked = pieces.map((piece): BakedSceneParts => Object.assign(bakeKinds(piece.name, piece.kinds(), piece.colliders, piece.options), { name: piece.name, rows: piece.rows }));

  const assets = new Map([...terrain?.assets ?? [], ...props?.assets ?? [], ...navigation?.assets ?? []]);
  const tiles = completeL0Tiles((props?.tiles ?? terrain?.tiles ?? []).slice().sort((a, b) => a.lod - b.lod || a.x - b.x || a.z - b.z));
  const files = [...terrain?.files ?? [], ...props?.files ?? [], ...navigation?.files ?? []].sort((a, b) => a.hash.localeCompare(b.hash));
  const shardfile: BakedScene['shardfile'] = { tiles, files, critical: [...terrain?.critical ?? [], ...navigation?.critical ?? []],
    ...(navigation === null ? {} : { navigation: navigation.navigation }),
    ...(terrain === null ? {} : { terrain: terrain.terrain, edge: terrain.edge }), ...(props === null ? {} : { far: props.far, library: props.library }) };
  return { identity, scene: description, sceneHash: null, scenePath: null, terrain, props, pieces: baked, shardfile,
    colliders: { scene: description.colliders, props: props?.props.colliders ?? inputs.props?.colliders ?? [], pieces: baked.map((p) => ({ piece: p.name, colliders: p.colliders })) }, assets };
}
