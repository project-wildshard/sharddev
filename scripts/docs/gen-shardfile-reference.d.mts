export const SHARDFILE_REFERENCE: string;
export function referenceData(root: string): { fields: unknown[]; abi: unknown[]; contract: unknown };
export function shardfileReference(root: string): string;
export function checkShardfileReference(root: string): void;
