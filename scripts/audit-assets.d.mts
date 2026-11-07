export interface InventoryRow {
  slug: string; tier: string; files: readonly string[]; packFiles: readonly string[];
  packed: readonly string[]; gpu: Readonly<Record<string, string>>; ktxFiles: readonly string[];
}
export function auditInventory(rows: readonly InventoryRow[], exists: (url: string) => boolean): string[];

export interface TextureReference { url: string; referencedBy: string[] }
export interface TextureSource { path: string; text: string }
export function auditTextureReferences(files: readonly string[], rows: readonly InventoryRow[], sources: readonly TextureSource[]): TextureReference[];
export function textureSources(root: string): TextureSource[];
