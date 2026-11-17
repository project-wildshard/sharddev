import type { ProjectGenerationContext } from '@wildshard/sdk/projectGeneration';
import { hashImmutableBytes } from '@wildshard/sdk/immutable';

export type TemplateBehaviour = Record<'door' | 'items' | 'idle', { hash: string; compressed: number }>;
export const TEMPLATE_BEHAVIOUR_INPUTS = ['behaviour/door.as', 'behaviour/items.as', 'behaviour/idle.as'] as const;

/** Compile the original sources in original order with the SAME portable compiler and page bounds. */
export async function compileTemplateBehaviour(compiler: Pick<ProjectGenerationContext, 'compileScript'>, inputs: ReadonlyMap<string, Uint8Array>): Promise<ReadonlyMap<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>();
  for (const [name, pages] of [['door', 2], ['items', 64], ['idle', 2]] as const) {
    const text = inputs.get(`behaviour/${name}.as`); if (text === undefined) throw new Error('Missing Template behaviour source');
    const bytes = await compiler.compileScript(new TextDecoder('utf-8', { fatal: true }).decode(text), { maximumPages: pages });
    files.set(`${name}.wasm`, bytes);
  }
  return files;
}
/** Metadata is derived from the actual compiled bytes, never a parallel JSON cache. */
export function templateBehaviourMetadata(files: ReadonlyMap<string, Uint8Array>): TemplateBehaviour {
  const read = (name: string) => {
    const bytes = files.get(`${name}.wasm`); if (bytes === undefined) throw new Error('Missing compiled Template behaviour');
    return { hash: hashImmutableBytes(bytes), compressed: bytes.length };
  };
  return { door: read('door'), items: read('items'), idle: read('idle') };
}
/** Read explicit source inputs even on a hit and publish only verified, detached compiled modules. */
export async function templateBehaviour(ctx: ProjectGenerationContext): Promise<TemplateBehaviour> {
  const files = await ctx.cached({ id: 'behaviour', inputs: TEMPLATE_BEHAVIOUR_INPUTS }, inputs => compileTemplateBehaviour(ctx, inputs));
  const metadata = templateBehaviourMetadata(files);
  for (const [name, row] of Object.entries(metadata)) {
    const bytes = files.get(`${name}.wasm`);
    if (bytes === undefined || bytes.length !== row.compressed || ctx.asset(bytes) !== row.hash) throw new Error('Template behaviour byte identity differs');
  }
  return metadata;
}
