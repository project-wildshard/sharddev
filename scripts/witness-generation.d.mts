/** A native retained TypeScript recorder and its exact loaded input closure. */
export interface WitnessGenerationSpec {
  root: URL; slug: string; inputs: string; files: Iterable<string>; manifest: URL;
  select: (directory: URL) => void; generate: () => Promise<unknown>;
  record?: boolean; forceCompare?: boolean; compare?: boolean;
}
/** Generate into the shared cache, select its output for readers, and optionally record only the small hash manifest. */
export function generateWitness(spec: WitnessGenerationSpec): Promise<{
  directory: string; key: string; hit: boolean; hashes: Record<string, string>; manifest: string;
}>;
