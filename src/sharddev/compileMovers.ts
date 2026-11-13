import { compileScript } from './bake/compileScript';
import { moverProgram } from './moverPrograms';
import { hashImmutableBytes } from './immutable';
import { MOVER_DRIVER_MODULES } from '@wildshard/format/moverMotion';

/** Compile and meter a fixed row driver; refuse any accidental change to its admitted continuation ABI. */
export async function compileMoverDriver(kind: 'ride' | 'hinge' | 'waves' | 'clip'): Promise<Uint8Array> {
  const program = moverProgram(kind), bytes = await compileScript(program.source, { maximumPages: 1, sources: program.sources });
  if (hashImmutableBytes(bytes) !== MOVER_DRIVER_MODULES[kind]) throw new Error('Fixed mover driver ABI changed');
  return bytes;
}
