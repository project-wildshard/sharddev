import type { HostCall, HostCallback } from '../lint/host-callbacks.mjs';

export interface HostVerdict { status: string; evidence: string }
export interface HostReview { sourceHash: string; evidence: string; verdicts: Record<string, string> }
export function hostVerdicts(users: string[], callbacks: HostCallback[], audited?: HostReview, sourceHash?: string | null): Record<string, HostVerdict>;
export interface HostCatalogue {
  schema: string; coverage: string;
  sections: { name: string; type: string; fields: { name: string; type: string }[]; readers: HostCall[]; hosts: string[]; users: string[] }[];
  fields: unknown[]; wasm: { contract: unknown; signatures: unknown[] };
  hosts: { module: string; export: string; calls: HostCall[]; callbacks: HostCallback[]; users: string[]; pendingUsers: { shard: string }[]; sourceHash: string | null; verdicts: Record<string, HostVerdict> }[];
}
export function hostCatalogue(root?: string, reference?: { fields: unknown[]; contract: unknown; abi: unknown[] }): HostCatalogue;
export function renderHostCatalogue(catalogue: HostCatalogue): string;
export function writeHostCatalogue(root?: string): HostCatalogue;
