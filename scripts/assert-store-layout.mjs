// J230: the hosted install must really use the cached global virtual store.
import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';

const modules = JSON.parse(readFileSync('node_modules/.modules.yaml', 'utf8'));
assert.equal(typeof modules.storeDir, 'string');
assert.equal(typeof modules.virtualStoreDir, 'string');
const store = realpathSync(modules.storeDir);
const links = realpathSync(resolve('node_modules', modules.virtualStoreDir));
assert.equal(links, resolve(store, 'links'), 'The installer selected a checkout-local virtual store');
for (const name of ['valibot', 'vite', '@wildshard/engine']) {
  const slot = realpathSync(resolve('node_modules', name));
  assert.ok(slot.startsWith(links + sep), `${name} did not resolve into the registered store`);
  console.log(`global-store-slot ${JSON.stringify({ name, slot })}`);
}
console.log(`global-store-layout ${JSON.stringify({ store, links, runnerCi: process.env.CI })}`);
