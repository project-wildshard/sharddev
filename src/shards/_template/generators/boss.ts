import { emptyShardfile } from '@wildshard/sharddev/author';
import { hashImmutableBytes } from '@wildshard/engine/host/immutable';
import type { ProjectGenerationContext } from '@wildshard/sharddev/projectGeneration';
import decision from '../data/bossDecision.json' with { type: 'json' };
import moves from '../data/moves.json' with { type: 'json' };
import creatures from '../data/creatures.json' with { type: 'json' };
import rows from '../data/rows.json' with { type: 'json' };
import { BUILD_OPTIONS } from './buildOptions';
import { TEMPLATE_BEHAVIOUR_INPUTS } from './behaviour';

export const TEMPLATE_BOSS_INPUTS: readonly ["behaviour/door.as", "behaviour/items.as", "behaviour/idle.as", "behaviour/boss.as"] = [...TEMPLATE_BEHAVIOUR_INPUTS, 'behaviour/boss.as'] as const;
/** The boss uses the same declared-handler compiler and complete authored source budget as product admission. */
export async function compileTemplateBoss(compiler: Pick<ProjectGenerationContext, 'compileDecisionScripts'>, inputs: ReadonlyMap<string, Uint8Array>): Promise<Uint8Array> {
  const source = { ...emptyShardfile({ slug: 'template', name: 'Template shard', author: 'Wildshard', revision: 2, seed: 357 }), creatures, rows };
  const authored = new Map([...inputs].map(([path, bytes]) => [path, new TextDecoder('utf-8', { fatal: true }).decode(bytes)]));
  const built = await compiler.compileDecisionScripts([decision], source, moves, authored, BUILD_OPTIONS);
  const blob = built.blobs.find(row => row.file.name === 'behaviour/template.boss.decision.wasm');
  if (blob === undefined) throw new Error('Missing compiled Template boss');
  return blob.bytes;
}
/** Publish only actual compiled bytes; no generated boss.json enters the author import graph. */
export async function templateBoss(ctx: ProjectGenerationContext): Promise<{ hash: string; compressed: number }> {
  const files = await ctx.cached({ id: 'boss', inputs: TEMPLATE_BOSS_INPUTS }, async inputs => new Map([['boss.wasm', await compileTemplateBoss(ctx, inputs)]]));
  const bytes = files.get('boss.wasm');
  if (bytes === undefined || ctx.asset(bytes) !== hashImmutableBytes(bytes)) throw new Error('Missing Template boss bytes');
  return { hash: hashImmutableBytes(bytes), compressed: bytes.length };
}
