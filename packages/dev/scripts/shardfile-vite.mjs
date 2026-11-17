// Trusted compiler bridge: Rolldown reads source in Rust, outside Node fs hooks.
import { build as viteBuild } from 'vite';
import { recordBundle, inputRecorderPlugin } from '@wildshard/engine/scripts/shardfile-inputs.mjs';
import * as v from 'valibot';

// Explicit compiler intent: this bundle executes in Node and its JavaScript
// is never copied into a product. Ordinary runtime bundles keep exact bytes.
const Execution = v.object({name:v.literal('wildshard-author-execution'),api:v.object({wildshardInputIdentity:v.literal('execution')})});

export { parseSync } from 'vite';
/** @param {import('vite').InlineConfig} options */
export async function build(options) {
  const execution=options.plugins?.some(plugin=>v.is(Execution,plugin))===true;
  const started = performance.now();
  const result = await viteBuild({...options,plugins:[inputRecorderPlugin({execution}),...(options.plugins ?? [])]});
  recordBundle(result,{execution});
  const library = options.build?.lib;
  if (process.env.GITHUB_ACTIONS === 'true') console.info(`author timing: ${JSON.stringify({ pid: process.pid, phase: 'project-bundle', entry: library === undefined || library === false ? null : library.entry, execution, seconds: Number(((performance.now() - started) / 1000).toFixed(3)) })}`);
  return result;
}
