import type { ShardProduct } from '@wildshard/engine/scripts/shard-outputs.mjs';

export function shardFolders(root: string): string[];
/** Every product slug (SF88g: a folder's declared outputs, else the folder itself). */
export function shardSlugs(root: string): string[];
export function shardSource(root: string): string;
/** Type-only facade over generated identity data, including registered frozen copies. */
export function manifestClosure(root: string): Record<string, string[]>;
/** Core manifest/slug inputs for boot generation; full genShards publishes title tables afterward. */
export function genShardInputs(root?: string, check?: boolean, initializeMissing?: boolean, shard?: string): void;
export function genShards(root?: string, check?: boolean, initializeMissing?: boolean, shard?: string): void;
export function manifestContract(root: string, closure: Record<string, string[]>, fields?: boolean): string[];

/** Refresh identities before any consumer imports cached discovery modules. */
export function refreshDiscovery(root?: string): void;
/** Preserve every physical static/lazy module target when a discovery output leaves src. */
export function relocateDiscoverySource(root: string, product: Pick<ShardProduct, 'slug' | 'folder' | 'output'>, text: string): string;
