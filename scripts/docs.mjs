// Derived human/agent inventories run separately from game-input generation.
import { resolve } from 'node:path';
import { quietCli } from '@wildshard/engine/scripts/quiet-cli.mjs';

quietCli('docs');
await import('@wildshard/engine/scripts/bake-loader.mjs');
const root = resolve(import.meta.dirname, '..');
/** @param {string} name @param {()=>unknown} run */
async function step(name, run) {
  const started = performance.now();
  try { return await run(); }
  finally { console.info(`docs-step ${name}: ${((performance.now() - started) / 1000).toFixed(3)}s`); }
}
await step('api', async () => (await import('@wildshard/engine/scripts/gen-api.mjs')).writeApiDocs(root));
await step('host-catalogue', async () => (await import('./gen-host-catalogue.mjs')).writeHostCatalogue(root));
