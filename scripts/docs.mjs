// Derived human/agent inventories run separately from game-input generation.
import { resolve } from 'node:path';
import { writePackageApi } from './docs/package-api.mjs';
const root = resolve(import.meta.dirname, '..');
/** @param {string} name @param {()=>unknown} run */
async function step(name, run) {
  const started = performance.now();
  try { return await run(); }
  finally { console.info(`docs-step ${name}: ${((performance.now() - started) / 1000).toFixed(3)}s`); }
}
await step('api', () => writePackageApi(root));
