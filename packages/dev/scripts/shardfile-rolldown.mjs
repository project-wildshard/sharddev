// Trusted compiler bridge: Rolldown reads source in Rust, outside Node fs hooks. Inside the author CLI, the sdk's
// `rolldown` import resolves here (scripts/wildshard.mjs), so every bundle the build makes records its inputs.
import { rolldown as bundler } from 'rolldown';
import { recordBundle, inputRecorderPlugin } from '@wildshard/engine/scripts/shardfile-inputs.mjs';
import * as v from 'valibot';

export * from 'rolldown';

// Explicit compiler intent: this bundle executes in Node and its JavaScript
// is never copied into a product. Ordinary runtime bundles keep exact bytes.
const Execution = v.object({name:v.literal('wildshard-author-execution'),api:v.object({wildshardInputIdentity:v.literal('execution')})});

/** @param {import('rolldown').InputOptions} options */
export async function rolldown(options) {
  const plugins = [options.plugins ?? []].flat();
  const execution = plugins.some(plugin => v.is(Execution, plugin));
  const started = performance.now();
  const built = await bundler({ ...options, plugins: [inputRecorderPlugin({ execution }), ...plugins] });
  /** @param {import('rolldown').RolldownOutput} result */
  const recorded = result => {
    recordBundle(result, { execution });
    const input = options.input;
    if (process.env.GITHUB_ACTIONS === 'true') console.info(`author timing: ${JSON.stringify({ pid: process.pid, phase: 'project-bundle', entry: typeof input === 'string' ? input : null, execution, seconds: Number(((performance.now() - started) / 1000).toFixed(3)) })}`);
    return result;
  };
  // The bundle keeps private fields, so its methods run on the bundle itself; only generate and write also record.
  return new Proxy(built, { get(target, key) {
    if (key === 'generate' || key === 'write') return async (/** @type {import('rolldown').OutputOptions} */ output) => recorded(await target[key](output));
    const value = Reflect.get(target, key);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
}
