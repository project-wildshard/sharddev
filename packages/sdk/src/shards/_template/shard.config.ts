import { generate as generateTemplate } from './generators/generate';
import { BUILD_OPTIONS } from './generators/buildOptions';

/** Build-time generation belongs to the generator directory. */
export const generate: typeof generateTemplate = generateTemplate;
// oxlint-disable-next-line import/no-default-export -- The documented author entry is the generation program.
export default generate;

/** Explicit standalone AssemblyScript policy, consumed only by the author build. */
export const buildOptions: typeof BUILD_OPTIONS = { ...BUILD_OPTIONS };
