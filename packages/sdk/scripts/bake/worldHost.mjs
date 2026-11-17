// Shared owned world seam for native bakes. Call explicitly after installing the Node DOM/fetch host
// and selecting the admitted native terrain. Ordinary import creates no level, registry or renderer.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { prepareNativeTerrain } from './nativeWorld.mjs';

const noop = () => undefined;

/** Build the real authored world, visit while its resources are alive, then unload even if capture rejects.
 * Navmesh callers retain the existing inert terrain facade. Geometry consumers must provide the actual terrain. */
export async function visitAuthoredWorld(manifest, options) {
  // Bake authored geometry from its native plugin, independently of the public card's product entry.
  const def = { ...manifest };
  const { root: ROOT, sky, element: el } = options;
  if ((options.visitPlacement !== undefined || options.visit !== undefined) && options.createTerrain === undefined) throw new Error('Authored world capture requires the real terrain builder');
  const src = (p) => import(pathToFileURL(resolve(ROOT, 'src', p)).href);
  const THREE = await import('three');
  const HF = await src('engine/shared/world/Heightfield.ts');
  const { TERRAIN_RES, CHUNK_SIZE } = await src('engine/shared/core/config.ts');
  const { terrainGrid } = await src('engine/shared/physics/terrain.ts');
  const { pathRampDescs } = await src('engine/shared/physics/paths.ts');
  const { Forest } = await src('engine/client/world/forest/Forest.ts');
  const { withModelPlacementVisitor } = await src('engine/client/models/model.ts');
  const build = async () => {
  const { app } = await src('engine/client/app/runtime.ts');
  (await src('engine/client/app/view/scopeEnvironment.ts')).installBrowserScopeEnvironment({ Mesh: THREE.Mesh, InstancedMesh: THREE.InstancedMesh });
  (await src('engine/client/world/registry.ts')).installWorldRegistry(); // the bake builds a level, as the session does (E434)
  const { toLevelSpec } = await src('game/client/shard/spec.ts');
  const { shardContext } = await src('game/client/plugin/context.ts');
  const { TreeFactory } = await src('engine/client/world/TreeFactory.ts');
  const { Physics } = await src('engine/shared/physics/Physics.ts');
  const { loadRapier } = await src('engine/shared/physics/rapier.ts');
  const { addTerrain: registerTerrain } = await src('engine/shared/physics/terrain.ts');
  const { needsTerrainCollider } = await src('engine/shared/level/spec.ts');
  const renderer = new Proxy({ capabilities: { getMaxAnisotropy: () => 1 }, extensions: { has: () => false, get: () => null },
    domElement: el(), shadowMap: {}, info: { render: {}, memory: {} }, getRenderTarget: () => null,
    getSize: (v) => v.set(1, 1), getDrawingBufferSize: (v) => v.set(1, 1), getViewport: (v) => v.set(0, 0, 1, 1),
    getScissor: (v) => v.set(0, 0, 1, 1), getClearColor: (v) => v.set(0), getClearAlpha: () => 1,
    compileAsync: () => Promise.resolve() }, { get: (t, k) => k in t ? t[k] : noop });
  const spec = toLevelSpec(def), scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  if (app.levelScope !== null || app.render !== null || app.physics !== null) throw new Error('Authored world capture requires an idle owned host');
  const previous = { levelAdapters: app.levelAdapters, levelDriver: app.levelDriver };
  const physics = new Physics(await loadRapier(readFileSync(resolve(ROOT, 'node_modules/@dimforge/rapier3d-simd/rapier_wasm3d_bg.wasm'))));
  let levelStarted = false;
  try {
  const native = options.nativeTerrain === undefined ? null : await prepareNativeTerrain(def, { root: ROOT, bytes: options.nativeTerrain });
  // Heightfield.install applies the authored datum; the raw WSTR samples are intentionally unshifted.
  const ground = terrainGrid();
  if (needsTerrainCollider(spec)) registerTerrain(physics, ground);
  const factory = typeof def.trees.factory === 'function' ? await (await def.trees.factory())(renderer, sky) : new TreeFactory(renderer).buildEmpty();
  const forest = new Forest(factory, sky).build({ drawnBy: def.trees.drawnBy ?? 'self' });
  const terrainSource = options.createTerrain === undefined
    ? { mesh: new THREE.Mesh(new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, TERRAIN_RES - 1, TERRAIN_RES - 1).rotateX(-Math.PI / 2)), punch: noop }
    : await options.createTerrain({ ground, forest, native });
  // Rendering captures keep their actual sliced terrain. The inert navmesh host
  // and older one-shot providers forward to their same punch law, with no new
  // hole test, index mutation or fabricated geometry.
  const terrain = typeof terrainSource.punchSliced === 'function' ? terrainSource
    : { ...terrainSource, punchSliced: (hole) => Promise.resolve(terrainSource.punch(hole)) };
  const player = { position: new THREE.Vector3(def.spawn.x, def.spawn.y ?? HF.heightAt(def.spawn.x, def.spawn.z), def.spawn.z), platforms: [] };
  // G342: a caller may collect the late hooks (view-dependent instance repacks) to pose them once before it visits
  const late = [], collectLate = options.collectLate === true ? (...args) => { const fn = args.find((a) => typeof a === 'function'); if (fn !== undefined) late.push(fn); } : noop;
  const game = { app, scene, camera, renderer, level: spec, tier: options.tier ?? 'desktop', onUpdate: noop, onFixed: noop, onLate: collectLate, onInput: noop,
    onRender: noop, onDispose: noop, hold: false, look: null };
  const world = { game, sky, forest, terrain, player, physics, registry: app.registry, chunk: def, params: new URLSearchParams(), freeCamera: false };
  const runtime = { world, step: (_name, fn) => Promise.resolve(fn({ detail: noop, set: noop })), play: null,
    interactables: [], overhead: [], objects: {}, hooks: {}, viewer: () => player.position, horizonVeil: null };
  const services = { runtime, shard: def, rows: new Map(), bag: { tab: () => noop, fragment: () => noop } };
  const addPaths = () => app.registry.add({ id: 'paths', name: 'Paths', category: 'ground', file: 'src/shared/engine/physics/paths.ts', surface: 'ground',
    colliders: pathRampDescs(HF.TRAILS, HF.heightAt, (x, z) => HF.normalAt(x, z)[1], { carried: (x, z) => app.registry.floorAt(x, z) !== undefined }) });
  app.levelAdapters = { debugRow: () => noop, playground: () => noop };
  app.levelDriver = { progress: () => ({ detail: noop, set: noop }), data: noop,
    world: (_spec, ctx) => {
      game.levelScope = ctx.scope;
      if (forest.trees.length > 0 && forest.drawer === 'self') ctx.piece({ id: 'forest', name: 'Forest', category: 'nature', file: 'src/client/engine/world/forest/Forest.ts', colliders: forest.colliderDescs() });
      if (def.ground.paths !== 'plugin' && def.ground.structures === undefined) addPaths();
    }, kit: noop, loadout: noop, play: noop, finish: noop };
  app.render = game; app.scene = scene; app.physics = physics;
  const { default: Plugin } = await def.load();
  const plugin = new Plugin();
    levelStarted = true;
    await app.loadLevel(spec, { world: (ctx) => plugin.world?.(shardContext(ctx, def, services)),
      kit: () => options.installKit?.() });
    if (options.practiceArena === true) {
      const { TrainingArena } = await src('engine/client/practice/TrainingArena.ts');
      new TrainingArena(game, app.registry, physics, { x: def.spawn.x, z: def.spawn.z });
    }
    await options.visit?.({ scene, sky, forest, terrain, physics, registry: app.registry, camera, late });
    const colliders = [], counts = {};
    for (const piece of app.registry.pieces) {
      if (piece.follows || piece.active?.() === false || !piece.colliders) continue;
      if (piece.colliders.length > 0) counts[piece.id] = piece.colliders.length;
      colliders.push(...piece.colliders);
    }
    return { colliders, ground: needsTerrainCollider(spec) ? ground : null, counts };
  } finally {
    try { if (levelStarted) await app.unloadLevel(); }
    finally {
      app.registry.pieces.length = 0;
      app.registry.picks.length = 0;
      app.registry.sets.length = 0;
      app.render = null; app.scene = null; app.physics = null;
      app.levelAdapters = previous.levelAdapters; app.levelDriver = previous.levelDriver;
      physics.dispose();
    }
  }
  };
  return options.visitPlacement === undefined ? build() : withModelPlacementVisitor(sky, options.visitPlacement, build);
}
