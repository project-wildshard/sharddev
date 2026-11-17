import type { PackageApiSurface } from './package-api.mjs';

/** One retained TypeScript example rendered byte-for-byte into the generated guide. */
export interface AuthoringExample { name: string; file: string; source: string }
/** Refuse missing, duplicated or unreferenced checked examples. */
export function authoringExamples(directory?: string): AuthoringExample[];
/** Render the checked public guide and all its example sources. */
export function authoringGuide(directory?: string): string;
/** Semantic diagnostics for strict guide example source files. */
export function checkAuthoringExamples(root: string, files?: string[]): string[];
/** Exact public SDK/format documentation counts and fail-closed coverage errors. */
export function authoringApiCoverage(surface: PackageApiSurface, documents: Record<string, string>): {
  coverage: Record<string, { total: number; documented: number }>; failures: string[];
};
