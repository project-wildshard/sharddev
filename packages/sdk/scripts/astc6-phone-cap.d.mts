/** S4: Pine's phone 512 sets: a KTX2 less its top mip, and a GLB's embedded images likewise. */
export function dropTopMip(input: Uint8Array): Uint8Array;
export function capGlbImages(input: Uint8Array, max: number): Uint8Array | null;
