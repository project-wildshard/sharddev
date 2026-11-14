import type { SceneGeometry, ScenePart, ShardScene } from '../scene/description';

/**
 * SHARD-SOURCE AP6: the dev scene wire, the sdk half. It mirrors engine `src/client/game/devScene/wire.ts` (wire 1), which
 * the DEVSERVER page reads; the two change together and the version refuses a mismatch on the page.
 */
export const DEV_SCENE_WIRE = 1;
export const DEV_SCENE_PATH = '/__wildshard_scene/';

/** One part as the page's `DevPart` JSON: materials, raster sizes and draws inline; geometry and rasters by key. */
export function encodePart(scene: ShardScene, part: ScenePart): unknown {
  const material = (key: string): unknown => { const row = scene.materials[key]; if (row === undefined) throw new Error(`watch: part ${part.name} names material ${key} the scene lacks`); return row; };
  return {
    name: part.name, hash: part.hash,
    materials: part.materials.map(material),
    textures: part.textures.map((key) => { const t = scene.textures[key]; if (t === undefined) throw new Error(`watch: part ${part.name} names texture ${key} the scene lacks`); return { key, width: t.width, height: t.height, colourSpace: t.colourSpace }; }),
    geometries: part.geometries,
    draws: part.draws.map((d) => ({ geometry: d.geometry, material: d.material, matrix: d.matrix, castShadow: d.castShadow, receiveShadow: d.receiveShadow,
      instances: d.instances === null ? null : { count: d.instances.count, matrices: Array.from(d.instances.matrices), colours: d.instances.colours === null ? null : Array.from(d.instances.colours) } })),
    sprites: part.sprites.map((s) => ({ material: s.material, position: s.position, scale: s.scale, center: s.center })),
    // the sun, sky and ambient are the shardfile's look; only lamps are the part's own
    lights: part.lights.filter((l) => l.kind === 'point').map((l) => ({ colour: l.colour, intensity: l.intensity, distance: l.distance, decay: l.decay, position: l.position })),
    colliders: part.colliders.map((c) => ({ centre: c.centre, half: c.half, rotation: c.rotation })),
    water: part.water.map((w) => ({ tint: w.tint, triangles: Array.from(w.triangles) })),
  };
}

/** Five little-endian u32 element counts (position, normal, uv, colour, index), then each array in that order. */
export function encodeGeometry(geometry: SceneGeometry): Uint8Array {
  const arrays = [geometry.position, geometry.normal, geometry.uv, geometry.colour, geometry.index];
  const counts = arrays.map((a) => a?.length ?? 0), bytes = new Uint8Array(20 + counts.reduce((n, c) => n + c * 4, 0)), view = new DataView(bytes.buffer);
  counts.forEach((count, i) => { view.setUint32(i * 4, count, true); });
  let offset = 20;
  for (const array of arrays) {
    if (array === null) continue;
    bytes.set(new Uint8Array(array.buffer, array.byteOffset, array.byteLength), offset);
    offset += array.byteLength;
  }
  return bytes;
}

/**
 * The shard a watched page boots from: the scene's ground, look, sun, sky and spawn, with every part's draws, sprites,
 * lamps, colliders and water left to the dev scene host, which swaps them live.
 */
export function liveShell(scene: ShardScene): ShardScene {
  return { ...scene, parts: scene.parts.map((part) => ({ ...part, draws: [], sprites: [], colliders: [], water: [], lights: part.lights.filter((l) => l.kind !== 'point'), materials: [], textures: [], geometries: [] })) };
}
