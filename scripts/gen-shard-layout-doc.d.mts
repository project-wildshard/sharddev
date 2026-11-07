import type { ShardLayout } from '@wildshard/engine/scripts/check-shards.mjs';

export function layoutBlock(layout: ShardLayout & { describe?: Record<string, string> }): string;
export function withLayout(doc: string, layout: ShardLayout & { describe?: Record<string, string> }): string;
