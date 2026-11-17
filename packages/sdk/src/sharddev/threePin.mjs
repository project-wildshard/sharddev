// SHARD-AUTHORING SA8 (J317): `three` is a peer of the sdk, pinned exact. Every `wildshard` (and `sharddev`) run checks,
// before anything else loads (threeGate.mjs), that the `three` this sdk would import is the version it pins, and refuses
// naming both. Engine still lists its own `three` until it takes it as a peer too, so the copy engine resolves is checked
// as well: two copies at different versions would otherwise pass. Plain JS with Node built-ins only: bin/wildshard.mjs
// imports it first, ahead of the type-stripping hook.
// oxlint-disable-next-line import/no-nodejs-modules -- Read the sdk, engine and three package.json files, as Node finds them.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- The node_modules folders Node resolves a package from.
import { createRequire } from 'node:module';
// oxlint-disable-next-line import/no-nodejs-modules -- Join a node_modules folder and a package.json.
import { join } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve from a package.json's real path.
import { pathToFileURL } from 'node:url';

const FIX = (pin) => `fix: pnpm add three@${pin} --save-exact (GUIDE.md#three-version)`;

/** The package.json of `name` as Node would find it from the file at `from` (a URL), at its real path, if any. */
function found(from, name) {
  const folders = createRequire(from).resolve.paths(name) ?? [];
  const file = folders.map(folder => join(folder, name, 'package.json')).find(candidate => existsSync(candidate));
  return file === undefined ? undefined : realpathSync(file);
}

/** The refusal for the `three` an sdk at `sdkPackageUrl` (its package.json's URL) resolves, or that the engine it
 *  resolves resolves, or undefined when both are the pinned one. The lookup walks the folders Node's resolver would. */
export function threeRefusal(sdkPackageUrl) {
  const sdk = JSON.parse(readFileSync(new URL(sdkPackageUrl), 'utf8'));
  const pin = sdk.peerDependencies?.three;
  if (typeof pin !== 'string') return undefined;
  const name = `${sdk.name ?? '@wildshard/sdk'} ${sdk.version ?? ''}`.trim();
  const own = found(sdkPackageUrl, 'three');
  if (own === undefined) return `[three-version] three is not installed, and ${name} needs three ${pin} exactly. ${FIX(pin)}`;
  const installed = JSON.parse(readFileSync(own, 'utf8')).version;
  if (installed !== pin) return `[three-version] three ${installed} is installed, but ${name} needs three ${pin} exactly. ${FIX(pin)}`;
  const engine = found(sdkPackageUrl, '@wildshard/engine');
  const engines = engine === undefined ? undefined : found(pathToFileURL(engine), 'three');
  const second = engines === undefined ? undefined : JSON.parse(readFileSync(engines, 'utf8')).version;
  return second === undefined || second === pin ? undefined
    : `[three-version] @wildshard/engine loads three ${second}, but ${name} needs three ${pin} exactly. ${FIX(pin)}`;
}
