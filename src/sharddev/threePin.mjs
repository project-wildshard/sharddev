// SHARD-AUTHORING SA8 (J317): `three` is a peer of the sdk, pinned exact. Every `wildshard` (and `sharddev`) run checks,
// before anything else loads (threeGate.mjs), that the `three` this sdk would import is the version it pins, and refuses naming both.
// Plain JS with Node built-ins only: bin/wildshard.mjs imports it first, ahead of the type-stripping hook.
// oxlint-disable-next-line import/no-nodejs-modules -- Read the sdk and three package.json files, as Node would find them.
import { existsSync, readFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- The node_modules folders Node resolves three from.
import { createRequire } from 'node:module';
// oxlint-disable-next-line import/no-nodejs-modules -- Join a node_modules folder and three/package.json.
import { join } from 'node:path';

const FIX = (pin) => `fix: pnpm add three@${pin} --save-exact (GUIDE.md#three-version)`;

/** The refusal for the `three` an sdk at `sdkPackageUrl` (its package.json's URL) resolves, or undefined when it is the
 *  pinned one. The lookup walks the same node_modules folders Node's resolver would, from the sdk's real path. */
export function threeRefusal(sdkPackageUrl) {
  const sdk = JSON.parse(readFileSync(new URL(sdkPackageUrl), 'utf8'));
  const pin = sdk.peerDependencies?.three;
  if (typeof pin !== 'string') return undefined;
  const folders = createRequire(sdkPackageUrl).resolve.paths('three') ?? [];
  const found = folders.map(folder => join(folder, 'three', 'package.json')).find(file => existsSync(file));
  const name = `${sdk.name ?? '@wildshard/sdk'} ${sdk.version ?? ''}`.trim();
  if (found === undefined) return `[three-version] three is not installed, and ${name} needs three ${pin} exactly. ${FIX(pin)}`;
  const installed = JSON.parse(readFileSync(found, 'utf8')).version;
  return installed === pin ? undefined
    : `[three-version] three ${installed} is installed, but ${name} needs three ${pin} exactly. ${FIX(pin)}`;
}
