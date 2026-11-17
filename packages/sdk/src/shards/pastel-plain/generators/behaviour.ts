import type { ProjectGenerationContext } from '@wildshard/sdk/projectGeneration';
import { hashImmutableBytes } from '@wildshard/sdk/immutable';

export type PastelBehaviour = Record<'door' | 'items' | 'idle', { hash: string; compressed: number }>;
export const PASTEL_BEHAVIOUR_INPUTS = ['behaviour/door.as', 'behaviour/items.as', 'behaviour/idle.as'] as const;

/** Compile the original sources and exact portable memory bounds. */
export async function compilePastelBehaviour(compiler: Pick<ProjectGenerationContext, 'compileScript'>, inputs: ReadonlyMap<string, Uint8Array>): Promise<ReadonlyMap<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>();
  for (const [name, pages] of [['door', 2], ['items', 64], ['idle', 2]] as const) {
    const text = inputs.get(`behaviour/${name}.as`); if (text === undefined) throw new Error('Missing Pastel behaviour source');
    files.set(`${name}.wasm`, await compiler.compileScript(new TextDecoder('utf-8', { fatal: true }).decode(text), { maximumPages: pages }));
  }
  return files;
}
/** Metadata always describes the actual compiled bytes. */
export function pastelBehaviourMetadata(files: ReadonlyMap<string, Uint8Array>): PastelBehaviour {
  const read = (name: string) => {
    const bytes = files.get(`${name}.wasm`); if (bytes === undefined) throw new Error('Missing compiled Pastel behaviour');
    return { hash: hashImmutableBytes(bytes), compressed: bytes.length };
  };
  return { door: read('door'), items: read('items'), idle: read('idle') };
}
/** Source inputs are read on cache hits too, then only detached verified bytes are published. */
export async function pastelBehaviour(ctx: ProjectGenerationContext): Promise<PastelBehaviour> {
  const files = await ctx.cached({ id: 'behaviour', inputs: PASTEL_BEHAVIOUR_INPUTS }, inputs => compilePastelBehaviour(ctx, inputs));
  const metadata = pastelBehaviourMetadata(files);
  for (const [name, row] of Object.entries(metadata)) {
    const bytes = files.get(`${name}.wasm`);
    if (bytes === undefined || bytes.length !== row.compressed || ctx.asset(bytes) !== row.hash) throw new Error('Pastel behaviour byte identity differs');
  }
  return metadata;
}
