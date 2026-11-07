/** Build-time RGB channel packing after the original half-float gain decode. */
export function packGainKey(color: Uint8Array, gain: Uint8Array, width: number, height: number): { data: Uint16Array; horizon: number[] };
/** Encode packed texels with the shipped platform-independent gzip header. */
export function encodeGainKey(data: Uint16Array): Uint8Array;
