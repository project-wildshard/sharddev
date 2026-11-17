/** Lossless bytes paired with their unchanged coat-table identity. */
export interface CoatFileBytes { readonly url: string; readonly png: Uint8Array }
/** Write ordered PNG files and publish a path-only manifest last. */
export function writeCoatFiles(manifest: string, coats: readonly CoatFileBytes[]): void;
/** Read the same owned PNG bytes; encoded payloads and escaped paths refuse. */
export function readCoatFiles(manifest: string): CoatFileBytes[];
