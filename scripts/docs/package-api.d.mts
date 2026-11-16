/** One binding read from the defining public module. */
export interface ApiBinding { name: string; kind: string; from: string; doc: string }
/** SDK, format and kit inventories; no engine runtime context is needed. */
export interface PackageApiSurface { indexes: Record<string, ApiBinding[]>; contexts: Record<string, ApiBinding[]> }
export function publicModules(folder: string): { from: string; file: string }[];
export function packageApiSurface(root: string): PackageApiSurface;
export function packageApiDocuments(root: string, surface?: PackageApiSurface): Record<string, string>;
export function writePackageApi(root: string): PackageApiSurface;
