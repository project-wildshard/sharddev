import {existsSync,readFileSync} from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Offline transport for the same definition-owned scalar intake used by products. */
export function prepareNativeScalarBlocks(def, root) {
  const intake = def.scalarBlocks;
  if (intake === undefined || intake.prepared) return;
  const project = resolve(root, 'src/shards', def.slug);
  intake.prepare(new Map(intake.files.map(file => {
    const local = resolve(project, file);
    const path = !existsSync(local) && file.startsWith('assets/') ? resolve(root, 'public', file) : local;
    return [file, readFileSync(path)];
  })));
}

/** Select the actual authored level and its original native bytes before terrain, forest or model construction. */
export async function prepareNativeTerrain(def, options) {
  const src = p => import(pathToFileURL(resolve(options.root, 'src', p)).href);
  prepareNativeScalarBlocks(def, options.root);
  const { bytes } = options;
  if (bytes.length < 24) throw new Error('Missing original native terrain');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x52545357 || view.getUint32(4, true) !== 1 || view.getUint32(8, true) !== 256 || view.getFloat32(12, true) !== 500 || view.getUint32(16, true) !== def.seed) throw new Error('Authored world requires its original WSTR256 terrain and seed');
  const { parseBakedTerrain, installBakedGrid } = await src('engine/shared/world/BakedTerrain.ts');
  const end = 24 + 256 ** 2 * 8;
  if (bytes.length < end) throw new Error('Truncated original native terrain');
  if (bytes.length > end) {
    if (bytes.length < end + 24 || view.getUint32(end, true) !== 0x4c505357 || view.getUint32(end + 4, true) !== 1) throw new Error('Invalid original native placement trailer');
    const decisions = view.getUint32(end + 8, true), kinds = view.getUint32(end + 12, true);
    if (kinds > 256 || decisions > 8_000_000 || bytes.length !== end + 24 + kinds * 4 + Math.ceil(decisions / 8) || !Number.isFinite(view.getFloat64(end + 16 + kinds * 4, true))) throw new Error('Invalid original native placement bounds');
  }
  const grid = parseBakedTerrain(Uint8Array.from(bytes).buffer);
  if (grid === null || grid.heights.some(value => !Number.isFinite(value) || Math.abs(value) > 250)) throw new Error('Invalid original native terrain');
  const { _applyChunkConstants } = await src('engine/shared/core/config.ts');
  const { configureLevel } = await src('engine/shared/level/selection.ts');
  const { toLevelSpec } = await src('game/client/shard/spec.ts');
  const { game } = await src('game/client/shard/registry.ts');
  game.shard = def;
  _applyChunkConstants(def); configureLevel(toLevelSpec(def));
  installBakedGrid(grid);
  return grid;
}
