import { rasterSceneMap, type SceneMapBytes } from '@wildshard/sdk/bake/groundMap';
import settings from '../data/map.json' with { type: 'json' };

/** The painter's reads of the baked world's files only (no file system, no public directory). */
function inkMapSources(files: ReadonlyMap<string, Uint8Array>): SceneMapBytes {
  const need = (name: string): Uint8Array => { const value = files.get(name); if (value === undefined) throw new Error(`Missing baked map input ${name}`); return value; };
  return { input: need, bytes: need, json(name) { const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(need(name))); return value; } };
}

/** GR9 (G783): the ink valley's map lattice, painted in the build from its baked terrain and props (bake.ts); the SDK
 *  publishes the image. */
export async function inkMapPixels(files: ReadonlyMap<string, Uint8Array>): Promise<Uint8Array> {
  const result = await rasterSceneMap(settings, inkMapSources(files));
  if (result.pixels.byteLength !== 1000 * 1000 * 4) throw new Error('Ink map lattice size differs');
  return result.pixels;
}
