import { BAKED_BYTES as platformBakedBytes, appendGeometry as platformAppendGeometry, bakedGeometryBytes as platformBakedGeometryBytes, pad4 as platformPad4, readBakedGeometry as platformReadBakedGeometry, type BakedGeometryRow as PlatformBakedGeometryRow, type BakedType as PlatformBakedType } from '@wildshard/engine/game/plugin/bakedGeometry';

/** An attribute's element type in a geometry bake ('f16' is a half float held in a Uint16Array). */
export type BakedType = PlatformBakedType;
/** One baked geometry: its attributes, vertex count, index kind and count, and whether it has a box (SHARD-PLATFORM M3, the kit system). */
export type BakedGeometryRow = PlatformBakedGeometryRow;
/** Bytes per element of each baked type. */
export const BAKED_BYTES: typeof platformBakedBytes = platformBakedBytes;
/** A block's length padded to 4 bytes. */
export const pad4: typeof platformPad4 = platformPad4;
/** The bytes a row's blocks take in a bake. */
export const bakedGeometryBytes: typeof platformBakedGeometryBytes = platformBakedGeometryBytes;
/** Reads one baked geometry from the bytes at an offset. */
export const readBakedGeometry: typeof platformReadBakedGeometry = platformReadBakedGeometry;
/** A baked builder's geometry with what was added to it after. */
export const appendGeometry: typeof platformAppendGeometry = platformAppendGeometry;
