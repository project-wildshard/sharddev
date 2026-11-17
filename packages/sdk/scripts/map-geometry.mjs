// Build-only map geometry: no forest, level or runtime services are imported.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { deflateSync } from 'node:zlib';
import { MapAssembly as OwnedMapAssembly, mapModelBytes } from '../src/sharddev/bake/mapAssembly.ts';

export const readMapJson = file => JSON.parse(readFileSync(file, 'utf8'), (_key, value) => value === '-0' ? -0 : value === 'Infinity' ? Infinity : value === '-Infinity' ? -Infinity : value);

/** Prepared specimens borrow local geometry, ignoring the source node's pose.
 * Raw sculpts explicitly opt into the node transform, as their live loader does. */
export async function mapModel(file, slot = 0, world = false) {
  const geometry = await mapModelBytes(file instanceof Uint8Array ? file : new Uint8Array(readFileSync(file)), slot, world);
  return geometry;
}

export class MapAssembly extends OwnedMapAssembly {
  /** Encode the same ordered scene and geometry without publishing source files. */
  encode() {
    const { json, binary } = this.pack();
    return { json, binary: new Uint8Array(deflateSync(binary)) };
  }
  write(file) {
    const { json, binary } = this.encode();
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(`${file}.bin`, binary);
    writeFileSync(`${file}.json`, json);
    for (const shape of this.shapes) { shape.geometry.dispose(); shape.material.dispose(); }
  }
}
