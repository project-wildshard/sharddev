import type { BufferGeometry } from 'three';
import type { MapAssembly as OwnedMapAssembly } from '../src/sharddev/bake/mapAssembly';

export function readMapJson(file: string): unknown;
export function mapModel(file: string | Uint8Array, slot?: number, world?: boolean): Promise<BufferGeometry>;
export class MapAssembly extends OwnedMapAssembly {
  encode(): { json: Uint8Array<ArrayBuffer>; binary: Uint8Array<ArrayBuffer> };
  write(file: string): void;
}
